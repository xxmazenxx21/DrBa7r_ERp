import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.BranchCreateInput) {
  
    const branch = await this.prisma.branch.create({ data });
    return { data: branch, message: 'Branch created successfully' };
  }

  async findAll() {
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { data: branches, message: 'All branches returned successfully' };
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, deletedAt: null } });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }

    return { data: branch, message: 'Branch returned successfully' };
  }

  async update(id: string, updateBranchDto: UpdateBranchDto) {
    await this.findOne(id);

    const updatedBranch = await this.prisma.branch.update({
      where: { id },
      data: updateBranchDto,
    });

    return { data: updatedBranch, message: 'Branch updated successfully' };
  }

  async remove(id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, deletedAt: null } });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }

    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Branch deleted successfully' };
  }
}
