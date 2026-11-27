import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import {
  DocumentStatus,
  StockMovementType,
} from '../../generated/prisma/enums.js';
import { NumberingService } from '../numbering/numbering.service';
import { ProductUnitsService } from '../product-units/product-units.service';
import { StockService } from '../stock/stock.service';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertExists } from '../utils/exists/assert-exists';
import { pageArgs, paginated } from '../utils/pagination/pagination';
import { DecimalInput } from '../utils/document/document-totals';
import {
  dateFilter,
  inLine,
  invalidStatus,
  toDate,
} from '../utils/document/document-lines';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { UpdateStockTransferDto } from './dto/update-stock-transfer.dto';
import { StockTransferQueryDto } from './dto/stock-transfer-query.dto';

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);
const q4 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

interface TransferLineInput {
  productId: string;
  itemUnitId: string;
  quantity: DecimalInput;
  notes?: string | null;
}

interface TransferInput {
  transferDate: Date;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string | null;
  lines: TransferLineInput[];
}

const warehouse = {
  select: {
    id: true,
    name: true,
    branch: { select: { id: true, code: true, name: true } },
  },
};

const listInclude = {
  fromWarehouse: warehouse,
  toWarehouse: warehouse,
  _count: { select: { lines: true } },
} satisfies Prisma.StockTransferInclude;

