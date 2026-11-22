import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * A soft-deleted (or missing) category / unit is treated like a bad FK:
   * same 400 message the PrismaExceptionFilter gives for FK errors.
   */
  private async assertRefs(categoryId?: string, primaryItemUnitId?: string) {
    if (categoryId !== undefined) {
      const category = await this.prisma.categories.findFirst({
        where: { id: categoryId, deletedAt: null },
      });
      if (!category)
        throw new BadRequestException(
          errorBody(
            400,
            'categoryId does not exist',
            ErrorCode.DOES_NOT_EXIST,
            'categoryId',
          ),
        );
    }
    if (primaryItemUnitId !== undefined) {
      const unit = await this.prisma.itemUnit.findFirst({
        where: { id: primaryItemUnitId, deletedAt: null },
      });
      if (!unit) {
        throw new BadRequestException(
          errorBody(
            400,
            'primaryItemUnitId does not exist',
            ErrorCode.DOES_NOT_EXIST,
            'primaryItemUnitId',
          ),
        );
      }
    }
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
      },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }
    return ok('Product fetched successfully', product);
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    await this.assertRefs(dto.categoryId, dto.primaryItemUnitId);
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
