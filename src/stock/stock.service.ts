import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  ProductInventory,
  StockMovement,
} from '../../generated/prisma/client.js';
import {
  DocumentType,
  ItemType,
  StockMovementType,
} from '../../generated/prisma/enums.js';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { doesNotExist } from '../utils/exists/assert-exists';
import { pageArgs, paginated } from '../utils/pagination/pagination';
import { DecimalInput } from '../utils/document/document-totals';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { ItemCardQueryDto } from './dto/item-card-query.dto';

type Tx = Prisma.TransactionClient;

/** Where a movement comes from (empty for OPENING / ADJUSTMENT). */
export interface MovementSource {
  sourceType?: DocumentType;
  sourceId?: string;
  sourceLineId?: string;
  sourceCode?: string; // PI-2026-000001
}

interface StockMoveArgs extends MovementSource {
  productId: string;
  warehouseId: string;
  /** In the PRIMARY unit (pieces), > 0. The sign is added here. */
  quantity: DecimalInput;
  type: StockMovementType;
  userId: string; // from @CurrentUser('sub')
  reason?: string | null;
}

export interface StockInArgs extends StockMoveArgs {
  /** Cost of ONE piece, in the default currency. */
  unitCost: DecimalInput;
}

export type StockOutArgs = StockMoveArgs;

/** MovementSource (all optional): a stock count (SC) sets it; PATCH product-inventory doesn't. */
export interface AdjustArgs extends MovementSource {
  productId: string;
  warehouseId: string;
  /** The quantity the warehouse must have now. Not sent = unchanged. */
  newQuantity?: DecimalInput;
  /** The new average cost. Not sent = unchanged. */
  newCost?: DecimalInput | null;
  /** ADJUSTMENT (default, needs a reason when something changes) or OPENING. */
  type?: 'ADJUSTMENT' | 'OPENING';
  reason?: string | null;
  userId: string;
}

export interface StockResult {
  balance: ProductInventory; // the ProductInventory row after the change
  movement: StockMovement | null; // null = nothing changed, nothing written
}

const ZERO = new Prisma.Decimal(0);
const q4 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const m2 = (v: Prisma.Decimal) =>
  v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const dec = (v: DecimalInput) => new Prisma.Decimal(v);

const badRequest = (
  message: string | string[],
  code: ErrorCode,
  field: string,
) => new BadRequestException(errorBody(400, message, code, field));

