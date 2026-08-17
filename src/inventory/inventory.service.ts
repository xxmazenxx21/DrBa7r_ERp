import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(branchId: string, createInventoryDto: CreateInventoryDto) {
    const inventory = await this.prisma.inventory.create({
      data: {
        branchId,
        name: createInventoryDto.name,
        address: createInventoryDto.address,
      },
    });
    return { data: inventory, message: 'Inventory created successfully' };
  }

  async findAllByBranchId(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${branchId} not found`);
    }
    const inventories = await this.prisma.inventory.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { data: inventories, message: 'Inventories returned successfully' };
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory with id ${id} not found`);
    }

    return { data: inventory, message: 'Inventory returned successfully' };
  }

  async update(id: string, updateInventoryDto: UpdateInventoryDto) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory with id ${id} not found`);
    }

    const updatedInventory = await this.prisma.inventory.update({
      where: { id },
      data: updateInventoryDto,
    });

    return {
      data: updatedInventory,
      message: 'Inventory updated successfully',
    };
  }

  async remove(id: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
    });

    if (!inventory) {
      throw new NotFoundException(`Inventory with id ${id} not found`);
    }
    await this.prisma.inventory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Inventory deleted successfully' };
  }
}
