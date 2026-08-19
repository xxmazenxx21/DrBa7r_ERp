import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProdcutInventoryDto } from './dto/create-prodcut-inventory.dto';
import { UpdateProdcutInventoryDto } from './dto/update-prodcut-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProdcutInventoryService {
  constructor(private prisma: PrismaService) { }

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

    const productInventoryExist = await this.prisma.productInventory.findFirst({
      where: {
        inventoryId,
        productId: createProdcutInventoryDto.productId,
        deletedAt: null,
      },
    });
    if (productInventoryExist)
      throw new BadRequestException('Product inventory already exists');

    const productInventory = await this.prisma.productInventory.create({
      data: {
        inventoryId,
        productId: createProdcutInventoryDto.productId,
        quantity: createProdcutInventoryDto.quantity,
        costPrice: createProdcutInventoryDto.costPrice,
      },
    });

    return {
      message: 'Product inventory created successfully',
      productInventory,
    };
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

    return {
      message: 'Products in inventory fetched successfully',
      data: productInventories,
    };
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

    return {
      message: 'Product inventory item fetched successfully',
      data: productInventory,
    };
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

    return {
      message: 'Product inventory updated successfully',
      productInventory: updatedProductInventory,
    };
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

    return {
      message: 'Product inventory deleted successfully',
    };
  }
}