const user = { select: { id: true, username: true } };
const detailInclude = {
  fromWarehouse: warehouse,
  toWarehouse: warehouse,
  createdByUser: user,
  modifiedByUser: user,
  postedByUser: user,
  cancelledByUser: user,
  lines: {
    include: {
      product: { select: { id: true, code: true, name: true, itemType: true } },
      itemUnit: { select: { id: true, code: true, name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.StockTransferInclude;

const badRequest = (message: string, code: ErrorCode, field: string) =>
  new BadRequestException(errorBody(400, message, code, field));

/**
 * Stock transfers (التحويلات المخزنية) - ONE step (Week 3 decision 1): posting
 * takes the goods out of the source warehouse and puts them into the
 * destination in the same transaction. There is no "in transit".
 */
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly productUnits: ProductUnitsService,
    private readonly stock: StockService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async getActive(id: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: { id: 'asc' } } },
    });
    if (!transfer) {
      throw new NotFoundException(`Stock transfer with id ${id} not found`);
    }
    return transfer;
  }

  private getDetail(id: string) {
    return this.prisma.stockTransfer.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  /** Both warehouses active, and not the same one. */
  private async assertWarehouses(
    db: Tx,
    fromWarehouseId: string,
    toWarehouseId: string,
  ) {
    await assertExists(db.inventory, 'fromWarehouseId', fromWarehouseId);
    await assertExists(db.inventory, 'toWarehouseId', toWarehouseId);
    if (fromWarehouseId === toWarehouseId) {
      throw badRequest(
        'toWarehouseId must be different from fromWarehouseId',
        ErrorCode.BAD_REQUEST,
        'toWarehouseId',
      );
    }
  }

  /** A line's product must be an active STOCK product (errors on lines.N.productId). */
  private async assertStockProduct(db: Tx, index: number, productId: string) {
    await inLine(index, async () => {
      await assertExists(db.product, 'productId', productId);
      await this.stock.assertNotService(db, productId);
    });
  }

  /**
   * Locks the two warehouse rows (Inventory) until the transaction ends,
   * ALWAYS in id order. Two opposite transfers (A -> B and B -> A) then wait
   * for each other instead of each locking half of the stock rows and
   * deadlocking.
   *
   * FOR NO KEY UPDATE (not FOR UPDATE): it blocks the other transfers just the
   * same, but not the foreign-key check every insert of a StockMovement /
   * ProductInventory row does on its warehouse (FOR KEY SHARE). With FOR
   * UPDATE, an invoice posting in the same warehouse could deadlock with the
   * transfer (it holds a stock row the transfer waits for, and waits for the
   * warehouse row the transfer holds).
   */
  private async lockWarehouses(tx: Tx, a: string, b: string) {
    for (const id of [a, b].sort()) {
      await tx.$executeRaw`SELECT 1 FROM "Inventory" WHERE "id" = ${id} FOR NO KEY UPDATE`;
    }
  }

  /**
   * Checks a whole transfer and computes the lines (create + update):
   *   - both warehouses active (400 DOES_NOT_EXIST fromWarehouseId /
   *     toWarehouseId) and different (400 BAD_REQUEST field toWarehouseId)
   *   - each line: an active STOCK product (SERVICE -> 400 lines.N.productId),
   *     a unit of that product (getUnitFactor -> 400 lines.N.itemUnitId),
   *     baseQuantity = quantity x factor
   * No prices, no totals: the cost is known only when the goods leave (post).
   */
  private async build(input: TransferInput) {
    await this.assertWarehouses(
      this.prisma,
      input.fromWarehouseId,
      input.toWarehouseId,
    );
    const lineRows: Prisma.StockTransferLineCreateWithoutStockTransferInput[] =
      [];
    for (const [i, line] of input.lines.entries()) {
      await this.assertStockProduct(this.prisma, i, line.productId);
      const unitFactor = await inLine(i, () =>
        this.productUnits.getUnitFactor(line.productId, line.itemUnitId),
      );
      const quantity = new Prisma.Decimal(line.quantity);
      lineRows.push({
        product: { connect: { id: line.productId } },
        itemUnit: { connect: { id: line.itemUnitId } },
        unitFactor,
        quantity,
        baseQuantity: q4(quantity.mul(unitFactor)),
        notes: line.notes ?? null,
      });
    }
    return {
      header: {
        transferDate: input.transferDate,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        notes: input.notes,
      },
      lineRows,
    };
  }

  // ------------------------------------------------------------ CRUD

  /** POST /stock-transfers: a new DRAFT transfer (no stock effect yet). */
  async create(dto: CreateStockTransferDto, userId: string) {
    const built = await this.build({
      transferDate: toDate(dto.transferDate),
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      notes: dto.notes ?? null,
      lines: dto.lines,
    });
    const { id } = await this.prisma.$transaction(async (tx) => {
      const code = await this.numbering.next(
        tx,
        'ST',
        built.header.transferDate,
      );
      return tx.stockTransfer.create({
        data: {
          ...built.header,
          code,
          createdBy: userId,
          lines: { create: built.lineRows },
        },
        select: { id: true },
      });
    });
    return ok('Stock transfer created successfully', await this.getDetail(id));
  }

  /** GET /stock-transfers: filters + search, newest first, paginated. */
  async findAll(query: StockTransferQueryDto) {
    const search = query.search
      ? { contains: query.search, mode: 'insensitive' as const }
      : undefined;
    const where: Prisma.StockTransferWhereInput = {
      deletedAt: null,
      fromWarehouseId: query.fromWarehouseId,
      toWarehouseId: query.toWarehouseId,
      status: query.status,
      transferDate: dateFilter(query.dateFrom, query.dateTo),
      ...(search && { OR: [{ code: search }, { notes: search }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: listInclude,
        orderBy: [{ transferDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return ok(
      'Stock transfers returned successfully',
      paginated(items, total, query),
    );
  }

  /** GET /stock-transfers/:id: header + lines + both warehouses (with branch). */
  async findOne(id: string) {
    await this.getActive(id);
    return ok('Stock transfer returned successfully', await this.getDetail(id));
  }

  /**
   * PATCH /stock-transfers/:id: DRAFT only. The request is merged with what
   * is saved and checked again like a create. "lines", when sent, REPLACES
   * all lines.
   */
  async update(id: string, dto: UpdateStockTransferDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This transfer is ${current.status}: only a DRAFT transfer can be edited`,
      );
    }
    const built = await this.build({
      transferDate: dto.transferDate
        ? toDate(dto.transferDate)
        : current.transferDate,
      fromWarehouseId: dto.fromWarehouseId ?? current.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId ?? current.toWarehouseId,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      lines:
        dto.lines ??
        current.lines.map((l) => ({
          productId: l.productId,
          itemUnitId: l.itemUnitId,
          quantity: l.quantity,
          notes: l.notes,
        })),
    });
    await this.prisma.$transaction(async (tx) => {
      // Re-check DRAFT INSIDE the transaction (locks the row).
      const claimed = await tx.stockTransfer.updateMany({
        where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
        data: { modifiedBy: userId },
      });
      if (claimed.count === 0) {
        throw invalidStatus('Only a DRAFT transfer can be edited');
      }
      await tx.stockTransfer.update({
        where: { id },
        data: {
          ...built.header,
          lines: { deleteMany: {}, create: built.lineRows },
        },
      });
    });
    return ok('Stock transfer updated successfully', await this.getDetail(id));
  }

  /** DELETE /stock-transfers/:id: soft delete, DRAFT only. */
  async remove(id: string) {
    await this.getActive(id);
    const deleted = await this.prisma.stockTransfer.updateMany({
      where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      throw invalidStatus(
        'Only a DRAFT transfer can be deleted (cancel a POSTED transfer instead)',
      );
    }
    return ok('Stock transfer deleted successfully', null);
  }

  // ------------------------------------------------------------ post / cancel

  /**
   * POST /stock-transfers/:id/post  (ترحيل) - ONE step, ONE transaction:
   * 1. DRAFT -> POSTED with a conditional update (twice -> 409 INVALID_STATUS).
   * 2. Lock both warehouse rows in id order (see lockWarehouses), re-check
   *    the warehouses and the products (still active, still STOCK).
   * 3. Each line, sorted by productId (same lock order everywhere):
   *    a. stockOut(fromWarehouse, TRANSFER_OUT): the pieces leave at the
   *       source's CURRENT average -> unitCost = movement.unitCost
   *       (not enough stock -> 400 INSUFFICIENT_STOCK lines.N.quantity)
   *    b. stockIn(toWarehouse, TRANSFER_IN) at that SAME unitCost
   *    both with sourceType ST + the line's id (sourceLineId).
   *    Save the line's unitCost; header totalCost = sum of the line values
   *    (baseQuantity x unitCost, 2 decimals).
   * All or nothing: one failing line rolls the whole transfer back (DRAFT).
   * Example: 2 cartons (24 brushes) Maadi -> Nasr City at 10.6818:
   *   TRANSFER_OUT -24 in Maadi, TRANSFER_IN +24 in Nasr City, totalCost 256.36.
   */
  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
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
          `This transfer is ${current.status}: only a DRAFT transfer can be posted`,
        );
      }
      const transfer = await tx.stockTransfer.findUniqueOrThrow({
        where: { id },
        include: { lines: { orderBy: { id: 'asc' } } },
      });
      await this.lockWarehouses(
        tx,
        transfer.fromWarehouseId,
        transfer.toWarehouseId,
      );
      await this.assertWarehouses(
        tx,
        transfer.fromWarehouseId,
        transfer.toWarehouseId,
      );

      const ordered = transfer.lines
        .map((line, index) => ({ line, index }))
        .sort(
          (a, b) =>
            a.line.productId.localeCompare(b.line.productId) ||
            a.line.id.localeCompare(b.line.id),
        );
      const source = {
        sourceType: 'ST' as const,
        sourceId: transfer.id,
        sourceCode: transfer.code,
      };
      let totalCost = ZERO;
      for (const { line, index } of ordered) {
        await this.assertStockProduct(tx, index, line.productId);
        const out = await inLine(index, () =>
          this.stock.stockOut(tx, {
            productId: line.productId,
            warehouseId: transfer.fromWarehouseId,
            quantity: line.baseQuantity,
            type: StockMovementType.TRANSFER_OUT,
            userId,
            ...source,
            sourceLineId: line.id,
          }),
        );
        const unitCost = out.movement!.unitCost; // the source average
        await inLine(index, () =>
          this.stock.stockIn(tx, {
            productId: line.productId,
            warehouseId: transfer.toWarehouseId,
            quantity: line.baseQuantity,
            unitCost,
            type: StockMovementType.TRANSFER_IN,
            userId,
            ...source,
            sourceLineId: line.id,
          }),
        );
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { unitCost },
        });
        totalCost = totalCost.plus(out.movement!.totalCost.negated());
      }
      await tx.stockTransfer.update({ where: { id }, data: { totalCost } });
    });
    return ok('Stock transfer posted successfully', await this.getDetail(id));
  }

  /**
   * POST /stock-transfers/:id/cancel  (إلغاء) - the goods go BACK, ONE transaction:
   * 1. POSTED -> CANCELLED (+ cancelledBy / cancelledDate); not POSTED -> 409.
   * 2. The same warehouse lock as post (id order).
   * 3. For each TRANSFER_OUT movement of this transfer (= each STOCK line,
   *    sorted by productId):
   *    a. stockOut(toWarehouse, TRANSFER_IN_CANCEL): the pieces leave the
   *       destination. If it sold / used them meanwhile -> 400
   *       INSUFFICIENT_STOCK (lines.N.quantity) and NOTHING changes.
   *    b. stockIn(fromWarehouse, TRANSFER_OUT_CANCEL) at the TRANSFER_OUT
   *       movement's unitCost = the same cost they left with.
   * Lines, unitCost and totalCost stay as they were (history).
   */
  async cancel(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({
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
          `This transfer is ${current.status}: only a POSTED transfer can be cancelled`,
        );
      }
      const transfer = await tx.stockTransfer.findUniqueOrThrow({
        where: { id },
        include: { lines: { select: { id: true }, orderBy: { id: 'asc' } } },
      });
      await this.lockWarehouses(
        tx,
        transfer.fromWarehouseId,
        transfer.toWarehouseId,
      );
      const movements = await tx.stockMovement.findMany({
        where: {
          sourceType: 'ST',
          sourceId: id,
          type: StockMovementType.TRANSFER_OUT,
        },
        orderBy: [{ productId: 'asc' }, { id: 'asc' }],
      });
      const source = {
        sourceType: 'ST' as const,
        sourceId: transfer.id,
        sourceCode: transfer.code,
      };
      for (const out of movements) {
        const index = transfer.lines.findIndex(
          (l) => l.id === out.sourceLineId,
        );
        const quantity = out.quantity.negated(); // TRANSFER_OUT is negative
        const sourceLineId = out.sourceLineId ?? undefined;
        await inLine(index, () =>
          this.stock.stockOut(tx, {
            productId: out.productId,
            warehouseId: transfer.toWarehouseId,
            quantity,
            type: StockMovementType.TRANSFER_IN_CANCEL,
            userId,
            ...source,
            sourceLineId,
          }),
        );
        await inLine(index, () =>
          this.stock.stockIn(tx, {
            productId: out.productId,
            warehouseId: out.warehouseId, // = fromWarehouseId
            quantity,
            unitCost: out.unitCost, // the cost it left with
            type: StockMovementType.TRANSFER_OUT_CANCEL,
            userId,
            ...source,
            sourceLineId,
          }),
        );
      }
    });
    return ok(
      'Stock transfer cancelled successfully',
      await this.getDetail(id),
    );
  }
}
