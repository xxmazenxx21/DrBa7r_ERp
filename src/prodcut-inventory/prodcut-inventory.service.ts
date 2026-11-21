import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProdcutInventoryDto } from './dto/create-prodcut-inventory.dto';
import { UpdateProdcutInventoryDto } from './dto/update-prodcut-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ok } from '../utils/response/response';

@Injectable()
export class ProdcutInventoryService {
  constructor(private prisma: PrismaService) {}

  async create(
    inventoryId: string,
    createProdcutInventoryDto: CreateProdcutInventoryDto,
  ) {
    const inventory = await this.prisma.inventory.findUnique({
      where: {
        id: inventoryId,
        deletedAt: null,
      },
    });

    if (!inventory) throw new NotFoundException('Inventory not found');

    const product = await this.prisma.product.findFirst({
      where: { id: createProdcutInventoryDto.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundException('Product not found');

    // One row per product + warehouse (@@unique), deleted rows included.
    const existing = await this.prisma.productInventory.findUnique({
      where: {
        productId_inventoryId: {
          productId: createProdcutInventoryDto.productId,
          inventoryId,
        },
      },
    });
    if (existing && existing.deletedAt === null) {
      throw new BadRequestException('Product inventory already exists');
    }
    if (existing) {
      // Soft-deleted before: bring the same row back with the new values.
      const restored = await this.prisma.productInventory.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          quantity: createProdcutInventoryDto.quantity,
          costPrice: createProdcutInventoryDto.costPrice,
        },
      });
      return ok('Product inventory restored successfully', restored);
    }

    const productInventory = await this.prisma.productInventory.create({
      data: {
        inventoryId,
        productId: createProdcutInventoryDto.productId,
        quantity: createProdcutInventoryDto.quantity,
        costPrice: createProdcutInventoryDto.costPrice,
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
            primaryIteamUnit: true,
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
            primaryIteamUnit: true,
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
    updateProdcutInventoryDto: UpdateProdcutInventoryDto,
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
        ...(updateProdcutInventoryDto.quantity !== undefined && {
          quantity: updateProdcutInventoryDto.quantity,
        }),
        ...(updateProdcutInventoryDto.costPrice !== undefined && {
          costPrice: updateProdcutInventoryDto.costPrice,
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
