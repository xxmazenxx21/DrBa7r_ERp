import { Injectable } from '@nestjs/common';
import { CreateItemUnitDto } from './dto/create-item-unit.dto';
import { UpdateItemUnitDto } from './dto/update-item-unit.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/codeGenratror/code.generator';

@Injectable()
export class ItemUnitService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createItemUnitDto: CreateItemUnitDto) {
    createItemUnitDto.code = generateCode('unit')
    const exists = await this.prisma.itemUnit.findUnique({
      where: { code: createItemUnitDto.code },
    });
    if (exists)
      throw new Error(
        `ItemUnit with code ${createItemUnitDto.code} already exists`,
      );
    const item = await this.prisma.itemUnit.create({ data: createItemUnitDto as any });
    return { data: item, message: 'ItemUnit created successfully' };
  }

  async findAll() {
    const items = await this.prisma.itemUnit.findMany();
    return { data: items, message: 'All item units returned successfully' };
  }

  async findOne(id: string) {
    const item = await this.prisma.itemUnit.findUnique({ where: { id } });
    if (!item) throw new Error(`ItemUnit with id ${id} not found`);
    return { data: item, message: 'ItemUnit returned successfully' };
  }

  async update(id: string, updateItemUnitDto: UpdateItemUnitDto) {
    const item = await this.prisma.itemUnit.findUnique({ where: { id } });
    if (!item) throw new Error(`ItemUnit with id ${id} not found`);
    const updated = await this.prisma.itemUnit.update({
      where: { id },
      data: updateItemUnitDto,
    });
    return { data: updated, message: 'ItemUnit updated successfully' };
  }

  async remove(id: string) {
    const item = await this.prisma.itemUnit.findUnique({ where: { id } });
    if (!item) throw new Error(`ItemUnit with id ${id} not found`);
    await this.prisma.itemUnit.delete({ where: { id } });
    return { data: item, message: 'ItemUnit deleted successfully' };
  }
}