/**
 * THE ONLY code that writes stock (ProductInventory) and stock movements.
 * Every write = 1) lock the balance row, 2) change it, 3) write ONE movement,
 * all inside the caller's transaction (`tx`), so:
 *   ProductInventory.quantity = SUM(StockMovement.quantity), always.
 * stockIn / stockOut / adjust never open a transaction themselves: the
 * document that calls them does, so the document and its stock change are
 * saved together (or not at all).
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** 400 if the product is a SERVICE item (services have no stock). */
  async assertNotService(db: Tx, productId: string): Promise<void> {
    const product = await db.product.findUnique({
      where: { id: productId },
      select: { itemType: true },
    });
    if (!product) throw doesNotExist('productId');
    if (product.itemType === ItemType.SERVICE) {
      throw badRequest(
        'Service items (SERVICE) have no stock',
        ErrorCode.BAD_REQUEST,
        'productId',
      );
    }
  }

  /**
   * Locks the balance row of (product, warehouse) until the transaction ends
   * (SELECT ... FOR UPDATE): a second stock change of the same product in the
   * same warehouse WAITS, so two sales can never both use the same 10 pieces.
   * `create`: make an empty row (0 / 0) first if there is none.
   * Returns null only when create is false and there is no row.
   */
  private async lockBalance(
    tx: Tx,
    productId: string,
    warehouseId: string,
    create: boolean,
  ): Promise<ProductInventory | null> {
    if (create) {
      // INSERT ... ON CONFLICT DO NOTHING (safe if two requests do it at once)
      await tx.productInventory.createMany({
        data: [{ productId, inventoryId: warehouseId }],
        skipDuplicates: true,
      });
    }
    await tx.$executeRaw`SELECT 1 FROM "ProductInventory" WHERE "productId" = ${productId} AND "inventoryId" = ${warehouseId} FOR UPDATE`;
    return tx.productInventory.findUnique({
      where: {
        productId_inventoryId: { productId, inventoryId: warehouseId },
      },
    });
  }

  private writeMovement(
    tx: Tx,
    data: Prisma.StockMovementUncheckedCreateInput,
  ): Promise<StockMovement> {
    return tx.stockMovement.create({ data });
  }

  private source(args: MovementSource) {
    return {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceLineId: args.sourceLineId,
      sourceCode: args.sourceCode,
    };
  }

  /**
   * STOCK IN (purchase, cancel of a return...): adds `quantity` pieces at
   * `unitCost` each and computes the NEW weighted average cost:
   *   newAvg = (oldQty x oldAvg + qty x unitCost) / (oldQty + qty)
   * e.g. 100 @ 10 + 120 @ 11.25 -> 220 @ 10.6818
   * Writes a + movement.
   */
  async stockIn(tx: Tx, args: StockInArgs): Promise<StockResult> {
    const qty = q4(dec(args.quantity));
    const cost = q4(dec(args.unitCost));
    if (qty.lte(0)) {
      throw badRequest(
        'quantity must be greater than 0',
        ErrorCode.BAD_REQUEST,
        'quantity',
      );
    }
    if (cost.lt(0)) {
      throw badRequest(
        'unitCost must not be negative',
        ErrorCode.BAD_REQUEST,
        'unitCost',
      );
    }
    await this.assertNotService(tx, args.productId);

    const row = (await this.lockBalance(
      tx,
      args.productId,
      args.warehouseId,
      true,
    ))!;
    const newQty = row.quantity.plus(qty);
    const newAvg = row.quantity.lte(0)
      ? cost
      : q4(row.quantity.mul(row.costPrice).plus(qty.mul(cost)).div(newQty));

    const balance = await tx.productInventory.update({
      where: { id: row.id },
      data: { quantity: newQty, costPrice: newAvg, deletedAt: null },
    });
    const movement = await this.writeMovement(tx, {
      type: args.type,
      productId: args.productId,
      warehouseId: args.warehouseId,
      quantity: qty,
      unitCost: cost,
      totalCost: m2(qty.mul(cost)),
      balanceAfter: newQty,
      avgCostAfter: newAvg,
      reason: args.reason,
      createdBy: args.userId,
      ...this.source(args),
    });
    return { balance, movement };
  }

  /**
   * STOCK OUT (purchase return, cancel of a purchase...): removes `quantity`
   * pieces. 400 INSUFFICIENT_STOCK if the warehouse has less. The average
   * cost does NOT change (the pieces leave at the current average).
   * Writes a - movement.
   */
  async stockOut(tx: Tx, args: StockOutArgs): Promise<StockResult> {
    const qty = q4(dec(args.quantity));
    if (qty.lte(0)) {
      throw badRequest(
        'quantity must be greater than 0',
        ErrorCode.BAD_REQUEST,
        'quantity',
      );
    }
    const row = await this.lockBalance(
      tx,
      args.productId,
      args.warehouseId,
      false,
    );
    const available = row && row.deletedAt === null ? row.quantity : ZERO;
    if (!row || available.lt(qty)) {
      throw badRequest(
        `Insufficient stock: available ${available.toString()}, requested ${qty.toString()}`,
        ErrorCode.INSUFFICIENT_STOCK,
        'quantity',
      );
    }
    const newQty = available.minus(qty);
    const avg = row.costPrice;

    const balance = await tx.productInventory.update({
      where: { id: row.id },
      data: { quantity: newQty },
    });
    const movement = await this.writeMovement(tx, {
      type: args.type,
      productId: args.productId,
      warehouseId: args.warehouseId,
      quantity: qty.negated(),
      unitCost: avg,
      totalCost: m2(qty.negated().mul(avg)),
      balanceAfter: newQty,
      avgCostAfter: avg,
      reason: args.reason,
      createdBy: args.userId,
      ...this.source(args),
    });
    return { balance, movement };
  }

  /**
   * MANUAL SET: the warehouse now has `newQuantity` pieces at `newCost`
   * (stock count / جرد, wrong opening balance, opening stock).
   * Writes ONE movement with the DIFFERENCE (new - old), e.g. 100 -> 90 = -10.
   * Nothing changed -> no movement. An ADJUSTMENT that changes something
   * needs a `reason` (400 otherwise). Also brings back a soft-deleted row.
   */
  async adjust(tx: Tx, args: AdjustArgs): Promise<StockResult> {
    const type = args.type ?? StockMovementType.ADJUSTMENT;
    const row = (await this.lockBalance(
      tx,
      args.productId,
      args.warehouseId,
      true,
    ))!;
    const oldQty = row.deletedAt === null ? row.quantity : ZERO;

    const newQty =
      args.newQuantity === undefined ? oldQty : q4(dec(args.newQuantity));
    const newCost =
      args.newCost === undefined || args.newCost === null
        ? row.costPrice
        : q4(dec(args.newCost));
    if (newQty.lt(0)) {
      throw badRequest(
        'quantity must not be negative',
        ErrorCode.BAD_REQUEST,
        'quantity',
      );
    }
    if (newCost.lt(0)) {
      throw badRequest(
        'costPrice must not be negative',
        ErrorCode.BAD_REQUEST,
        'costPrice',
      );
    }
    if (newQty.gt(0)) await this.assertNotService(tx, args.productId);

    const diff = newQty.minus(oldQty);
    const changed = !diff.isZero() || !newCost.eq(row.costPrice);
    const reason = args.reason?.trim() || null;
    if (changed && type === StockMovementType.ADJUSTMENT && !reason) {
      throw badRequest(
        ['reason is required when quantity or costPrice changes'],
        ErrorCode.VALIDATION_FAILED,
        'reason',
      );
    }

    const balance = await tx.productInventory.update({
      where: { id: row.id },
      data: { quantity: newQty, costPrice: newCost, deletedAt: null },
    });
    const movement = changed
      ? await this.writeMovement(tx, {
          type,
          productId: args.productId,
          warehouseId: args.warehouseId,
          quantity: diff,
          unitCost: newCost,
          totalCost: m2(diff.mul(newCost)),
          balanceAfter: newQty,
          avgCostAfter: newCost,
          reason,
          createdBy: args.userId,
          ...this.source(args),
        })
      : null;
    return { balance, movement };
  }

  // ------------------------------------------------------------------ reads

  private readonly movementInclude = {
    product: { select: { id: true, code: true, name: true } },
    warehouse: { select: { id: true, name: true } },
    createdByUser: { select: { id: true, username: true } },
  } satisfies Prisma.StockMovementInclude;

  /** "2026-11-30" -> before 2026-12-01 (whole day); a full date-time -> up to it. */
  private dateRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return undefined;
    const range: Prisma.DateTimeFilter = {};
    if (dateFrom) range.gte = new Date(dateFrom);
    if (dateTo) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
        const next = new Date(dateTo);
        next.setUTCDate(next.getUTCDate() + 1);
        range.lt = next;
      } else {
        range.lte = new Date(dateTo);
      }
    }
    return range;
  }

  /** GET /stock-movements: filtered, newest first, paginated. Read only. */
  async findMovements(query: StockMovementQueryDto) {
    const where: Prisma.StockMovementWhereInput = {
      productId: query.productId,
      warehouseId: query.warehouseId,
      type: query.type,
      movementDate: this.dateRange(query.dateFrom, query.dateTo),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: this.movementInclude,
        orderBy: [
          { movementDate: 'desc' },
          { createdDate: 'desc' },
          { id: 'desc' },
        ],
        ...pageArgs(query),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return ok(
      'Stock movements returned successfully',
      paginated(items, total, query),
    );
  }

  /**
   * GET /stock-movements/item-card: كارت الصنف of ONE product in ONE
   * warehouse: every movement OLDEST first, each with the balance after it,
   * plus the current quantity and average cost. Read only.
   * Works for deleted products / warehouses too (their history is kept).
   */
  async itemCard(query: ItemCardQueryDto) {
    const { productId, warehouseId } = query;
    const [product, warehouse] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.inventory.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true },
      }),
    ]);
    if (!product)
      throw new NotFoundException(`Product with ID ${productId} not found`);
    if (!warehouse)
      throw new NotFoundException(`Inventory with id ${warehouseId} not found`);

    const [balance, movements] = await Promise.all([
      this.prisma.productInventory.findUnique({
        where: {
          productId_inventoryId: { productId, inventoryId: warehouseId },
        },
      }),
      this.prisma.stockMovement.findMany({
        where: { productId, warehouseId },
        include: { createdByUser: { select: { id: true, username: true } } },
        orderBy: [
          { movementDate: 'asc' },
          { createdDate: 'asc' },
          { id: 'asc' },
        ],
      }),
    ]);
    return ok('Item card returned successfully', {
      product,
      warehouse,
      quantity: balance?.quantity ?? ZERO,
      avgCost: balance?.costPrice ?? ZERO,
      movements,
    });
  }
}
