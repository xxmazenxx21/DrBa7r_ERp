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
import { assertExists } from '../utils/exists/assert-exists';
import { pageArgs, paginated } from '../utils/pagination/pagination';
import {
  dateFilter,
  inLine,
  invalidStatus,
  toDate,
} from '../utils/document/document-lines';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { UpdateStockCountDto } from './dto/update-stock-count.dto';
import { UpdateStockCountLinesDto } from './dto/update-stock-count-lines.dto';
import { StockCountQueryDto } from './dto/stock-count-query.dto';

const warehouse = {
  select: {
    id: true,
    name: true,
    branch: { select: { id: true, code: true, name: true } },
  },
};

const listInclude = {
  warehouse,
  _count: { select: { lines: true } },
} satisfies Prisma.StockCountInclude;

/** Lines are always shown in product-code order (the order of the count sheet). */
const lineOrder = [
  { product: { code: 'asc' } },
  { id: 'asc' },
] satisfies Prisma.StockCountLineOrderByWithRelationInput[];

const user = { select: { id: true, username: true } };
const detailInclude = {
  warehouse,
  createdByUser: user,
  modifiedByUser: user,
  postedByUser: user,
  lines: {
    include: { product: { select: { id: true, code: true, name: true } } },
    orderBy: lineOrder,
  },
} satisfies Prisma.StockCountInclude;

const badRequest = (message: string, code: ErrorCode, field: string) =>
  new BadRequestException(errorBody(400, message, code, field));

/**
 * Stock counts (الجرد): DRAFT -> POSTED only, NO cancel (Week 3 decision 3; a
 * mistake is fixed with a new count). Flow: open a count (the server makes
 * one line per product of the warehouse) -> type what is on the shelves ->
 * post (one ADJUSTMENT per line that differs).
 */
