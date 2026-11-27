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
  PaymentType,
  QuotationStatus,
  StockMovementType,
} from '../../generated/prisma/enums.js';
import { NumberingService } from '../numbering/numbering.service';
import { ProductUnitsService } from '../product-units/product-units.service';
import { StockService } from '../stock/stock.service';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertExists, doesNotExist } from '../utils/exists/assert-exists';
import { pageArgs, paginated } from '../utils/pagination/pagination';
import { calcTotals, DecimalInput } from '../utils/document/document-totals';
import {
  assertNotBefore,
  assertWarehouseInBranch,
  dateFilter,
  headerDiscount,
  inLine,
  invalidStatus,
  resolveLines,
  ResolvedLine,
  toDate,
} from '../utils/document/document-lines';
import { resolveCurrency } from '../utils/document/document-currency';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { SalesInvoiceQueryDto } from './dto/sales-invoice-query.dto';

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const m2 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** What convert-to-invoice sends (ConvertToInvoiceDto of sales-quotations). */
export interface FromQuotationInput {
  paymentType: PaymentType;
  warehouseId?: string;
  invoiceDate: string;
}

/** The sales quotation (with its lines) that becomes an invoice. */
export interface QuotationForInvoice {
  customerId: string;
  branchId: string;
  warehouseId: string | null;
  discountPercent: Prisma.Decimal;
  discountValue: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  notes: string | null;
  lines: {
    productId: string;
    itemUnitId: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    discountPercent: Prisma.Decimal | null;
    discountValue: Prisma.Decimal | null;
    notes: string | null;
  }[];
}

/** A line as the service needs it (from the API or from a quotation). */
interface SalesInvoiceLineInput {
  productId: string;
  itemUnitId: string;
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  discountPercent?: DecimalInput | null;
  discountValue?: DecimalInput | null;
  notes?: string | null;
}

/** A whole invoice as the service needs it (from the API or from a quotation). */
interface SalesInvoiceInput {
  invoiceDate: Date;
  dueDate: Date | null;
  paymentType: PaymentType;
  customerId: string;
  branchId: string;
  warehouseId: string;
  currencyId?: string;
  exchangeRate?: DecimalInput;
  discountPercent?: DecimalInput | null;
  discountValue?: DecimalInput | null;
  taxPercent?: DecimalInput | null;
  paidAmount?: DecimalInput | null;
  notes: string | null;
  lines: SalesInvoiceLineInput[];
}

