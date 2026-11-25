import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import {
  DocumentStatus,
  ItemType,
  StockMovementType,
} from '../../generated/prisma/enums.js';
import { NumberingService } from '../numbering/numbering.service';
import { ProductUnitsService } from '../product-units/product-units.service';
import { StockService } from '../stock/stock.service';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertExists, doesNotExist } from '../utils/exists/assert-exists';
import { pageArgs, paginated } from '../utils/pagination/pagination';
import {
  calcLine,
  calcTotals,
  DecimalInput,
} from '../utils/document/document-totals';
import {
  assertWarehouseInBranch,
  dateFilter,
  headerDiscount,
  inLine,
  invalidStatus,
  resolveLines,
  toDate,
} from '../utils/document/document-lines';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { UpdatePurchaseReturnDto } from './dto/update-purchase-return.dto';
import { PurchaseReturnQueryDto } from './dto/purchase-return-query.dto';

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const q4 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const m2 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

interface ReturnLineInput {
  purchaseInvoiceLineId?: string | null;
  productId?: string | null;
  itemUnitId?: string | null;
  quantity: DecimalInput;
  unitCost?: DecimalInput | null;
  notes?: string | null;
}

interface ReturnInput {
  returnDate: Date;
  reason: string | null;
  purchaseInvoiceId: string | null;
  supplierId?: string;
  branchId?: string;
  warehouseId?: string;
  discountPercent?: DecimalInput | null;
  discountValue?: DecimalInput | null;
  taxPercent?: DecimalInput | null;
  refundAmount?: DecimalInput | null;
  notes: string | null;
  lines: ReturnLineInput[];
}

/** An invoice line as the quantity check needs it. */
interface InvoiceLineQty {
  id: string;
  quantity: Prisma.Decimal;
}

const listInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  purchaseInvoice: { select: { id: true, code: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.PurchaseReturnInclude;

const user = { select: { id: true, username: true } };
const detailInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  purchaseInvoice: {
    select: {
      id: true,
      code: true,
      invoiceDate: true,
      status: true,
      supplierInvoiceNumber: true,
    },
  },
  createdByUser: user,
  modifiedByUser: user,
  postedByUser: user,
  cancelledByUser: user,
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true, itemType: true } },
      itemUnit: { select: { id: true, code: true, name: true } },
      purchaseInvoiceLine: {
        select: { id: true, quantity: true, unitCost: true, lineTotal: true },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PurchaseReturnInclude;

const badRequest = (
  message: string | string[],
  code: ErrorCode,
  field: string | null,
) => new BadRequestException(errorBody(400, message, code, field));

@Injectable()
export class PurchaseReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly productUnits: ProductUnitsService,
    private readonly stock: StockService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async getActive(id: string) {
    const ret = await this.prisma.purchaseReturn.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!ret) {
      throw new NotFoundException(`Purchase return with id ${id} not found`);
    }
    return ret;
  }

  private getDetail(id: string) {
    return this.prisma.purchaseReturn.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  /**
   * What was already returned per invoice line: the sum of the quantities of
   * POSTED (not deleted) return lines that point to it. `excludeReturnId`:
   * leave out this return (it is being posted right now).
   */
  private async returnedPerLine(
    db: Tx,
    invoiceLineIds: string[],
    excludeReturnId?: string,
  ): Promise<Map<string, Prisma.Decimal>> {
    const rows = await db.purchaseReturnLine.groupBy({
      by: ['purchaseInvoiceLineId'],
      where: {
        purchaseInvoiceLineId: { in: invoiceLineIds },
        purchaseReturn: {
          status: DocumentStatus.POSTED,
          deletedAt: null,
          ...(excludeReturnId && { id: { not: excludeReturnId } }),
        },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.map((r) => [r.purchaseInvoiceLineId!, r._sum.quantity ?? ZERO]),
    );
  }

  /**
   * THE return rule: for every invoice line,
   *   quantity in this return <= bought - already returned (POSTED returns)
   * otherwise 400 QUANTITY_EXCEEDED. Several lines of this return pointing to
   * the same invoice line are added together. Checked when the return is
   * saved AND again when it is posted (inside the posting transaction),
   * because two draft returns can point to the same line.
   */
  private async assertQuantities(
    db: Tx,
    invoiceLines: InvoiceLineQty[],
    lines: { purchaseInvoiceLineId?: string | null; quantity: DecimalInput }[],
    excludeReturnId?: string,
  ) {
    const requested = new Map<
      string,
      { total: Prisma.Decimal; index: number }
    >();
    lines.forEach((line, index) => {
      if (!line.purchaseInvoiceLineId) return;
      const prev = requested.get(line.purchaseInvoiceLineId);
      requested.set(line.purchaseInvoiceLineId, {
        total: (prev?.total ?? ZERO).plus(new Prisma.Decimal(line.quantity)),
        index: prev?.index ?? index,
      });
    });
    const returned = await this.returnedPerLine(
      db,
      [...requested.keys()],
      excludeReturnId,
    );
    for (const [lineId, { total, index }] of requested) {
      const bought = invoiceLines.find((l) => l.id === lineId)!.quantity;
      const already = returned.get(lineId) ?? ZERO;
      const left = bought.minus(already);
      if (total.gt(left)) {
        throw badRequest(
          `Only ${left.toString()} can still be returned on this invoice line (bought ${bought.toString()}, already returned ${already.toString()})`,
          ErrorCode.QUANTITY_EXCEEDED,
          `lines.${index}.quantity`,
        );
      }
    }
  }

  /**
   * Checks a whole return and computes everything to save
   * (used by create and update).
   *
   * LINKED to an invoice (purchaseInvoiceId):
   *   - the invoice must be POSTED; supplier = the invoice's;
   *     branch / warehouse default to the invoice's
   *   - every line points to one of its lines (purchaseInvoiceLineId); product,
   *     unit and factor come from that line, unitCost = its lineTotal / quantity
   *   - quantities: see assertQuantities
   *   - discount: the invoice's share (subTotal x invoice discount / invoice
   *     subTotal), tax: the invoice's taxPercent
   * NOT linked: the user sends supplier, branch, warehouse, product, unit,
   *   price, discount and tax himself (like an invoice).
   */
  private async build(input: ReturnInput, excludeReturnId?: string) {
    const invoice = input.purchaseInvoiceId
      ? await this.prisma.purchaseInvoice.findFirst({
          where: { id: input.purchaseInvoiceId, deletedAt: null },
          include: { lines: true },
        })
      : null;
    if (input.purchaseInvoiceId && !invoice)
      throw doesNotExist('purchaseInvoiceId');
    if (invoice && invoice.status !== DocumentStatus.POSTED) {
      throw badRequest(
        `purchaseInvoiceId must be a POSTED invoice (this one is ${invoice.status})`,
        ErrorCode.BAD_REQUEST,
        'purchaseInvoiceId',
      );
    }
    if (
      invoice &&
      input.supplierId &&
      input.supplierId !== invoice.supplierId
    ) {
      throw badRequest(
        "supplierId must be the invoice's supplier",
        ErrorCode.BAD_REQUEST,
        'supplierId',
      );
    }

    const supplierId = input.supplierId ?? invoice?.supplierId;
    const branchId = input.branchId ?? invoice?.branchId;
    const warehouseId = input.warehouseId ?? invoice?.warehouseId;
    for (const [field, value] of [
      ['supplierId', supplierId],
      ['branchId', branchId],
      ['warehouseId', warehouseId],
    ] as const) {
      if (!value) {
        throw badRequest(
          [
            `${field} is required for a return that is not linked to an invoice`,
          ],
          ErrorCode.VALIDATION_FAILED,
          field,
        );
      }
    }
    await assertExists(this.prisma.supplier, 'supplierId', supplierId!);
    await assertExists(this.prisma.branch, 'branchId', branchId!);
    await assertWarehouseInBranch(this.prisma, warehouseId!, branchId!);

    let lineRows: Prisma.PurchaseReturnLineCreateWithoutPurchaseReturnInput[];
    if (invoice) {
      lineRows = await Promise.all(
        input.lines.map((line, i) =>
          inLine(i, () => {
            if (!line.purchaseInvoiceLineId) {
              throw badRequest(
                [
                  `lines.${i}.purchaseInvoiceLineId is required for a return linked to an invoice`,
                ],
                ErrorCode.VALIDATION_FAILED,
                'purchaseInvoiceLineId',
              );
            }
            const source = invoice.lines.find(
              (l) => l.id === line.purchaseInvoiceLineId,
            );
            if (!source) {
              throw badRequest(
                'purchaseInvoiceLineId is not a line of purchaseInvoiceId',
                ErrorCode.BAD_REQUEST,
                'purchaseInvoiceLineId',
              );
            }
            const quantity = new Prisma.Decimal(line.quantity);
            const unitCost = q4(source.lineTotal.div(source.quantity));
            return {
              purchaseInvoiceLine: { connect: { id: source.id } },
              product: { connect: { id: source.productId } },
              itemUnit: { connect: { id: source.itemUnitId } },
              unitFactor: source.unitFactor,
              quantity,
              baseQuantity: q4(quantity.mul(source.unitFactor)),
              unitCost,
              lineTotal: calcLine(quantity, unitCost),
              notes: line.notes ?? null,
            };
          }),
        ),
      );
      await this.assertQuantities(
        this.prisma,
        invoice.lines,
        input.lines,
        excludeReturnId,
      );
    } else {
      input.lines.forEach((line, i) => {
        if (line.purchaseInvoiceLineId) {
          throw badRequest(
            [
              `lines.${i}.purchaseInvoiceLineId is only for a return linked to an invoice (send purchaseInvoiceId)`,
            ],
            ErrorCode.VALIDATION_FAILED,
            `lines.${i}.purchaseInvoiceLineId`,
          );
        }
        for (const field of ['productId', 'itemUnitId', 'unitCost'] as const) {
          if (line[field] === undefined || line[field] === null) {
            throw badRequest(
              [
                `lines.${i}.${field} is required for a return that is not linked to an invoice`,
              ],
              ErrorCode.VALIDATION_FAILED,
              `lines.${i}.${field}`,
            );
          }
        }
      });
      const resolved = await resolveLines(
        this.prisma,
        this.productUnits,
        input.lines.map((l) => ({
          productId: l.productId!,
          itemUnitId: l.itemUnitId!,
          quantity: l.quantity,
          price: l.unitCost!,
        })),
      );
      lineRows = input.lines.map((l, i) => ({
        product: { connect: { id: l.productId! } },
        itemUnit: { connect: { id: l.itemUnitId! } },
        unitFactor: resolved[i].unitFactor,
        quantity: l.quantity,
        baseQuantity: resolved[i].baseQuantity,
        unitCost: l.unitCost!,
        lineTotal: resolved[i].lineTotal,
        notes: l.notes ?? null,
      }));
    }

    // totals
    const lineTotals = lineRows.map((l) => l.lineTotal as Prisma.Decimal);
    let totals: ReturnType<typeof calcTotals>;
    let discountPercent: DecimalInput;
    let taxPercent: DecimalInput;
    if (invoice) {
      // the same share of discount as on the invoice, and the same tax
      const { subTotal } = calcTotals(lineTotals);
      const discountValue = invoice.subTotal.gt(0)
        ? m2(subTotal.mul(invoice.discountValue).div(invoice.subTotal))
        : ZERO;
      totals = calcTotals(
        lineTotals,
        undefined,
        discountValue,
        invoice.taxPercent,
      );
      discountPercent = invoice.discountPercent;
      taxPercent = invoice.taxPercent;
    } else {
      const discount = headerDiscount(
        input.discountPercent,
        input.discountValue,
      );
      totals = calcTotals(
        lineTotals,
        discount.percent,
        discount.value,
        input.taxPercent,
      );
      discountPercent = discount.percent ?? 0;
      taxPercent = input.taxPercent ?? 0;
    }
    const refundAmount = new Prisma.Decimal(input.refundAmount ?? 0);
    if (refundAmount.gt(totals.netTotal)) {
      throw badRequest(
        `refundAmount must not be more than netTotal (${totals.netTotal.toString()})`,
        ErrorCode.BAD_REQUEST,
        'refundAmount',
      );
    }

    return {
      header: {
        returnDate: input.returnDate,
        reason: input.reason,
        purchaseInvoiceId: invoice?.id ?? null,
        supplierId: supplierId!,
        branchId: branchId!,
        warehouseId: warehouseId!,
        ...totals,
        discountPercent,
        taxPercent,
        refundAmount,
        notes: input.notes,
      },
      lineRows,
    };
  }

  // ------------------------------------------------------------ CRUD

  /** POST /purchase-returns: a new DRAFT return (no stock effect yet). */
  async create(dto: CreatePurchaseReturnDto, userId: string) {
    const built = await this.build({
      returnDate: toDate(dto.returnDate),
      reason: dto.reason ?? null,
      purchaseInvoiceId: dto.purchaseInvoiceId ?? null,
      supplierId: dto.supplierId,
      branchId: dto.branchId,
      warehouseId: dto.warehouseId,
      discountPercent: dto.discountPercent,
      discountValue: dto.discountValue,
      taxPercent: dto.taxPercent,
      refundAmount: dto.refundAmount,
      notes: dto.notes ?? null,
      lines: dto.lines,
    });
    const { id } = await this.prisma.$transaction(async (tx) => {
      const code = await this.numbering.next(tx, 'PR', built.header.returnDate);
      return tx.purchaseReturn.create({
        data: {
          ...built.header,
          code,
          createdBy: userId,
          lines: { create: built.lineRows },
        },
        select: { id: true },
      });
    });
    return ok('Purchase return created successfully', await this.getDetail(id));
  }

  /** GET /purchase-returns: filters, newest first, paginated. */
  async findAll(query: PurchaseReturnQueryDto) {
    const where: Prisma.PurchaseReturnWhereInput = {
      deletedAt: null,
      supplierId: query.supplierId,
      purchaseInvoiceId: query.purchaseInvoiceId,
      status: query.status,
      returnDate: dateFilter(query.dateFrom, query.dateTo),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseReturn.findMany({
        where,
        include: listInclude,
        orderBy: [{ returnDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);
    return ok(
      'Purchase returns returned successfully',
      paginated(items, total, query),
    );
  }

  /** GET /purchase-returns/:id: header + lines + the original invoice. */
  async findOne(id: string) {
    await this.getActive(id);
    return ok(
      'Purchase return returned successfully',
      await this.getDetail(id),
    );
  }

  /**
   * PATCH /purchase-returns/:id: DRAFT only. The request is merged with what
   * is saved and the WHOLE return is checked and computed again (like a
   * create). "lines", when sent, REPLACES all lines.
   */
  async update(id: string, dto: UpdatePurchaseReturnDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This return is ${current.status}: only a DRAFT return can be edited`,
      );
    }
    // a new invoice brings its own supplier / branch / warehouse defaults
    const relinked = dto.purchaseInvoiceId !== undefined;
    const keep = <T>(value: T | undefined, saved: T) =>
      value !== undefined ? value : relinked ? undefined : saved;

    const built = await this.build(
      {
        returnDate: dto.returnDate
          ? toDate(dto.returnDate)
          : current.returnDate,
        reason: dto.reason !== undefined ? dto.reason : current.reason,
        purchaseInvoiceId: relinked
          ? (dto.purchaseInvoiceId ?? null)
          : current.purchaseInvoiceId,
        supplierId: keep(dto.supplierId, current.supplierId),
        branchId: keep(dto.branchId, current.branchId),
        warehouseId: keep(dto.warehouseId, current.warehouseId),
        discountPercent:
          dto.discountPercent !== undefined
            ? dto.discountPercent
            : dto.discountValue !== undefined
              ? 0
              : current.discountPercent,
        discountValue:
          dto.discountValue !== undefined
            ? dto.discountValue
            : current.discountValue,
        taxPercent:
          dto.taxPercent !== undefined ? dto.taxPercent : current.taxPercent,
        refundAmount:
          dto.refundAmount !== undefined
            ? dto.refundAmount
            : current.refundAmount,
        notes: dto.notes !== undefined ? dto.notes : current.notes,
        lines:
          dto.lines ??
          current.lines.map((l) => ({
            purchaseInvoiceLineId: l.purchaseInvoiceLineId,
            productId: l.productId,
            itemUnitId: l.itemUnitId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            notes: l.notes,
          })),
      },
      id,
    );

    await this.prisma.$transaction(async (tx) => {
      // Re-check DRAFT INSIDE the transaction (locks the row).
      const claimed = await tx.purchaseReturn.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: { modifiedBy: userId },
      });
      if (claimed.count === 0) {
        throw invalidStatus('Only a DRAFT return can be edited');
      }
      await tx.purchaseReturn.update({
        where: { id },
        data: {
          ...built.header,
          lines: { deleteMany: {}, create: built.lineRows },
        },
      });
    });
    return ok('Purchase return updated successfully', await this.getDetail(id));
  }

  /** DELETE /purchase-returns/:id: soft delete, DRAFT only. */
  async remove(id: string) {
    await this.getActive(id);
    const deleted = await this.prisma.purchaseReturn.updateMany({
      where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      throw invalidStatus(
        'Only a DRAFT return can be deleted (cancel a POSTED return instead)',
      );
    }
    return ok('Purchase return deleted successfully', null);
  }

  // ------------------------------------------------------------ post / cancel

  /**
   * POST /purchase-returns/:id/post  (ترحيل) - all in ONE transaction:
   * 1. DRAFT -> POSTED with a conditional update (twice -> 409 INVALID_STATUS).
   * 2. Linked: lock the invoice row (so its cancel, or another return, waits),
   *    check it is still POSTED, and check the quantities AGAIN (another
   *    return may have been posted since this draft was saved).
   * 3. Each STOCK line (sorted by productId): StockService.stockOut
   *    (PURCHASE_RETURN) - the goods leave at the CURRENT average cost and
   *    the average does not change. Not enough stock -> 400 INSUFFICIENT_STOCK
   *    and nothing is posted.
   */
  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseReturn.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: {
          status: DocumentStatus.POSTED,
          postedBy: userId,
          postedDate: new Date(),
        },
      });
      if (claimed.count === 0) {
        const current = await this.getActive(id); // 404 if missing
        throw invalidStatus(
          `This return is ${current.status}: only a DRAFT return can be posted`,
        );
      }
      const ret = await tx.purchaseReturn.findUniqueOrThrow({
        where: { id },
        include: {
          lines: { include: { product: true }, orderBy: { id: 'asc' } },
        },
      });

      if (ret.purchaseInvoiceId) {
        await tx.$executeRaw`SELECT 1 FROM "PurchaseInvoice" WHERE "id" = ${ret.purchaseInvoiceId} FOR UPDATE`;
        const invoice = await tx.purchaseInvoice.findUniqueOrThrow({
          where: { id: ret.purchaseInvoiceId },
          include: { lines: true },
        });
        if (invoice.status !== DocumentStatus.POSTED || invoice.deletedAt) {
          throw badRequest(
            `purchaseInvoiceId must be a POSTED invoice (this one is ${invoice.status})`,
            ErrorCode.BAD_REQUEST,
            'purchaseInvoiceId',
          );
        }
        await this.assertQuantities(tx, invoice.lines, ret.lines, ret.id);
      }
      await assertExists(tx.inventory, 'warehouseId', ret.warehouseId);

      const ordered = ret.lines
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            a.line.productId.localeCompare(b.line.productId) ||
            a.line.id.localeCompare(b.line.id),
        );
      for (const { line, index } of ordered) {
        if (line.product.itemType === ItemType.SERVICE) continue;
        await inLine(index, () =>
          this.stock.stockOut(tx, {
            productId: line.productId,
            warehouseId: ret.warehouseId,
            quantity: line.baseQuantity,
            type: StockMovementType.PURCHASE_RETURN,
            userId,
            sourceType: 'PR',
            sourceId: ret.id,
            sourceLineId: line.id,
            sourceCode: ret.code,
          }),
        );
      }
    });
    return ok('Purchase return posted successfully', await this.getDetail(id));
  }

  /**
   * POST /purchase-returns/:id/cancel  (إلغاء) - all in ONE transaction:
   * 1. POSTED -> CANCELLED (+ cancelledBy / cancelledDate); not POSTED -> 409.
   * 2. Every PURCHASE_RETURN movement of this return is put back with
   *    StockService.stockIn (PURCHASE_RETURN_CANCEL) at the SAME cost it left
   *    with (from the StockMovement).
   */
  async cancel(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseReturn.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.POSTED },
        data: {
          status: DocumentStatus.CANCELLED,
          cancelledBy: userId,
          cancelledDate: new Date(),
        },
      });
      if (claimed.count === 0) {
        const current = await this.getActive(id); // 404 if missing
        throw invalidStatus(
          `This return is ${current.status}: only a POSTED return can be cancelled`,
        );
      }
      const ret = await tx.purchaseReturn.findUniqueOrThrow({
        where: { id },
        include: { lines: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      const movements = await tx.stockMovement.findMany({
        where: {
          sourceType: 'PR',
          sourceId: id,
          type: StockMovementType.PURCHASE_RETURN,
        },
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
      });
      for (const movement of movements) {
        const index = ret.lines.findIndex(
          (l) => l.id === movement.sourceLineId,
        );
        await inLine(index, () =>
          this.stock.stockIn(tx, {
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            quantity: movement.quantity.negated(),
            unitCost: movement.unitCost,
            type: StockMovementType.PURCHASE_RETURN_CANCEL,
            userId,
            sourceType: 'PR',
            sourceId: ret.id,
            sourceLineId: movement.sourceLineId ?? undefined,
            sourceCode: ret.code,
          }),
        );
      }
    });
    return ok(
      'Purchase return cancelled successfully',
      await this.getDetail(id),
    );
  }
}
