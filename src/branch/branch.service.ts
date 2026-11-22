import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createBranchDto: CreateBranchDto) {
    const branch = await this.prisma.branch.create({
      data: {
        name: createBranchDto.name,
        address: createBranchDto.address,
        code: generateCode('branch'),
      },
    });
    return ok('Branch created successfully', branch);
  }

  async findAll() {
    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('All branches returned successfully', branches);
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with id ${id} not found`);
    }
    return ok('Branch returned successfully', branch);
  }

  async update(id: string, updateBranchDto: UpdateBranchDto) {
    await this.findOne(id);
    const branch = await this.prisma.branch.update({
      where: { id },
      data: { name: updateBranchDto.name, address: updateBranchDto.address },
    });
    return ok('Branch updated successfully', branch);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('Branch deleted successfully', null);
  }
}
