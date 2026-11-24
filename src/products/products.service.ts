import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { ItemType } from '../utils/enum/enum';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';
import { assertExists } from '../utils/exists/assert-exists';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /** A soft-deleted (or missing) category / unit -> 400 DOES_NOT_EXIST. */
  private async assertRefs(categoryId?: string, primaryItemUnitId?: string) {
    if (categoryId !== undefined)
      await assertExists(this.prisma.categories, 'categoryId', categoryId);
    if (primaryItemUnitId !== undefined)
      await assertExists(
        this.prisma.itemUnit,
        'primaryItemUnitId',
        primaryItemUnitId,
      );
  }

  async create(dto: CreateProductDto) {
    await this.assertRefs(dto.categoryId, dto.primaryItemUnitId);
    await assertNotUsedByDeleted(this.prisma.product, 'product', {
      barcode: dto.barcode,
    });
    const product = await this.prisma.product.create({
      data: {
        code: generateCode('PRD'),
        barcode: dto.barcode,
        name: dto.name,
        categoryId: dto.categoryId,
        primaryItemUnitId: dto.primaryItemUnitId,
        itemType: dto.itemType,
        costingMethod: dto.costingMethod,
        retailPrice: dto.retailPrice,
        wholesalePrice: dto.wholesalePrice,
        bulkWholesalePrice: dto.bulkWholesalePrice,
        reorderLimit: dto.reorderLimit,
        hasExpiryDate: dto.hasExpiryDate,
      },
    });
    return ok('Product created successfully', product);
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: { category: true, primaryItemUnit: true },
      orderBy: { createdAt: 'desc' },
    });
    return ok('Products fetched successfully', products);
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        primaryItemUnit: true,
        productInventories: {
          where: { deletedAt: null },
          include: { inventory: true },
        },
        // the product's other units (carton = 12...), see product-units
        units: {
          where: { deletedAt: null },
          include: { itemUnit: true },
          orderBy: { factor: 'asc' },
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return ok('Product fetched successfully', product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const { data: current } = await this.findOne(id);
    if (
      dto.itemType === ItemType.SERVICE &&
      current.itemType !== ItemType.SERVICE
    ) {
      // Services have no stock: can't become SERVICE while still in a warehouse.
      const stockRows = await this.prisma.productInventory.count({
        where: { productId: id, deletedAt: null },
      });
      if (stockRows > 0) {
        throw new BadRequestException(
          errorBody(
            400,
            "itemType can't be SERVICE while the product is in a warehouse; remove it from the warehouses first",
            ErrorCode.BAD_REQUEST,
            'itemType',
          ),
        );
      }
    }
    await this.assertRefs(dto.categoryId, dto.primaryItemUnitId);
    if (dto.primaryItemUnitId !== undefined) {
      // A unit can't be the primary one (factor 1) AND another unit (factor 12).
      const asOtherUnit = await this.prisma.productUnit.findFirst({
        where: {
          productId: id,
          itemUnitId: dto.primaryItemUnitId,
          deletedAt: null,
        },
      });
      if (asOtherUnit) {
        throw new BadRequestException(
          errorBody(
            400,
            "primaryItemUnitId is already one of the product's units; delete that product unit first",
            ErrorCode.BAD_REQUEST,
            'primaryItemUnitId',
          ),
        );
      }
    }
    await assertNotUsedByDeleted(this.prisma.product, 'product', {
      barcode: dto.barcode,
    });
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        barcode: dto.barcode,
        name: dto.name,
        categoryId: dto.categoryId,
        primaryItemUnitId: dto.primaryItemUnitId,
        itemType: dto.itemType,
        costingMethod: dto.costingMethod,
        retailPrice: dto.retailPrice,
        wholesalePrice: dto.wholesalePrice,
        bulkWholesalePrice: dto.bulkWholesalePrice,
        reorderLimit: dto.reorderLimit,
        hasExpiryDate: dto.hasExpiryDate,
      },
    });
    return ok('Product updated successfully', product);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('Product deleted successfully', null);
  }
}
