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
  inLine,
  invalidStatus,
  toDate,
} from '../utils/document/document-lines';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import { UpdateSalesReturnDto } from './dto/update-sales-return.dto';
import { SalesReturnQueryDto } from './dto/sales-return-query.dto';

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const q4 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const m2 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

interface ReturnLineInput {
  salesInvoiceLineId: string;
  quantity: DecimalInput;
  notes?: string | null;
}

interface ReturnInput {
  returnDate: Date;
  reason: string | null;
  salesInvoiceId: string;
  customerId?: string;
  branchId?: string;
  warehouseId?: string;
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
  customer: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  salesInvoice: { select: { id: true, code: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.SalesReturnInclude;

const user = { select: { id: true, username: true } };
const detailInclude = {
  customer: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  salesInvoice: {
    select: { id: true, code: true, invoiceDate: true, status: true },
  },
  createdByUser: user,
  modifiedByUser: user,
  postedByUser: user,
  cancelledByUser: user,
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true, itemType: true } },
      itemUnit: { select: { id: true, code: true, name: true } },
      salesInvoiceLine: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          stockUnitCost: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SalesReturnInclude;

const badRequest = (
  message: string | string[],
  code: ErrorCode,
  field: string | null,
) => new BadRequestException(errorBody(400, message, code, field));

const notPosted = (status: DocumentStatus) =>
  badRequest(
    `salesInvoiceId must be a POSTED invoice (this one is ${status})`,
    ErrorCode.BAD_REQUEST,
    'salesInvoiceId',
  );

/**
 * Sales returns (مرتجعات البيع). The mirror of the LINKED purchase returns,
 * but the stock goes the other way: posting puts the goods BACK in the
 * invoice's warehouse, at the cost they left with (decision 2 + rule 5 of
 * Week 3). Reads the sales-invoice tables directly; does not import the
 * sales-invoices module and never writes invoices.
 */
@Injectable()
export class SalesReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly stock: StockService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async getActive(id: string) {
    const ret = await this.prisma.salesReturn.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!ret) {
      throw new NotFoundException(`Sales return with id ${id} not found`);
    }
    return ret;
  }

