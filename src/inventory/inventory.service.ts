import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ok } from '../utils/response/response';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertBranch(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with id ${branchId} not found`);
    }
  }

  async create(branchId: string, createInventoryDto: CreateInventoryDto) {
    await this.assertBranch(branchId);
    const inventory = await this.prisma.inventory.create({
      data: {
        branchId,
        name: createInventoryDto.name,
        address: createInventoryDto.address,
      },
    });
    return ok('Inventory created successfully', inventory);
  }

  async findAllByBranchId(branchId: string) {
    await this.assertBranch(branchId);
    const inventories = await this.prisma.inventory.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('Inventories returned successfully', inventories);
  }

  /** All active inventories, newest first, optionally only one branch's. */
  async findAll(branchId?: string) {
    if (branchId) await this.assertBranch(branchId);
    const inventories = await this.prisma.inventory.findMany({
      where: { deletedAt: null, ...(branchId && { branchId }) },
      orderBy: { createdAt: 'desc' },
    });
    return ok('All inventories returned successfully', inventories);
  }

  async findOne(id: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!inventory) {
      throw new NotFoundException(`Inventory with id ${id} not found`);
    }
    return ok('Inventory returned successfully', inventory);
  }

  async update(id: string, updateInventoryDto: UpdateInventoryDto) {
    await this.findOne(id);
    const inventory = await this.prisma.inventory.update({
      where: { id },
      data: {
        name: updateInventoryDto.name,
        address: updateInventoryDto.address,
      },
    });
    return ok('Inventory updated successfully', inventory);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.inventory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('Inventory deleted successfully', null);
  }
}
