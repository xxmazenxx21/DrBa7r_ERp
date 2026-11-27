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
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { PurchaseInvoiceQueryDto } from './dto/purchase-invoice-query.dto';

type Tx = Prisma.TransactionClient;
const ONE = new Prisma.Decimal(1);
const ZERO = new Prisma.Decimal(0);
const q4 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

/** A line as the service needs it (from the API or from a quotation). */
interface InvoiceLineInput {
  productId: string;
  itemUnitId: string;
  quantity: DecimalInput;
  unitCost: DecimalInput;
  discountPercent?: DecimalInput | null;
  discountValue?: DecimalInput | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

/** A whole invoice as the service needs it (from the API or a quotation). */
interface InvoiceInput {
  supplierInvoiceNumber: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  paymentType: PaymentType;
  supplierId: string;
  branchId: string;
  warehouseId: string;
  currencyId?: string;
  exchangeRate?: DecimalInput;
  discountPercent?: DecimalInput | null;
  discountValue?: DecimalInput | null;
  taxPercent?: DecimalInput | null;
  paidAmount?: DecimalInput | null;
  notes: string | null;
  lines: InvoiceLineInput[];
}

/** What convert-to-invoice sends (purchase-quotations module). */
export interface FromQuotationInput {
  paymentType: PaymentType;
  warehouseId?: string;
  invoiceDate: string;
}

/** The quotation (with its lines) that becomes an invoice. */
export interface QuotationForInvoice {
  supplierId: string;
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

const listInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  currency: { select: { id: true, code: true, name: true, symbol: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.PurchaseInvoiceInclude;

const user = { select: { id: true, username: true } };
const detailInclude = {
  supplier: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  currency: { select: { id: true, code: true, name: true, symbol: true } },
  createdByUser: user,
  modifiedByUser: user,
  postedByUser: user,
  cancelledByUser: user,
  convertedFromQuotation: { select: { id: true, code: true } },
  purchaseReturns: {
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
      product: {
        select: {
          id: true,
          code: true,
          name: true,
          itemType: true,
          hasExpiryDate: true,
        },
      },
      itemUnit: { select: { id: true, code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PurchaseInvoiceInclude;

const badRequest = (
  message: string | string[],
  code: ErrorCode,
  field: string,
) => new BadRequestException(errorBody(400, message, code, field));

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly productUnits: ProductUnitsService,
    private readonly stock: StockService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async getActive(id: string) {
    const invoice = await this.prisma.purchaseInvoice.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!invoice) {
      throw new NotFoundException(`Purchase invoice with id ${id} not found`);
    }
    return invoice;
  }

  private getDetail(id: string) {
    return this.prisma.purchaseInvoice.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  /** 400 for a line without expiryDate whose product has hasExpiryDate. */
  private assertExpiryDates(
    lines: { expiryDate?: unknown }[],
    products: { hasExpiryDate: boolean }[],
  ) {
    lines.forEach((line, i) => {
      if (products[i].hasExpiryDate && !line.expiryDate) {
        throw badRequest(
          [
            `lines.${i}.expiryDate is required for this product (hasExpiryDate)`,
          ],
          ErrorCode.VALIDATION_FAILED,
          `lines.${i}.expiryDate`,
        );
      }
    });
  }

  private lineRows(lines: InvoiceLineInput[], resolved: ResolvedLine[]) {
    return lines.map((l, i) => ({
      productId: l.productId,
      itemUnitId: l.itemUnitId,
      unitFactor: resolved[i].unitFactor,
      quantity: l.quantity,
      baseQuantity: resolved[i].baseQuantity,
      unitCost: l.unitCost,
      discountPercent: l.discountPercent ?? null,
      discountValue: l.discountValue ?? null,
      lineTotal: resolved[i].lineTotal,
      batchNumber: l.batchNumber ?? null,
      expiryDate: l.expiryDate ? toDate(l.expiryDate) : null,
      notes: l.notes ?? null,
    }));
  }

  /**
   * Totals (calcTotals) + paid / remaining:
   *   CASH   -> paidAmount = netTotal
   *   CREDIT -> paidAmount 0..netTotal (default 0)
   *   remainingAmount = netTotal - paidAmount
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
   * Checks a whole new invoice and computes everything to save
   * (used by create and createFromQuotation).
   */
  private async build(input: InvoiceInput, checkExpiry: boolean) {
    await assertExists(this.prisma.supplier, 'supplierId', input.supplierId);
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
      input.lines.map((l) => ({ ...l, price: l.unitCost })),
    );
    if (checkExpiry) {
      this.assertExpiryDates(
        input.lines,
        resolved.map((r) => r.product),
      );
    }
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
        supplierInvoiceNumber: input.supplierInvoiceNumber,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        paymentType: input.paymentType,
        supplierId: input.supplierId,
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
   * Saves a built invoice inside `tx`: takes the next PI number (same
   * transaction, so a failed save doesn't use a number) and creates the
   * header with its lines. Shared by create and createFromQuotation.
   */
  private async insertInvoice(
    tx: Tx,
    built: Awaited<ReturnType<PurchaseInvoicesService['build']>>,
    userId: string,
  ) {
    const code = await this.numbering.next(tx, 'PI', built.header.invoiceDate);
    return tx.purchaseInvoice.create({
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

  /** POST /purchase-invoices: a new DRAFT invoice (no stock effect yet). */
  async create(dto: CreatePurchaseInvoiceDto, userId: string) {
    const built = await this.build(
      {
        supplierInvoiceNumber: dto.supplierInvoiceNumber ?? null,
        invoiceDate: toDate(dto.invoiceDate),
        dueDate: dto.dueDate ? toDate(dto.dueDate) : null,
        paymentType: dto.paymentType,
        supplierId: dto.supplierId,
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
      },
      true,
    );
    const { id } = await this.prisma.$transaction((tx) =>
      this.insertInvoice(tx, built, userId),
    );
    return ok(
      'Purchase invoice created successfully',
      await this.getDetail(id),
    );
  }

  /**
   * Used ONLY by convert-to-invoice (no API here): like create, but the data
   * comes from an ACCEPTED quotation. Runs in the CALLER's transaction, so
   * the new invoice and the quotation's CONVERTED status are saved together.
   * Currency = the default one (rate 1). Expiry dates are NOT required here
   * (a quotation has none): add them by editing the DRAFT; posting checks.
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
    const built = await this.build(
      {
        supplierInvoiceNumber: null,
        invoiceDate: toDate(dto.invoiceDate),
        dueDate: null,
        paymentType: dto.paymentType,
        supplierId: quotation.supplierId,
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
          unitCost: l.unitPrice,
          discountPercent: l.discountPercent,
          discountValue: l.discountValue,
          notes: l.notes,
        })),
      },
      false,
    );
    return this.insertInvoice(tx, built, userId);
  }

  /** GET /purchase-invoices: filters + search, newest first, paginated. */
  async findAll(query: PurchaseInvoiceQueryDto) {
    const search = query.search
      ? { contains: query.search, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.PurchaseInvoiceWhereInput = {
      deletedAt: null,
      supplierId: query.supplierId,
      branchId: query.branchId,
      warehouseId: query.warehouseId,
      status: query.status,
      paymentType: query.paymentType,
      invoiceDate: dateFilter(query.dateFrom, query.dateTo),
      ...(search && {
        OR: [
          { code: search },
          { supplierInvoiceNumber: search },
          { supplier: { name: search } },
          { notes: search },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchaseInvoice.findMany({
        where,
        include: listInclude,
        orderBy: [{ invoiceDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return ok(
      'Purchase invoices returned successfully',
      paginated(items, total, query),
    );
  }

  /** GET /purchase-invoices/:id: header + lines + its purchase returns. */
  async findOne(id: string) {
    await this.getActive(id);
    return ok(
      'Purchase invoice returned successfully',
      await this.getDetail(id),
    );
  }

  /**
   * PATCH /purchase-invoices/:id: DRAFT only (409 INVALID_STATUS otherwise).
   * "lines", when sent, REPLACES all lines. Totals and paid / remaining are
   * always computed again. Only the parts that changed are re-checked.
   */
  async update(id: string, dto: UpdatePurchaseInvoiceDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This invoice is ${current.status}: only a DRAFT invoice can be edited`,
      );
    }

    const branchId = dto.branchId ?? current.branchId;
    const warehouseId = dto.warehouseId ?? current.warehouseId;
    if (dto.supplierId !== undefined) {
      await assertExists(this.prisma.supplier, 'supplierId', dto.supplierId);
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

    let resolved: ResolvedLine[] | null = null;
    if (dto.lines) {
      resolved = await resolveLines(
        this.prisma,
        this.productUnits,
        dto.lines.map((l) => ({ ...l, price: l.unitCost })),
      );
      this.assertExpiryDates(
        dto.lines,
        resolved.map((r) => r.product),
      );
    }
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
      const claimed = await tx.purchaseInvoice.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: { modifiedBy: userId },
      });
      if (claimed.count === 0) {
        throw invalidStatus('Only a DRAFT invoice can be edited');
      }
      await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierInvoiceNumber: dto.supplierInvoiceNumber,
          invoiceDate,
          dueDate,
          paymentType,
          supplierId: dto.supplierId,
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
    return ok(
      'Purchase invoice updated successfully',
      await this.getDetail(id),
    );
  }

  /** DELETE /purchase-invoices/:id: soft delete, DRAFT only. */
  async remove(id: string) {
    await this.getActive(id);
    const deleted = await this.prisma.purchaseInvoice.updateMany({
      where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      throw invalidStatus(
        'Only a DRAFT invoice can be deleted (cancel a POSTED invoice instead)',
      );
    }
    return ok('Purchase invoice deleted successfully', null);
  }

  // ------------------------------------------------------------ post / cancel

  /**
   * POST /purchase-invoices/:id/post  (ترحيل) - all in ONE transaction:
   * 1. DRAFT -> POSTED with a conditional update. 0 rows changed = it wasn't
   *    DRAFT -> 409 INVALID_STATUS (pressing the button twice can't post twice).
   * 2. Each line, sorted by productId (same lock order everywhere = no
   *    deadlock):
   *    - SERVICE product: nothing (no stock).
   *    - otherwise: cost of one piece in the default currency
   *        stockUnitCost = lineTotal x (1 - discountValue / subTotal)
   *                        x exchangeRate / baseQuantity
   *      saved on the line, then StockService.stockIn (PURCHASE movement).
   *    Example: 1500 x (1 - 150/1500) x 1 / 120 = 11.25
   * Tax is not part of the stock cost.
   */
  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseInvoice.updateMany({
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

      const invoice = await tx.purchaseInvoice.findUniqueOrThrow({
        where: { id },
        include: {
          lines: { include: { product: true }, orderBy: { id: 'asc' } },
        },
      });
      await assertExists(tx.inventory, 'warehouseId', invoice.warehouseId);

      // the share of every line that is left after the document discount
      const keep = invoice.subTotal.gt(0)
        ? ONE.minus(invoice.discountValue.div(invoice.subTotal))
        : ONE;
      const ordered = invoice.lines
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            a.line.productId.localeCompare(b.line.productId) ||
            a.line.id.localeCompare(b.line.id),
        );

      for (const { line, index } of ordered) {
        await inLine(index, async () => {
          if (line.product.deletedAt) throw doesNotExist('productId');
          if (line.product.itemType === ItemType.SERVICE) return;
          if (line.product.hasExpiryDate && !line.expiryDate) {
            throw badRequest(
              [
                `lines.${index}.expiryDate is required for this product (hasExpiryDate)`,
              ],
              ErrorCode.VALIDATION_FAILED,
              'expiryDate',
            );
          }
          const stockUnitCost = q4(
            line.lineTotal
              .mul(keep)
              .mul(invoice.exchangeRate)
              .div(line.baseQuantity),
          );
          await tx.purchaseInvoiceLine.update({
            where: { id: line.id },
            data: { stockUnitCost },
          });
          await this.stock.stockIn(tx, {
            productId: line.productId,
            warehouseId: invoice.warehouseId,
            quantity: line.baseQuantity,
            unitCost: stockUnitCost,
            type: StockMovementType.PURCHASE,
            userId,
            sourceType: 'PI',
            sourceId: invoice.id,
            sourceLineId: line.id,
            sourceCode: invoice.code,
          });
        });
      }
    });
    return ok('Purchase invoice posted successfully', await this.getDetail(id));
  }

  /**
   * POST /purchase-invoices/:id/cancel  (إلغاء) - all in ONE transaction:
   * 1. POSTED -> CANCELLED (+ cancelledBy / cancelledDate) with a conditional
   *    update; not POSTED -> 409 INVALID_STATUS.
   * 2. Every PURCHASE movement this invoice wrote is taken out again with
   *    StockService.stockOut (PURCHASE_CANCEL), same quantity. If some of the
   *    goods were already used -> 400 INSUFFICIENT_STOCK and NOTHING changes.
   * Nothing else changes (totals, lines, stockUnitCost stay as they were).
   * Refused (400) while a POSTED purchase return points to the invoice:
   * cancel the return first. (A return being posted locks the invoice row,
   * so the two can't happen at the same moment.)
   */
  async cancel(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.purchaseInvoice.updateMany({
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

      const postedReturns = await tx.purchaseReturn.count({
        where: {
          purchaseInvoiceId: id,
          status: DocumentStatus.POSTED,
          deletedAt: null,
        },
      });
      if (postedReturns > 0) {
        throw badRequest(
          `This invoice has ${postedReturns} POSTED purchase return(s): cancel the return(s) first`,
          ErrorCode.BAD_REQUEST,
          'status',
        );
      }

      const invoice = await tx.purchaseInvoice.findUniqueOrThrow({
        where: { id },
        include: { lines: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      const movements = await tx.stockMovement.findMany({
        where: {
          sourceType: 'PI',
          sourceId: id,
          type: StockMovementType.PURCHASE,
        },
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
      });
      for (const movement of movements) {
        const index = invoice.lines.findIndex(
          (l) => l.id === movement.sourceLineId,
        );
        await inLine(index, () =>
          this.stock.stockOut(tx, {
            productId: movement.productId,
            warehouseId: movement.warehouseId,
            quantity: movement.quantity,
            type: StockMovementType.PURCHASE_CANCEL,
            userId,
            sourceType: 'PI',
            sourceId: invoice.id,
            sourceLineId: movement.sourceLineId ?? undefined,
            sourceCode: invoice.code,
          }),
        );
      }
    });
    return ok(
      'Purchase invoice cancelled successfully',
      await this.getDetail(id),
    );
  }

  /**
   * GET /purchase-invoices/:id/returnable: for every line, in the line's
   * unit: bought (quantity), already returned, still returnable.
   * returned = sum of the POSTED (not deleted) purchase-return lines that
   * point to the line (DRAFT returns don't count yet).
   */
  async returnable(id: string) {
    await this.getActive(id);
    const invoice = await this.getDetail(id);
    const rows = await this.prisma.purchaseReturnLine.groupBy({
      by: ['purchaseInvoiceLineId'],
      where: {
        purchaseInvoiceLineId: { in: invoice.lines.map((l) => l.id) },
        purchaseReturn: { status: DocumentStatus.POSTED, deletedAt: null },
      },
      _sum: { quantity: true },
    });
    const returned = new Map(
      rows.map((r) => [r.purchaseInvoiceLineId, r._sum.quantity ?? ZERO]),
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
