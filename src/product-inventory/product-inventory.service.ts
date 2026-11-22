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

@Injectable()
export class ProductInventoryService {
  constructor(private prisma: PrismaService) {}

  async create(
    inventoryId: string,
    createProductInventoryDto: CreateProductInventoryDto,
  ) {
    const inventory = await this.prisma.inventory.findUnique({
      where: {
        id: inventoryId,
        deletedAt: null,
      },
    });

    if (!inventory) throw new NotFoundException('Inventory not found');

    const product = await this.prisma.product.findFirst({
      where: { id: createProductInventoryDto.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    // One row per product + warehouse (@@unique), deleted rows included.
    const existing = await this.prisma.productInventory.findUnique({
      where: {
        productId_inventoryId: {
          productId: createProductInventoryDto.productId,
          inventoryId,
        },
      },
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
    if (existing) {
      // Soft-deleted before: bring the same row back with the new values.
      const restored = await this.prisma.productInventory.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          quantity: createProductInventoryDto.quantity,
          costPrice: createProductInventoryDto.costPrice,
        },
      });
      return ok('Product inventory restored successfully', restored);
    }

    const productInventory = await this.prisma.productInventory.create({
      data: {
        inventoryId,
        productId: createProductInventoryDto.productId,
        quantity: createProductInventoryDto.quantity,
        costPrice: createProductInventoryDto.costPrice,
      },
    });

    return ok('Product inventory created successfully', productInventory);
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

  async update(
    id: string,
    updateProductInventoryDto: UpdateProductInventoryDto,
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

    const updatedProductInventory = await this.prisma.productInventory.update({
      where: { id },
      data: {
        ...(updateProductInventoryDto.quantity !== undefined && {
          quantity: updateProductInventoryDto.quantity,
        }),
        ...(updateProductInventoryDto.costPrice !== undefined && {
          costPrice: updateProductInventoryDto.costPrice,
        }),
      },
    });

    return ok(
      'Product inventory updated successfully',
      updatedProductInventory,
    );
  }

  async remove(id: string) {
    const productInventory = await this.prisma.productInventory.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!productInventory) {
      throw new NotFoundException(`Product inventory with ID ${id} not found`);
    }

    await this.prisma.productInventory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ok('Product inventory deleted successfully', null);
  }
}
