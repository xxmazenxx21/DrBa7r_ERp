import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import { QuotationStatus } from '../../generated/prisma/enums.js';
import { NumberingService } from '../numbering/numbering.service';
import { ProductUnitsService } from '../product-units/product-units.service';
import { ok } from '../utils/response/response';
import { assertExists } from '../utils/exists/assert-exists';
import { pageArgs, paginated } from '../utils/pagination/pagination';
import { calcTotals, DecimalInput } from '../utils/document/document-totals';
import {
  assertNotBefore,
  assertWarehouseInBranch,
  dateFilter,
  headerDiscount,
  invalidStatus,
  resolveLines,
  ResolvedLine,
  toDate,
  todayDate,
} from '../utils/document/document-lines';
import { CreatePurchaseQuotationDto } from './dto/create-purchase-quotation.dto';
import { UpdatePurchaseQuotationDto } from './dto/update-purchase-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { PurchaseQuotationQueryDto } from './dto/purchase-quotation-query.dto';
import { PurchaseQuotationLineDto } from './dto/purchase-quotation-line.dto';

const EDITABLE: QuotationStatus[] = [
  QuotationStatus.DRAFT,
  QuotationStatus.SENT,
];

/** Allowed status moves: new status -> the status it must come from. */
const STATUS_FROM: Record<UpdateQuotationStatusDto['status'], QuotationStatus> =
  {
    SENT: QuotationStatus.DRAFT,
    ACCEPTED: QuotationStatus.SENT,
    REJECTED: QuotationStatus.SENT,
  };

const listInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.PurchaseQuotationInclude;

const detailInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, username: true } },
  modifiedByUser: { select: { id: true, username: true } },
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true, itemType: true } },
      itemUnit: { select: { id: true, code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PurchaseQuotationInclude;

/** Adds isExpired: validUntil has passed (compared with today's date). */
const withExpiry = <T extends { validUntil: Date | null }>(q: T) => ({
  ...q,
  isExpired: q.validUntil !== null && q.validUntil < todayDate(),
});

@Injectable()
export class PurchaseQuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly productUnits: ProductUnitsService,
  ) {}

  private async getActive(id: string) {
    const quotation = await this.prisma.purchaseQuotation.findFirst({
      where: { id, deletedAt: null },
      include: { lines: true },
    });
    if (!quotation) {
      throw new NotFoundException(`Purchase quotation with id ${id} not found`);
    }
    return quotation;
  }

  private async getDetail(id: string) {
    const quotation = await this.prisma.purchaseQuotation.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
    return withExpiry(quotation);
  }

  /** Lines from the request -> checked + priced (getUnitFactor + calcLine). */
  private resolve(lines: PurchaseQuotationLineDto[]) {
    return resolveLines(
      this.prisma,
      this.productUnits,
      lines.map((l) => ({ ...l, price: l.unitPrice })),
    );
  }

  /** The rows to save for the lines. */
  private lineRows(
    lines: PurchaseQuotationLineDto[],
    resolved: ResolvedLine[],
  ) {
    return lines.map((l, i) => ({
      productId: l.productId,
      itemUnitId: l.itemUnitId,
      unitFactor: resolved[i].unitFactor,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent ?? null,
      discountValue: l.discountValue ?? null,
      lineTotal: resolved[i].lineTotal,
      notes: l.notes ?? null,
    }));
  }

  /**
   * Header totals with calcTotals. A discountPercent above 0 wins; otherwise
   * the fixed discountValue is used. Returns the values to save.
   */
  private totals(
    lineTotals: DecimalInput[],
    discountPercent: DecimalInput | null | undefined,
    discountValue: DecimalInput | null | undefined,
    taxPercent: DecimalInput | null | undefined,
  ) {
    const discount = headerDiscount(discountPercent, discountValue);
    const totals = calcTotals(
      lineTotals,
      discount.percent,
      discount.value,
      taxPercent,
    );
    return {
      ...totals,
      discountPercent: discount.percent ?? 0,
      taxPercent: taxPercent ?? 0,
    };
  }

  /**
   * POST /purchase-quotations: a new DRAFT quotation with its lines.
   * Checks the supplier, branch and warehouse, prices every line, computes
   * the totals, takes the next PQ number and saves header + lines in ONE
   * transaction.
   */
  async create(dto: CreatePurchaseQuotationDto, userId: string) {
    await assertExists(this.prisma.supplier, 'supplierId', dto.supplierId);
    await assertExists(this.prisma.branch, 'branchId', dto.branchId);
    if (dto.warehouseId) {
      await assertWarehouseInBranch(this.prisma, dto.warehouseId, dto.branchId);
    }
    const quotationDate = toDate(dto.quotationDate);
    const validUntil = dto.validUntil ? toDate(dto.validUntil) : null;
    assertNotBefore(validUntil, quotationDate, 'validUntil', 'quotationDate');

    const resolved = await this.resolve(dto.lines);
    const totals = this.totals(
      resolved.map((l) => l.lineTotal),
      dto.discountPercent,
      dto.discountValue,
      dto.taxPercent,
    );

    const { id } = await this.prisma.$transaction(async (tx) => {
      const code = await this.numbering.next(tx, 'PQ', quotationDate);
      return tx.purchaseQuotation.create({
        data: {
          code,
          quotationDate,
          validUntil,
          supplierId: dto.supplierId,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId ?? null,
          ...totals,
          notes: dto.notes ?? null,
          createdBy: userId,
          lines: { create: this.lineRows(dto.lines, resolved) },
        },
        select: { id: true },
      });
    });
    return ok(
      'Purchase quotation created successfully',
      await this.getDetail(id),
    );
  }

  /** GET /purchase-quotations: filters + search, newest first, paginated. */
  async findAll(query: PurchaseQuotationQueryDto) {
    const search = query.search
      ? { contains: query.search, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.PurchaseQuotationWhereInput = {
      deletedAt: null,
      supplierId: query.supplierId,
      branchId: query.branchId,
      status: query.status,
      quotationDate: dateFilter(query.dateFrom, query.dateTo),
      ...(search && {
        OR: [
          { code: search },
          { supplier: { name: search } },
          { notes: search },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseQuotation.findMany({
        where,
        include: listInclude,
        orderBy: [{ quotationDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.purchaseQuotation.count({ where }),
    ]);
    return ok(
      'Purchase quotations returned successfully',
      paginated(items.map(withExpiry), total, query),
    );
  }

  /** GET /purchase-quotations/:id: header + lines (product, unit) + isExpired. */
  async findOne(id: string) {
    await this.getActive(id);
    return ok(
      'Purchase quotation returned successfully',
      await this.getDetail(id),
    );
  }

  /**
   * PATCH /purchase-quotations/:id: only while DRAFT or SENT (else 409
   * INVALID_STATUS). "lines", when sent, REPLACES all lines (old ones are
   * deleted: a quotation has no effect, so there is nothing to keep).
   * Totals are always computed again. Everything in one transaction.
   */
  async update(id: string, dto: UpdatePurchaseQuotationDto, userId: string) {
    const current = await this.getActive(id);
    if (!EDITABLE.includes(current.status)) {
      throw invalidStatus(
        `This quotation is ${current.status}: only DRAFT or SENT quotations can be edited`,
      );
    }

    const branchId = dto.branchId ?? current.branchId;
    const warehouseId =
      dto.warehouseId !== undefined ? dto.warehouseId : current.warehouseId;
    if (dto.supplierId !== undefined) {
      await assertExists(this.prisma.supplier, 'supplierId', dto.supplierId);
    }
    if (dto.branchId !== undefined) {
      await assertExists(this.prisma.branch, 'branchId', dto.branchId);
    }
    if (
      warehouseId &&
      (dto.warehouseId !== undefined || dto.branchId !== undefined)
    ) {
      await assertWarehouseInBranch(this.prisma, warehouseId, branchId);
    }
    const quotationDate = dto.quotationDate
      ? toDate(dto.quotationDate)
      : current.quotationDate;
    const validUntil =
      dto.validUntil === undefined
        ? current.validUntil
        : dto.validUntil === null
          ? null
          : toDate(dto.validUntil);
    assertNotBefore(validUntil, quotationDate, 'validUntil', 'quotationDate');

    const resolved = dto.lines ? await this.resolve(dto.lines) : null;
    const totals = this.totals(
      resolved
        ? resolved.map((l) => l.lineTotal)
        : current.lines.map((l) => l.lineTotal),
      // a new discountValue alone switches to a fixed discount
      dto.discountPercent !== undefined
        ? dto.discountPercent
        : dto.discountValue !== undefined
          ? 0
          : current.discountPercent,
      dto.discountValue !== undefined
        ? dto.discountValue
        : current.discountValue,
      dto.taxPercent !== undefined ? dto.taxPercent : current.taxPercent,
    );

    await this.prisma.$transaction(async (tx) => {
      // Re-check the status INSIDE the transaction (and lock the row), so a
      // status change at the same moment can't slip in between.
      const claimed = await tx.purchaseQuotation.updateMany({
        where: { id, deletedAt: null, status: { in: EDITABLE } },
        data: { modifiedBy: userId },
      });
      if (claimed.count === 0) {
        throw invalidStatus('Only DRAFT or SENT quotations can be edited');
      }
      await tx.purchaseQuotation.update({
        where: { id },
        data: {
          quotationDate,
          validUntil,
          supplierId: dto.supplierId,
          branchId: dto.branchId,
          warehouseId,
          ...totals,
          notes: dto.notes,
          ...(dto.lines &&
            resolved && {
              lines: {
                deleteMany: {},
                create: this.lineRows(dto.lines, resolved),
              },
            }),
        },
      });
    });
    return ok(
      'Purchase quotation updated successfully',
      await this.getDetail(id),
    );
  }

  /**
   * DELETE /purchase-quotations/:id: soft delete. A CONVERTED quotation (it
   * became an invoice) can't be deleted -> 409 INVALID_STATUS.
   */
  async remove(id: string) {
    await this.getActive(id);
    const deleted = await this.prisma.purchaseQuotation.updateMany({
      where: {
        id,
        deletedAt: null,
        status: { not: QuotationStatus.CONVERTED },
      },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      throw invalidStatus("A CONVERTED quotation can't be deleted");
    }
    return ok('Purchase quotation deleted successfully', null);
  }

  /**
   * PATCH /purchase-quotations/:id/status
   * Allowed: DRAFT -> SENT, SENT -> ACCEPTED, SENT -> REJECTED.
   * Anything else -> 409 INVALID_STATUS. (CONVERTED is set only by
   * convert-to-invoice.) The check and the change are ONE conditional update.
   */
  async changeStatus(id: string, dto: UpdateQuotationStatusDto) {
    const from = STATUS_FROM[dto.status];
    const changed = await this.prisma.purchaseQuotation.updateMany({
      where: { id, deletedAt: null, status: from },
      data: { status: dto.status },
    });
    if (changed.count === 0) {
      const current = await this.getActive(id); // 404 if missing
      throw invalidStatus(
        `Can't change status from ${current.status} to ${dto.status} (allowed: DRAFT -> SENT, SENT -> ACCEPTED or REJECTED)`,
      );
    }
    return ok(
      'Purchase quotation status updated successfully',
      await this.getDetail(id),
    );
  }
}