const listInclude = {
  customer: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  currency: { select: { id: true, code: true, name: true, symbol: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.SalesInvoiceInclude;

const user = { select: { id: true, username: true } };
const detailInclude = {
  customer: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  currency: { select: { id: true, code: true, name: true, symbol: true } },
  createdByUser: user,
  modifiedByUser: user,
  postedByUser: user,
  cancelledByUser: user,
  convertedFromQuotation: { select: { id: true, code: true } },
  salesReturns: {
    where: { deletedAt: null },
    select: {
      id: true,
      code: true,
      returnDate: true,
      status: true,
      netTotal: true,
    },
    orderBy: { createdDate: 'asc' },
  },
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true, itemType: true } },
      itemUnit: { select: { id: true, code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SalesInvoiceInclude;

const badRequest = (
  message: string | string[],
  code: ErrorCode,
  field: string,
) => new BadRequestException(errorBody(400, message, code, field));

/**
 * grossProfit (مجمل الربح), computed, never stored:
 *   (subTotal - discountValue) x exchangeRate - totalCost      (2 decimals)
 * = what we sold for (without tax, in the default currency) minus what the
 * goods cost us. null while DRAFT (there is no cost before posting).
 */
const withGrossProfit = <
  T extends {
    status: DocumentStatus;
    subTotal: Prisma.Decimal;
    discountValue: Prisma.Decimal;
    exchangeRate: Prisma.Decimal;
    totalCost: Prisma.Decimal;
  },
>(
  invoice: T,
) => ({
  ...invoice,
  grossProfit:
    invoice.status === DocumentStatus.DRAFT
      ? null
      : m2(
          invoice.subTotal
            .minus(invoice.discountValue)
            .mul(invoice.exchangeRate)
            .minus(invoice.totalCost),
        ),
});

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly productUnits: ProductUnitsService,
    private readonly stock: StockService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async getActive(id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!invoice) {
      throw new NotFoundException(`Sales invoice with id ${id} not found`);
    }
    return invoice;
  }

  private async getDetail(id: string) {
    const invoice = await this.prisma.salesInvoice.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
    return withGrossProfit(invoice);
  }

  private lineRows(lines: SalesInvoiceLineInput[], resolved: ResolvedLine[]) {
    return lines.map((l, i) => ({
      productId: l.productId,
      itemUnitId: l.itemUnitId,
      unitFactor: resolved[i].unitFactor,
      quantity: l.quantity,
      baseQuantity: resolved[i].baseQuantity,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent ?? null,
      discountValue: l.discountValue ?? null,
      lineTotal: resolved[i].lineTotal,
      notes: l.notes ?? null,
      // stockUnitCost / lineCost stay 0 until the invoice is posted
    }));
  }

  /**
   * Totals (calcTotals) + paid / remaining:
   *   CASH   -> paidAmount = netTotal
   *   CREDIT -> paidAmount 0..netTotal (default 0)
   *   remainingAmount = netTotal - paidAmount (what the customer still owes)
   */
  private totals(
    lineTotals: DecimalInput[],
    discountPercent: DecimalInput | null | undefined,
    discountValue: DecimalInput | null | undefined,
    taxPercent: DecimalInput | null | undefined,
    paymentType: PaymentType,
    paidAmount: DecimalInput | null | undefined,
  ) {
    const discount = headerDiscount(discountPercent, discountValue);
    const t = calcTotals(
      lineTotals,
      discount.percent,
      discount.value,
      taxPercent,
    );
    const paid =
      paymentType === PaymentType.CASH
        ? t.netTotal
        : new Prisma.Decimal(paidAmount ?? 0);
    if (paid.gt(t.netTotal)) {
      throw badRequest(
        `paidAmount must not be more than netTotal (${t.netTotal.toString()})`,
        ErrorCode.BAD_REQUEST,
        'paidAmount',
      );
    }
    return {
      ...t,
      discountPercent: discount.percent ?? 0,
      taxPercent: taxPercent ?? 0,
      paidAmount: paid,
      remainingAmount: t.netTotal.minus(paid),
    };
  }

  /**
   * Checks a whole new invoice and computes everything to save (used by
   * create and createFromQuotation).
   */
  private async build(input: SalesInvoiceInput) {
    await assertExists(this.prisma.customer, 'customerId', input.customerId);
    await assertExists(this.prisma.branch, 'branchId', input.branchId);
    await assertWarehouseInBranch(
      this.prisma,
      input.warehouseId,
      input.branchId,
    );
    assertNotBefore(input.dueDate, input.invoiceDate, 'dueDate', 'invoiceDate');
    const currency = await resolveCurrency(
      this.prisma,
      input.currencyId,
      input.exchangeRate,
    );

    const resolved = await resolveLines(
      this.prisma,
      this.productUnits,
      input.lines.map((l) => ({ ...l, price: l.unitPrice })),
    );
    const totals = this.totals(
      resolved.map((r) => r.lineTotal),
      input.discountPercent,
      input.discountValue,
      input.taxPercent,
      input.paymentType,
      input.paidAmount,
    );
    return {
      header: {
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        paymentType: input.paymentType,
        customerId: input.customerId,
        branchId: input.branchId,
        warehouseId: input.warehouseId,
        ...currency,
        ...totals,
        notes: input.notes,
      },
      lineRows: this.lineRows(input.lines, resolved),
    };
  }

  /**
   * Saves a built invoice inside `tx`: takes the next SI number (same
   * transaction, so a failed save doesn't use a number) and creates the
   * header with its lines. Shared by create and createFromQuotation.
   */
  private async insertInvoice(
    tx: Tx,
    built: Awaited<ReturnType<SalesInvoicesService['build']>>,
    userId: string,
  ) {
    const code = await this.numbering.next(tx, 'SI', built.header.invoiceDate);
    return tx.salesInvoice.create({
      data: {
        ...built.header,
        code,
        createdBy: userId,
        lines: { create: built.lineRows },
      },
      select: { id: true, code: true },
    });
  }

  // ------------------------------------------------------------ CRUD

  /** POST /sales-invoices: a new DRAFT invoice (no stock effect yet). */
  async create(dto: CreateSalesInvoiceDto, userId: string) {
    const built = await this.build({
      invoiceDate: toDate(dto.invoiceDate),
      dueDate: dto.dueDate ? toDate(dto.dueDate) : null,
      paymentType: dto.paymentType,
      customerId: dto.customerId,
      branchId: dto.branchId,
      warehouseId: dto.warehouseId,
      currencyId: dto.currencyId,
      exchangeRate: dto.exchangeRate,
      discountPercent: dto.discountPercent,
      discountValue: dto.discountValue,
      taxPercent: dto.taxPercent,
      paidAmount: dto.paidAmount,
      notes: dto.notes ?? null,
      lines: dto.lines,
    });
    const { id } = await this.prisma.$transaction((tx) =>
      this.insertInvoice(tx, built, userId),
    );
    return ok('Sales invoice created successfully', await this.getDetail(id));
  }

  /**
   * Used ONLY by convert-to-invoice (no API here): like create, but the data
   * comes from an ACCEPTED sales quotation (customer, branch, lines,
   * discounts, tax, notes). Runs in the CALLER's transaction, so the new
   * invoice and the quotation's CONVERTED status are saved together.
   * Currency = the default one (rate 1). dueDate = none (edit the DRAFT).
   * The warehouse: dto.warehouseId if sent, else the quotation's; none at
   * all -> 400 VALIDATION_FAILED field warehouseId. build() re-checks
   * everything (customer, branch, warehouse in the branch, products that
   * were deleted since the quotation -> lines.N.productId).
   */
  async createFromQuotation(
    tx: Tx,
    quotation: QuotationForInvoice,
    dto: FromQuotationInput,
    userId: string,
  ) {
    const warehouseId = dto.warehouseId ?? quotation.warehouseId;
    if (!warehouseId) {
      throw badRequest(
        ['warehouseId is required: the quotation has no warehouse'],
        ErrorCode.VALIDATION_FAILED,
        'warehouseId',
      );
    }
    const built = await this.build({
      invoiceDate: toDate(dto.invoiceDate),
      dueDate: null,
      paymentType: dto.paymentType,
      customerId: quotation.customerId,
      branchId: quotation.branchId,
      warehouseId,
      discountPercent: quotation.discountPercent,
      discountValue: quotation.discountValue,
      taxPercent: quotation.taxPercent,
      notes: quotation.notes,
      lines: quotation.lines.map((l) => ({
        productId: l.productId,
        itemUnitId: l.itemUnitId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent,
        discountValue: l.discountValue,
        notes: l.notes,
      })),
    });
    return this.insertInvoice(tx, built, userId);
  }

  /** GET /sales-invoices: filters + search, newest first, paginated. */
  async findAll(query: SalesInvoiceQueryDto) {
    const search = query.search
      ? { contains: query.search, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.SalesInvoiceWhereInput = {
      deletedAt: null,
      customerId: query.customerId,
      branchId: query.branchId,
      warehouseId: query.warehouseId,
      status: query.status,
      paymentType: query.paymentType,
      invoiceDate: dateFilter(query.dateFrom, query.dateTo),
      ...(search && {
        OR: [
          { code: search },
          { customer: { name: search } },
          { notes: search },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.salesInvoice.findMany({
        where,
        include: listInclude,
        orderBy: [{ invoiceDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.salesInvoice.count({ where }),
    ]);
    return ok(
      'Sales invoices returned successfully',
      paginated(items, total, query),
    );
  }

  /** GET /sales-invoices/:id: header + lines + grossProfit + salesReturns. */
  async findOne(id: string) {
    await this.getActive(id);
    return ok('Sales invoice returned successfully', await this.getDetail(id));
  }

  /**
   * PATCH /sales-invoices/:id: DRAFT only (409 INVALID_STATUS otherwise).
   * "lines", when sent, REPLACES all lines. Totals and paid / remaining are
   * always computed again. Only the parts that changed are re-checked.
   */
  async update(id: string, dto: UpdateSalesInvoiceDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This invoice is ${current.status}: only a DRAFT invoice can be edited`,
      );
    }

    const branchId = dto.branchId ?? current.branchId;
    const warehouseId = dto.warehouseId ?? current.warehouseId;
    if (dto.customerId !== undefined) {
      await assertExists(this.prisma.customer, 'customerId', dto.customerId);
    }
    if (dto.branchId !== undefined) {
      await assertExists(this.prisma.branch, 'branchId', dto.branchId);
    }
    if (dto.warehouseId !== undefined || dto.branchId !== undefined) {
      await assertWarehouseInBranch(this.prisma, warehouseId, branchId);
    }
    const invoiceDate = dto.invoiceDate
      ? toDate(dto.invoiceDate)
      : current.invoiceDate;
    const dueDate =
      dto.dueDate === undefined
        ? current.dueDate
        : dto.dueDate === null
          ? null
          : toDate(dto.dueDate);
    assertNotBefore(dueDate, invoiceDate, 'dueDate', 'invoiceDate');

    const currency =
      dto.currencyId !== undefined || dto.exchangeRate !== undefined
        ? await resolveCurrency(
            this.prisma,
            dto.currencyId ?? current.currencyId,
            dto.exchangeRate !== undefined
              ? dto.exchangeRate
              : dto.currencyId !== undefined
                ? undefined
                : current.exchangeRate,
          )
        : {};

    const resolved = dto.lines
      ? await resolveLines(
          this.prisma,
          this.productUnits,
          dto.lines.map((l) => ({ ...l, price: l.unitPrice })),
        )
      : null;
    const paymentType = dto.paymentType ?? current.paymentType;
    const totals = this.totals(
      resolved
        ? resolved.map((r) => r.lineTotal)
        : current.lines.map((l) => l.lineTotal),
      dto.discountPercent !== undefined
        ? dto.discountPercent
        : dto.discountValue !== undefined
          ? 0
          : current.discountPercent,
      dto.discountValue !== undefined
        ? dto.discountValue
        : current.discountValue,
      dto.taxPercent !== undefined ? dto.taxPercent : current.taxPercent,
      paymentType,
      dto.paidAmount !== undefined
        ? dto.paidAmount
        : paymentType === current.paymentType
          ? current.paidAmount
          : 0, // CASH -> CREDIT without paidAmount: nothing paid yet
    );

    await this.prisma.$transaction(async (tx) => {
      // Re-check DRAFT INSIDE the transaction (locks the row): a post at the
      // same moment can't slip in between.
      const claimed = await tx.salesInvoice.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: { modifiedBy: userId },
      });
      if (claimed.count === 0) {
        throw invalidStatus('Only a DRAFT invoice can be edited');
      }
      await tx.salesInvoice.update({
        where: { id },
        data: {
          invoiceDate,
          dueDate,
          paymentType,
          customerId: dto.customerId,
          branchId: dto.branchId,
          warehouseId: dto.warehouseId,
          ...currency,
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
    return ok('Sales invoice updated successfully', await this.getDetail(id));
  }

  /**
   * DELETE /sales-invoices/:id: soft delete, DRAFT only. In ONE transaction:
   * 1. DRAFT -> deleted with a conditional update (0 rows = not DRAFT -> 409).
   * 2. If the invoice came from a quotation (convert-to-invoice), that
   *    quotation goes back to ACCEPTED with convertedToInvoiceId = null, so
   *    it can be converted again. (Cancel of a POSTED invoice does NOT do
   *    this: the quotation stays CONVERTED and keeps the link.)
   */
  async remove(id: string, userId: string) {
    await this.getActive(id);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.salesInvoice.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: { deletedAt: new Date() },
      });
      if (deleted.count === 0) {
        throw invalidStatus(
          'Only a DRAFT invoice can be deleted (cancel a POSTED invoice instead)',
        );
      }
      await tx.salesQuotation.updateMany({
        where: { convertedToInvoiceId: id },
        data: {
          status: QuotationStatus.ACCEPTED,
          convertedToInvoiceId: null,
          modifiedBy: userId,
        },
      });
    });
    return ok('Sales invoice deleted successfully', null);
  }

  // ------------------------------------------------------------ post / cancel

  /**
   * POST /sales-invoices/:id/post  (ترحيل) - the goods LEAVE the warehouse.
   * All in ONE transaction:
   * 1. DRAFT -> POSTED with a conditional update. 0 rows changed = it wasn't
   *    DRAFT -> 404 / 409 INVALID_STATUS (pressing twice can't post twice).
   * 2. Re-check that the warehouse and the products still exist.
   * 3. Lines sorted by productId (same lock order everywhere = no deadlock).
   *    SERVICE lines: nothing (no stock, cost 0).
   * 4. Each STOCK line: StockService.stockOut (SALE movement) at the CURRENT
   *    average cost. Not enough stock -> 400 INSUFFICIENT_STOCK (field
   *    lines.N.quantity) and the whole transaction is rolled back.
   * 5. The cost comes from the movement, never from the client:
   *      stockUnitCost = movement.unitCost
   *      lineCost      = -movement.totalCost (the movement is negative)
   *    and the header totalCost = the sum of lineCost.
   */
  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.salesInvoice.updateMany({
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
          `This invoice is ${current.status}: only a DRAFT invoice can be posted`,
        );
      }

      const invoice = await tx.salesInvoice.findUniqueOrThrow({
        where: { id },
        include: {
          lines: { include: { product: true }, orderBy: { id: 'asc' } },
        },
      });
      await assertExists(tx.inventory, 'warehouseId', invoice.warehouseId);

      const ordered = invoice.lines
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            a.line.productId.localeCompare(b.line.productId) ||
            a.line.id.localeCompare(b.line.id),
        );

      let totalCost = ZERO;
      for (const { line, index } of ordered) {
        await inLine(index, async () => {
          if (line.product.deletedAt) throw doesNotExist('productId');
          if (line.product.itemType === ItemType.SERVICE) return; // cost 0
          const { movement } = await this.stock.stockOut(tx, {
            productId: line.productId,
            warehouseId: invoice.warehouseId,
            quantity: line.baseQuantity,
            type: StockMovementType.SALE,
            userId,
            sourceType: 'SI',
            sourceId: invoice.id,
            sourceLineId: line.id,
            sourceCode: invoice.code,
          });
          const lineCost = movement!.totalCost.negated();
          await tx.salesInvoiceLine.update({
            where: { id: line.id },
            data: { stockUnitCost: movement!.unitCost, lineCost },
          });
          totalCost = totalCost.plus(lineCost);
        });
      }
      await tx.salesInvoice.update({ where: { id }, data: { totalCost } });
    });
    return ok('Sales invoice posted successfully', await this.getDetail(id));
  }

  /**
   * POST /sales-invoices/:id/cancel  (إلغاء) - the goods come BACK.
   * All in ONE transaction:
   * 1. POSTED -> CANCELLED (+ cancelledBy / cancelledDate) with a conditional
   *    update; not POSTED -> 409 INVALID_STATUS.
   * 2. Every SALE movement this invoice wrote is put back with
   *    StockService.stockIn (SALE_CANCEL), same quantity, at the movement's
   *    unitCost = the SAME cost the goods left with (not today's average).
   * Nothing else changes (totals, totalCost, line costs stay as they were).
   * Refused (400, field status) while a POSTED sales return points to the
   * invoice: cancel the return first.
   */
  async cancel(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.salesInvoice.updateMany({
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
          `This invoice is ${current.status}: only a POSTED invoice can be cancelled`,
        );
      }

      // Refused while a POSTED sales return points to this invoice (its
      // goods came back; cancel the return first). A return being posted
      // locks this invoice row, so the two can't happen at the same moment.
      const postedReturns = await tx.salesReturn.count({
        where: {
          salesInvoiceId: id,
          status: DocumentStatus.POSTED,
          deletedAt: null,
        },
      });
      if (postedReturns > 0) {
        throw badRequest(
          `This invoice has ${postedReturns} POSTED sales return(s): cancel the return(s) first`,
          ErrorCode.BAD_REQUEST,
          'status',
        );
      }

      const invoice = await tx.salesInvoice.findUniqueOrThrow({
        where: { id },
        include: { lines: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      const movements = await tx.stockMovement.findMany({
        where: { sourceType: 'SI', sourceId: id, type: StockMovementType.SALE },
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
      });
      for (const movement of movements) {
        const index = invoice.lines.findIndex(
          (l) => l.id === movement.sourceLineId,
        );
        await inLine(index, () =>
          this.stock.stockIn(tx, {
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            quantity: movement.quantity.negated(), // SALE is negative
            unitCost: movement.unitCost, // the cost it left with
            type: StockMovementType.SALE_CANCEL,
            userId,
            sourceType: 'SI',
            sourceId: invoice.id,
            sourceLineId: movement.sourceLineId ?? undefined,
            sourceCode: invoice.code,
          }),
        );
      }
    });
    return ok('Sales invoice cancelled successfully', await this.getDetail(id));
  }

  /**
   * GET /sales-invoices/:id/returnable: for every line, in the line's unit:
   * sold (quantity), already returned, still returnable.
   * returned = sum of the POSTED (not deleted) sales-return lines that
   * point to the line (DRAFT returns don't count yet).
   */
  async returnable(id: string) {
    await this.getActive(id);
    const invoice = await this.getDetail(id);
    const rows = await this.prisma.salesReturnLine.groupBy({
      by: ['salesInvoiceLineId'],
      where: {
        salesInvoiceLineId: { in: invoice.lines.map((l) => l.id) },
        salesReturn: { status: DocumentStatus.POSTED, deletedAt: null },
      },
      _sum: { quantity: true },
    });
    const returned = new Map(
      rows.map((r) => [r.salesInvoiceLineId, r._sum.quantity ?? ZERO]),
    );
    return ok('Returnable quantities returned successfully', {
      invoiceId: invoice.id,
      code: invoice.code,
      status: invoice.status,
      lines: invoice.lines.map((line) => ({
        lineId: line.id,
        productId: line.productId,
        product: line.product,
        itemUnitId: line.itemUnitId,
        itemUnit: line.itemUnit,
        unitFactor: line.unitFactor,
        quantity: line.quantity,
        returnedQuantity: returned.get(line.id) ?? ZERO,
        remainingQuantity: line.quantity.minus(returned.get(line.id) ?? ZERO),
      })),
    });
  }
}
