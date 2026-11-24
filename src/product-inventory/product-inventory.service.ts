import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductInventoryDto } from './dto/create-product-inventory.dto';
import { UpdateProductInventoryDto } from './dto/update-product-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertExists } from '../utils/exists/assert-exists';
import { StockService } from '../stock/stock.service';

@Injectable()
export class ProductInventoryService {
  constructor(
    private prisma: PrismaService,
    private stock: StockService,
  ) {}

  /**
   * POST /product-inventory/inventory/:inventoryId
   * Puts a product in a warehouse with an opening quantity and cost. The row
   * is created (or a soft-deleted one restored) EMPTY, then StockService.adjust
   * sets the quantity / cost and writes an OPENING movement (رصيد افتتاحي).
   */
  async create(
    inventoryId: string,
    createProductInventoryDto: CreateProductInventoryDto,
    userId: string,
  ) {
    const inventory = await this.prisma.inventory.findUnique({
      where: {
        id: inventoryId,
        deletedAt: null,
      },
    });

    if (!inventory) throw new NotFoundException('Inventory not found');

    const { productId, quantity, costPrice } = createProductInventoryDto;
    // Missing or soft-deleted product -> 400 DOES_NOT_EXIST, field productId.
    await assertExists(this.prisma.product, 'productId', productId);
    // SERVICE items have no stock -> 400.
    await this.stock.assertNotService(this.prisma, productId);

    // One row per product + warehouse (@@unique), deleted rows included.
    const existing = await this.prisma.productInventory.findUnique({
      where: { productId_inventoryId: { productId, inventoryId } },
    });
    if (existing && existing.deletedAt === null) {
      throw new BadRequestException(
        errorBody(
          400,
          'Product inventory already exists',
          ErrorCode.ALREADY_EXISTS,
          'productId',
        ),
      );
    }

    const { balance } = await this.prisma.$transaction((tx) =>
      this.stock.adjust(tx, {
        productId,
        warehouseId: inventoryId,
        newQuantity: quantity,
        newCost: costPrice,
        type: 'OPENING',
        userId,
      }),
    );

    return ok(
      existing
        ? 'Product inventory restored successfully' // was soft-deleted
        : 'Product inventory created successfully',
      balance,
    );
  }

  async findAllByInventoryId(inventoryId: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, deletedAt: null },
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory with id ${inventoryId} not found`);
    }

    const productInventories = await this.prisma.productInventory.findMany({
      where: {
        inventoryId,
        deletedAt: null,
        product: {
          deletedAt: null,
        },
      },
      include: {
        product: {
          include: {
            category: true,
            primaryItemUnit: true,
          },
        },
      },
    });

    return ok('Products in inventory fetched successfully', productInventories);
  }

  async findOne(id: string) {
    const productInventory = await this.prisma.productInventory.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        product: {
          include: {
            category: true,
            primaryItemUnit: true,
          },
        },
        inventory: true,
      },
    });

    if (!productInventory) {
      throw new NotFoundException(`Product inventory with ID ${id} not found`);
    }

    return ok('Product inventory item fetched successfully', productInventory);
  }

  /**
   * PATCH /product-inventory/:id  (manual correction / stock count)
   * Sets quantity and/or costPrice through StockService.adjust, which writes
   * an ADJUSTMENT movement with the difference. "reason" is required when
   * something actually changes.
   */
  async update(
    id: string,
    updateProductInventoryDto: UpdateProductInventoryDto,
    userId: string,
  ) {
    const productInventory = await this.prisma.productInventory.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!productInventory) {
      throw new NotFoundException(`Product inventory with ID ${id} not found`);
    }

    const { balance } = await this.prisma.$transaction((tx) =>
      this.stock.adjust(tx, {
        productId: productInventory.productId,
        warehouseId: productInventory.inventoryId,
        newQuantity: updateProductInventoryDto.quantity,
        newCost: updateProductInventoryDto.costPrice,
        reason: updateProductInventoryDto.reason,
        userId,
      }),
    );

    return ok('Product inventory updated successfully', balance);
  }

  /**
   * DELETE /product-inventory/:id
   * If there is stock, it is first adjusted to 0 (ADJUSTMENT movement, reason
   * "حذف الصنف من المخزن"), then the row is soft-deleted. So a deleted row
   * always has quantity 0 and the item card still adds up.
   */
  async remove(id: string, userId: string) {
    const productInventory = await this.prisma.productInventory.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!productInventory) {
      throw new NotFoundException(`Product inventory with ID ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.stock.adjust(tx, {
        productId: productInventory.productId,
        warehouseId: productInventory.inventoryId,
        newQuantity: 0,
        reason: 'حذف الصنف من المخزن',
        userId,
      });
      await tx.productInventory.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });

    return ok('Product inventory deleted successfully', null);
  }
}