@Injectable()
export class StockCountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly stock: StockService,
  ) {}

  // ------------------------------------------------------------ helpers

  private async getActive(id: string) {
    const count = await this.prisma.stockCount.findFirst({
      where: { id, deletedAt: null },
      include: { lines: { orderBy: lineOrder } },
    });
    if (!count) {
      throw new NotFoundException(`Stock count with id ${id} not found`);
    }
    return count;
  }

  private getDetail(id: string) {
    return this.prisma.stockCount.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: detailInclude,
    });
  }

  /** Marks the count as edited, only while DRAFT (conditional write = row lock). */
  private async claimDraft(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    action: string,
  ) {
    const claimed = await tx.stockCount.updateMany({
      where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
      data: { modifiedBy: userId },
    });
    if (claimed.count === 0) {
      throw invalidStatus(`Only a DRAFT stock count can be ${action}`);
    }
  }

  // ------------------------------------------------------------ CRUD

  /**
   * POST /stock-counts (فتح جرد): a DRAFT count whose lines the SERVER makes:
   * one per active stock row (ProductInventory) of the warehouse whose
   * product is an active STOCK product, in product-code order, with
   *   systemQuantity = the quantity in the system right now (display only).
   * Nothing to count -> 400 BAD_REQUEST field warehouseId. No stock change.
   * (A product the warehouse never had is added with POST
   * /product-inventory (OPENING), not with a count.)
   */
  async create(dto: CreateStockCountDto, userId: string) {
    await assertExists(this.prisma.inventory, 'warehouseId', dto.warehouseId);
    const rows = await this.prisma.productInventory.findMany({
      where: {
        inventoryId: dto.warehouseId,
        deletedAt: null,
        product: { deletedAt: null, itemType: ItemType.STOCK },
      },
      select: { productId: true, quantity: true },
      orderBy: [{ product: { code: 'asc' } }, { id: 'asc' }],
    });
    if (rows.length === 0) {
      throw badRequest(
        'The warehouse has no products to count',
        ErrorCode.BAD_REQUEST,
        'warehouseId',
      );
    }
    const countDate = toDate(dto.countDate);
    const { id } = await this.prisma.$transaction(async (tx) => {
      const code = await this.numbering.next(tx, 'SC', countDate);
      return tx.stockCount.create({
        data: {
          code,
          countDate,
          warehouseId: dto.warehouseId,
          notes: dto.notes ?? null,
          createdBy: userId,
          lines: {
            create: rows.map((r) => ({
              product: { connect: { id: r.productId } },
              systemQuantity: r.quantity,
            })),
          },
        },
        select: { id: true },
      });
    });
    return ok('Stock count created successfully', await this.getDetail(id));
  }

  /** GET /stock-counts: filters, newest first, paginated. */
  async findAll(query: StockCountQueryDto) {
    const where: Prisma.StockCountWhereInput = {
      deletedAt: null,
      warehouseId: query.warehouseId,
      status: query.status,
      countDate: dateFilter(query.dateFrom, query.dateTo),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockCount.findMany({
        where,
        include: listInclude,
        orderBy: [{ countDate: 'desc' }, { createdDate: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.stockCount.count({ where }),
    ]);
    return ok(
      'Stock counts returned successfully',
      paginated(items, total, query),
    );
  }

  /** GET /stock-counts/:id: header + lines (product { id, code, name }). */
  async findOne(id: string) {
    await this.getActive(id);
    return ok('Stock count returned successfully', await this.getDetail(id));
  }

  /** PATCH /stock-counts/:id: countDate / notes, DRAFT only. */
  async update(id: string, dto: UpdateStockCountDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This stock count is ${current.status}: only a DRAFT stock count can be edited`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await this.claimDraft(tx, id, userId, 'edited');
      await tx.stockCount.update({
        where: { id },
        data: {
          countDate: dto.countDate ? toDate(dto.countDate) : undefined,
          notes: dto.notes,
        },
      });
    });
    return ok('Stock count updated successfully', await this.getDetail(id));
  }

  /**
   * PATCH /stock-counts/:id/lines (إدخال العد), DRAFT only: sets the counted
   * quantity of the lines sent (in pieces, >= 0; null = not counted). Lines
   * not sent keep their value. Every lineId must be a line of THIS count
   * (else 400 field lines.N.lineId). Nothing changes in the stock.
   */
  async updateLines(id: string, dto: UpdateStockCountLinesDto, userId: string) {
    const current = await this.getActive(id);
    if (current.status !== DocumentStatus.DRAFT) {
      throw invalidStatus(
        `This stock count is ${current.status}: only a DRAFT stock count can be counted`,
      );
    }
    const lineIds = new Set(current.lines.map((l) => l.id));
    dto.lines.forEach((line, i) => {
      if (!lineIds.has(line.lineId)) {
        throw badRequest(
          'lineId is not a line of this stock count',
          ErrorCode.BAD_REQUEST,
          `lines.${i}.lineId`,
        );
      }
    });
    await this.prisma.$transaction(async (tx) => {
      await this.claimDraft(tx, id, userId, 'counted');
      for (const line of dto.lines) {
        await tx.stockCountLine.update({
          where: { id: line.lineId },
          data: { countedQuantity: line.countedQuantity },
        });
      }
    });
    return ok(
      'Stock count lines updated successfully',
      await this.getDetail(id),
    );
  }

  /** DELETE /stock-counts/:id: soft delete, DRAFT only. */
  async remove(id: string) {
    await this.getActive(id);
    const deleted = await this.prisma.stockCount.updateMany({
      where: { id, deletedAt: null, status: DocumentStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (deleted.count === 0) {
      throw invalidStatus(
        'Only a DRAFT stock count can be deleted (a POSTED count is final)',
      );
    }
    return ok('Stock count deleted successfully', null);
  }

  // ------------------------------------------------------------ post

  /**
   * POST /stock-counts/:id/post  (ترحيل) - ONE transaction, and FINAL (no cancel):
   * 1. DRAFT -> POSTED with a conditional update (twice -> 409 INVALID_STATUS).
   * 2. At least one line must be counted (else 400 field lines).
   * 3. Each COUNTED line (sorted by productId = same lock order everywhere):
   *    StockService.adjust: the stock becomes countedQuantity, ONE ADJUSTMENT
   *    movement for the difference (reason "جرد SC-...", sourceType SC + the
   *    line), none when there is no difference. The average cost stays.
   *    Saved on the line:
   *      difference = movement.quantity (0 when no movement)
   *      unitCost   = the average at posting (balance.costPrice)
   *    The difference is counted - the balance AT POSTING (adjust reads the
   *    locked balance), NOT counted - systemQuantity: if goods were sold
   *    between opening and posting, the count is still right.
   *    Lines not counted (null) are left alone (difference / unitCost null).
   * Example: Maadi 146, counted 145 -> ADJUSTMENT -1, Maadi 145, difference -1.
   */
  async post(id: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.stockCount.updateMany({
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
          `This stock count is ${current.status}: only a DRAFT stock count can be posted`,
        );
      }
      const count = await tx.stockCount.findUniqueOrThrow({
        where: { id },
        include: { lines: { orderBy: lineOrder } },
      });
      const counted = count.lines
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.countedQuantity !== null);
      if (counted.length === 0) {
        throw badRequest(
          'Count at least one line before posting',
          ErrorCode.BAD_REQUEST,
          'lines',
        );
      }
      await assertExists(tx.inventory, 'warehouseId', count.warehouseId);

      counted.sort(
        (a, b) =>
          a.line.productId.localeCompare(b.line.productId) ||
          a.line.id.localeCompare(b.line.id),
      );
      for (const { line, index } of counted) {
        const { balance, movement } = await inLine(index, () =>
          this.stock.adjust(tx, {
            productId: line.productId,
            warehouseId: count.warehouseId,
            newQuantity: line.countedQuantity!,
            type: StockMovementType.ADJUSTMENT,
            reason: `جرد ${count.code}`,
            userId,
            sourceType: 'SC',
            sourceId: count.id,
            sourceLineId: line.id,
            sourceCode: count.code,
          }),
        );
        await tx.stockCountLine.update({
          where: { id: line.id },
          data: {
            difference: movement?.quantity ?? 0,
            unitCost: balance.costPrice,
          },
        });
      }
    });
    return ok('Stock count posted successfully', await this.getDetail(id));
  }
}