  private getDetail(id: string) {
    return this.prisma.salesReturn.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  /**
   * What was already returned per invoice line: the sum of the quantities of
   * POSTED (not deleted) return lines that point to it. `excludeReturnId`:
   * leave out this return (it is being edited / posted right now).
   */
  private async returnedPerLine(
    db: Tx,
    invoiceLineIds: string[],
    excludeReturnId?: string,
  ): Promise<Map<string, Prisma.Decimal>> {
    const rows = await db.salesReturnLine.groupBy({
      by: ['salesInvoiceLineId'],
      where: {
        salesInvoiceLineId: { in: invoiceLineIds },
        salesReturn: {
          status: DocumentStatus.POSTED,
          deletedAt: null,
          ...(excludeReturnId && { id: { not: excludeReturnId } }),
        },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.map((r) => [r.salesInvoiceLineId, r._sum.quantity ?? ZERO]),
    );
  }

  /**
   * THE return rule: for every invoice line,
   *   quantity in this return <= sold - already returned (POSTED returns)
   * otherwise 400 QUANTITY_EXCEEDED (field lines.N.quantity). Several lines
   * of this return pointing to the same invoice line are added together.
   * Checked when the return is saved AND again when it is posted (inside the
   * posting transaction), because two drafts can point to the same line.
   */
  private async assertQuantities(
    db: Tx,
    invoiceLines: InvoiceLineQty[],
    lines: { salesInvoiceLineId: string; quantity: DecimalInput }[],
    excludeReturnId?: string,
  ) {
    const requested = new Map<
      string,
      { total: Prisma.Decimal; index: number }
    >();
    lines.forEach((line, index) => {
      const prev = requested.get(line.salesInvoiceLineId);
      requested.set(line.salesInvoiceLineId, {
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
      const sold = invoiceLines.find((l) => l.id === lineId)!.quantity;
      const already = returned.get(lineId) ?? ZERO;
      const left = sold.minus(already);
      if (total.gt(left)) {
        throw badRequest(
          `Only ${left.toString()} can still be returned on this invoice line (sold ${sold.toString()}, already returned ${already.toString()})`,
          ErrorCode.QUANTITY_EXCEEDED,
          `lines.${index}.quantity`,
        );
      }
    }
  }

  /**
   * Checks a whole return and computes everything to save (create + update):
   *   - salesInvoiceId: an active POSTED invoice (else 400, field
   *     salesInvoiceId). Customer, branch and warehouse = the invoice's
   *     (sent and different -> 400 on that field).
   *   - every line points to a line of THAT invoice (salesInvoiceLineId);
   *     product, unit, factor come from it, and
   *       unitPrice     = invoice lineTotal / quantity (line discount included)
   *       stockUnitCost = the invoice line's stockUnitCost (the cost it left with)
   *   - quantities: see assertQuantities
   *   - discount = this return's share of the invoice discount
   *       (subTotal x invoice.discountValue / invoice.subTotal),
   *     tax = the invoice's taxPercent
   *   - refundAmount 0..netTotal
   */
  private async build(input: ReturnInput, excludeReturnId?: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: input.salesInvoiceId, deletedAt: null },
      include: { lines: true },
    });
    if (!invoice) throw doesNotExist('salesInvoiceId');
    if (invoice.status !== DocumentStatus.POSTED)
      throw notPosted(invoice.status);

    for (const [field, sent, expected, what] of [
      ['customerId', input.customerId, invoice.customerId, 'customer'],
      ['branchId', input.branchId, invoice.branchId, 'branch'],
      ['warehouseId', input.warehouseId, invoice.warehouseId, 'warehouse'],
    ] as const) {
      if (sent !== undefined && sent !== expected) {
        throw badRequest(
          `${field} must be the invoice's ${what}`,
          ErrorCode.BAD_REQUEST,
          field,
        );
      }
    }
    await assertExists(this.prisma.customer, 'customerId', invoice.customerId);
    await assertExists(this.prisma.branch, 'branchId', invoice.branchId);
    await assertWarehouseInBranch(
      this.prisma,
      invoice.warehouseId,
      invoice.branchId,
    );

    const lineRows: Prisma.SalesReturnLineCreateWithoutSalesReturnInput[] =
      await Promise.all(
        input.lines.map((line, i) =>
          inLine(i, () => {
            const source = invoice.lines.find(
              (l) => l.id === line.salesInvoiceLineId,
            );
            if (!source) {
              throw badRequest(
                'salesInvoiceLineId is not a line of salesInvoiceId',
                ErrorCode.BAD_REQUEST,
                'salesInvoiceLineId',
              );
            }
            const quantity = new Prisma.Decimal(line.quantity);
            const unitPrice = q4(source.lineTotal.div(source.quantity));
            return {
              salesInvoiceLine: { connect: { id: source.id } },
              product: { connect: { id: source.productId } },
              itemUnit: { connect: { id: source.itemUnitId } },
              unitFactor: source.unitFactor,
              quantity,
              baseQuantity: q4(quantity.mul(source.unitFactor)),
              unitPrice,
              lineTotal: calcLine(quantity, unitPrice),
              stockUnitCost: source.stockUnitCost,
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

    // totals: the same share of discount as on the invoice, and the same tax
    const lineTotals = lineRows.map((l) => l.lineTotal as Prisma.Decimal);
    const { subTotal } = calcTotals(lineTotals);
    const discountValue = invoice.subTotal.gt(0)
      ? m2(subTotal.mul(invoice.discountValue).div(invoice.subTotal))
      : ZERO;
    const totals = calcTotals(
      lineTotals,
      undefined,
      discountValue,
      invoice.taxPercent,
    );
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
        salesInvoiceId: invoice.id,
        customerId: invoice.customerId,
        branchId: invoice.branchId,
        warehouseId: invoice.warehouseId,
        ...totals,
        discountPercent: invoice.discountPercent,
        taxPercent: invoice.taxPercent,
        refundAmount,
        notes: input.notes,
      },
      lineRows,
    };
  }

  // ------------------------------------------------------------ CRUD

  /** POST /sales-returns: a new DRAFT return (no stock effect yet). */
  async create(dto: CreateSalesReturnDto, userId: string) {
    const built = await this.build({
      returnDate: toDate(dto.returnDate),
      reason: dto.reason ?? null,
      salesInvoiceId: dto.salesInvoiceId,
      customerId: dto.customerId,
      branchId: dto.branchId,
      warehouseId: dto.warehouseId,
      refundAmount: dto.refundAmount,
      notes: dto.notes ?? null,
      lines: dto.lines,
    });
    const { id } = await this.prisma.$transaction(async (tx) => {
      const code = await this.numbering.next(tx, 'SR', built.header.returnDate);
      return tx.salesReturn.create({
        data: {
          ...built.header,
          code,
          createdBy: userId,
          lines: { create: built.lineRows },
        },
        select: { id: true },
      });
    });
    return ok('Sales return created successfully', await this.getDetail(id));
  }

  /** GET /sales-returns: filters, newest first, paginated. */
  async findAll(query: SalesReturnQueryDto) {
    const where: Prisma.SalesReturnWhereInput = {
      deletedAt: null,
      customerId: query.customerId,
      salesInvoiceId: query.salesInvoiceId,
      status: query.status,
      returnDate: dateFilter(query.dateFrom, query.dateTo),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesReturn.findMany({
        where,
        include: listInclude,
        orderBy: [{ returnDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return ok(
      'Sales returns returned successfully',
      paginated(items, total, query),
    );
  }

  /** GET /sales-returns/:id: header + lines + the original invoice. */
  async findOne(id: string) {
    await this.getActive(id);
    return ok('Sales return returned successfully', await this.getDetail(id));
  }

  /**
   * PATCH /sales-returns/:id: DRAFT only. The request is merged with what is
   * saved and the WHOLE return is checked and computed again (like a
   * create). "lines", when sent, REPLACES all lines.
   */
  async update(id: string, dto: UpdateSalesReturnDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This return is ${current.status}: only a DRAFT return can be edited`,
      );
    }
    const built = await this.build(
      {
        returnDate: dto.returnDate
          ? toDate(dto.returnDate)
          : current.returnDate,
        reason: dto.reason !== undefined ? dto.reason : current.reason,
        salesInvoiceId: dto.salesInvoiceId ?? current.salesInvoiceId,
        // customer / branch / warehouse always follow the invoice; a value
        // sent is only checked against it
        customerId: dto.customerId,
        branchId: dto.branchId,
        warehouseId: dto.warehouseId,
        refundAmount:
          dto.refundAmount !== undefined
            ? dto.refundAmount
            : current.refundAmount,
        notes: dto.notes !== undefined ? dto.notes : current.notes,
        lines:
          dto.lines ??
          current.lines.map((l) => ({
            salesInvoiceLineId: l.salesInvoiceLineId,
            quantity: l.quantity,
            notes: l.notes,
          })),
      },
      id,
    );

    await this.prisma.$transaction(async (tx) => {
      // Re-check DRAFT INSIDE the transaction (locks the row).
      const claimed = await tx.salesReturn.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: { modifiedBy: userId },
      });
      if (claimed.count === 0) {
        throw invalidStatus('Only a DRAFT return can be edited');
      }
      await tx.salesReturn.update({
        where: { id },
        data: {
          ...built.header,
          lines: { deleteMany: {}, create: built.lineRows },
        },
      });
    });
    return ok('Sales return updated successfully', await this.getDetail(id));
  }

  /** DELETE /sales-returns/:id: soft delete, DRAFT only. */
  async remove(id: string) {
    await this.getActive(id);
    const deleted = await this.prisma.salesReturn.updateMany({
      where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      throw invalidStatus(
        'Only a DRAFT return can be deleted (cancel a POSTED return instead)',
      );
    }
    return ok('Sales return deleted successfully', null);
  }

  // ------------------------------------------------------------ post / cancel

  /**
   * POST /sales-returns/:id/post  (ترحيل) - the goods COME BACK. ONE transaction:
   * 1. DRAFT -> POSTED with a conditional update (twice -> 409 INVALID_STATUS).
   * 2. Lock the invoice row (SELECT ... FOR UPDATE), so the invoice's cancel
   *    or another return's post waits; check the invoice is still POSTED and
   *    check the quantities AGAIN (another return may have been posted since
   *    this draft was saved).
   * 3. Each STOCK line (sorted by productId = same lock order everywhere):
   *    StockService.stockIn (SALE_RETURN) at the line's stockUnitCost = the
   *    cost the goods LEFT with (not today's average). Save
   *      lineCost  = movement.totalCost (baseQuantity x stockUnitCost, 2 dp)
   *    and the header totalCost = the sum of lineCost.
   *    SERVICE lines: no stock, lineCost 0.
   * Example: 1 carton (12 brushes) of SI-2026-000001 -> SALE_RETURN +12 at
   * 10.6818, lineCost = totalCost = 128.18.
   */
  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.salesReturn.updateMany({
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
      const ret = await tx.salesReturn.findUniqueOrThrow({
        where: { id },
        include: {
          lines: { include: { product: true }, orderBy: { id: 'asc' } },
        },
      });

      await tx.$executeRaw`SELECT 1 FROM "SalesInvoice" WHERE "id" = ${ret.salesInvoiceId} FOR UPDATE`;
      const invoice = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: ret.salesInvoiceId },
        include: { lines: true },
      });
      if (invoice.status !== DocumentStatus.POSTED || invoice.deletedAt) {
        throw notPosted(invoice.status);
      }
      await this.assertQuantities(tx, invoice.lines, ret.lines, ret.id);
      await assertExists(tx.inventory, 'warehouseId', ret.warehouseId);

      const ordered = ret.lines
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            a.line.productId.localeCompare(b.line.productId) ||
            a.line.id.localeCompare(b.line.id),
        );
      let totalCost = ZERO;
      for (const { line, index } of ordered) {
        if (line.product.itemType === ItemType.SERVICE) continue;
        const { movement } = await inLine(index, () =>
          this.stock.stockIn(tx, {
            productId: line.productId,
            warehouseId: ret.warehouseId,
            quantity: line.baseQuantity,
            unitCost: line.stockUnitCost, // the cost it left with
            type: StockMovementType.SALE_RETURN,
            userId,
            sourceType: 'SR',
            sourceId: ret.id,
            sourceLineId: line.id,
            sourceCode: ret.code,
          }),
        );
        const lineCost = movement!.totalCost;
        await tx.salesReturnLine.update({
          where: { id: line.id },
          data: { lineCost },
        });
        totalCost = totalCost.plus(lineCost);
      }
      await tx.salesReturn.update({
        where: { id },
        data: { totalCost },
      });
    });
    return ok('Sales return posted successfully', await this.getDetail(id));
  }

  /**
   * POST /sales-returns/:id/cancel  (إلغاء) - ONE transaction:
   * 1. POSTED -> CANCELLED (+ cancelledBy / cancelledDate); not POSTED -> 409.
   * 2. Every SALE_RETURN movement of this return is taken out again with
   *    StockService.stockOut (SALE_RETURN_CANCEL), same quantity. If the
   *    goods were sold again in the meantime -> 400 INSUFFICIENT_STOCK
   *    (field lines.N.quantity) and NOTHING changes.
   * Totals, lineCost and totalCost stay as they were (history).
   */
  async cancel(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.salesReturn.updateMany({
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
      const ret = await tx.salesReturn.findUniqueOrThrow({
        where: { id },
        include: { lines: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      const movements = await tx.stockMovement.findMany({
        where: {
          sourceType: 'SR',
          sourceId: id,
          type: StockMovementType.SALE_RETURN,
        },
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
      });
      for (const movement of movements) {
        const index = ret.lines.findIndex(
          (l) => l.id === movement.sourceLineId,
        );
        await inLine(index, () =>
          this.stock.stockOut(tx, {
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            quantity: movement.quantity, // SALE_RETURN is positive
            type: StockMovementType.SALE_RETURN_CANCEL,
            userId,
            sourceType: 'SR',
            sourceId: ret.id,
            sourceLineId: movement.sourceLineId ?? undefined,
            sourceCode: ret.code,
          }),
        );
      }
    });
    return ok('Sales return cancelled successfully', await this.getDetail(id));
  }
}
