import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductUnitDto } from './dto/create-product-unit.dto';
import { UpdateProductUnitDto } from './dto/update-product-unit.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertExists, doesNotExist } from '../utils/exists/assert-exists';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';

const ONE = new Prisma.Decimal(1);

@Injectable()
export class ProductUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active product of the URL, or 404 (same message as GET /products/:id). */
  private async getProduct(productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: { primaryItemUnit: true },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }
    return product;
  }

  private async getActive(id: string) {
    const unit = await this.prisma.productUnit.findFirst({
      where: { id, deletedAt: null },
      include: { product: true },
    });
    if (!unit)
      throw new NotFoundException(`Product unit with id ${id} not found`);
    return unit;
  }

  /**
   * itemUnitId must be an active ItemUnit and must NOT be the product's
   * primary unit (that one is always factor 1 and is not stored here).
   */
  private async assertUnitAllowed(
    product: { primaryItemUnitId: string },
    itemUnitId: string,
  ) {
    await assertExists(this.prisma.itemUnit, 'itemUnitId', itemUnitId);
    if (itemUnitId === product.primaryItemUnitId) {
      throw new BadRequestException(
        errorBody(
          400,
          "itemUnitId is the product's primary unit (factor 1); it can't be added as another unit",
          ErrorCode.BAD_REQUEST,
          'itemUnitId',
        ),
      );
    }
  }

  /**
   * POST /products/:productId/units
   * Adds a unit to a product. If the same unit was added before and deleted,
   * the old row is RESTORED with the new values (same id, message "restored").
   */
  async create(productId: string, dto: CreateProductUnitDto) {
    const product = await this.getProduct(productId);
    await this.assertUnitAllowed(product, dto.itemUnitId);

    // One row per product + unit (@@unique), deleted rows included.
    const existing = await this.prisma.productUnit.findUnique({
      where: {
        productId_itemUnitId: { productId, itemUnitId: dto.itemUnitId },
      },
    });
    if (existing && existing.deletedAt === null) {
      throw new ConflictException(
        errorBody(
          409,
          'This unit is already defined for this product',
          ErrorCode.ALREADY_EXISTS,
          'itemUnitId',
        ),
      );
    }
    // A barcode of ANOTHER deleted row -> 409; the restored row's own is fine.
    // Active duplicate -> PrismaExceptionFilter 409 "barcode already exists".
    await assertNotUsedByDeleted(
      this.prisma.productUnit,
      'product unit',
      { barcode: dto.barcode },
      existing?.id,
    );

    const data = {
      factor: dto.factor,
      barcode: dto.barcode ?? null,
      retailPrice: dto.retailPrice ?? null,
    };
    if (existing) {
      const restored = await this.prisma.productUnit.update({
        where: { id: existing.id },
        data: { ...data, deletedAt: null },
        include: { itemUnit: true },
      });
      return ok('Product unit restored successfully', restored);
    }
    const unit = await this.prisma.productUnit.create({
      data: { ...data, productId, itemUnitId: dto.itemUnitId },
      include: { itemUnit: true },
    });
    return ok('Product unit created successfully', unit);
  }

  /**
   * GET /products/:productId/units
   * Every unit the product can be bought / sold in: the primary unit FIRST
   * (factor 1, id null because it's not a ProductUnit row), then the other
   * units by factor. All entries have the same keys.
   */
  async findByProduct(productId: string) {
    const product = await this.getProduct(productId);
    const units = await this.prisma.productUnit.findMany({
      where: { productId, deletedAt: null },
      include: { itemUnit: true },
      orderBy: { factor: 'asc' },
    });
    const list = [
      {
        id: null,
        isPrimary: true,
        productId,
        itemUnitId: product.primaryItemUnitId,
        itemUnit: product.primaryItemUnit,
        factor: ONE,
        barcode: product.barcode,
        retailPrice: product.retailPrice,
      },
      ...units.map((u) => ({
        id: u.id,
        isPrimary: false,
        productId,
        itemUnitId: u.itemUnitId,
        itemUnit: u.itemUnit,
        factor: u.factor,
        barcode: u.barcode,
        retailPrice: u.retailPrice,
      })),
    ];
    return ok('Product units returned successfully', list);
  }

  /** PATCH /product-units/:id */
  async update(id: string, dto: UpdateProductUnitDto) {
    const current = await this.getActive(id);

    if (dto.itemUnitId !== undefined && dto.itemUnitId !== current.itemUnitId) {
      await this.assertUnitAllowed(current.product, dto.itemUnitId);
      const other = await this.prisma.productUnit.findUnique({
        where: {
          productId_itemUnitId: {
            productId: current.productId,
            itemUnitId: dto.itemUnitId,
          },
        },
      });
      if (other) {
        throw new ConflictException(
          other.deletedAt === null
            ? errorBody(
                409,
                'This unit is already defined for this product',
                ErrorCode.ALREADY_EXISTS,
                'itemUnitId',
              )
            : errorBody(
                409,
                'itemUnitId belongs to a deleted product unit',
                ErrorCode.BELONGS_TO_DELETED,
                'itemUnitId',
              ),
        );
      }
    }
    await assertNotUsedByDeleted(this.prisma.productUnit, 'product unit', {
      barcode: dto.barcode,
    });

    const unit = await this.prisma.productUnit.update({
      where: { id },
      data: {
        itemUnitId: dto.itemUnitId,
        factor: dto.factor,
        barcode: dto.barcode,
        retailPrice: dto.retailPrice,
      },
      include: { itemUnit: true },
    });
    return ok('Product unit updated successfully', unit);
  }

  /** DELETE /product-units/:id (soft delete) */
  async remove(id: string) {
    await this.getActive(id);
    await this.prisma.productUnit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('Product unit deleted successfully', null);
  }

  /**
   * THE important function of this module, used by every document line:
   * how many primary units (pieces) one `itemUnitId` of this product is.
   *   primary unit           -> 1
   *   a defined ProductUnit  -> its factor (carton -> 12)
   *   anything else          -> 400 "unit is not defined for this product"
   * quantity in pieces = line quantity x getUnitFactor(...)
   * Pass `db` (a transaction) to read inside the caller's transaction.
   */
  async getUnitFactor(
    productId: string,
    itemUnitId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.Decimal> {
    const product = await db.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { primaryItemUnitId: true },
    });
    if (!product) throw doesNotExist('productId');
    if (product.primaryItemUnitId === itemUnitId) return ONE;

    const unit = await db.productUnit.findFirst({
      where: { productId, itemUnitId, deletedAt: null },
      select: { factor: true },
    });
    if (!unit) {
      throw new BadRequestException(
        errorBody(
          400,
          'unit is not defined for this product',
          ErrorCode.BAD_REQUEST,
          'itemUnitId',
        ),
      );
    }
    return unit.factor;
  }
}
