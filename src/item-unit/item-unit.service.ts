import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateItemUnitDto } from './dto/create-item-unit.dto';
import { UpdateItemUnitDto } from './dto/update-item-unit.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';

@Injectable()
export class ItemUnitService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createItemUnitDto: CreateItemUnitDto) {
    const item = await this.prisma.itemUnit.create({
      data: { name: createItemUnitDto.name, code: generateCode('unit') },
    });
    return ok('ItemUnit created successfully', item);
  }

  async findAll() {
    const items = await this.prisma.itemUnit.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('All item units returned successfully', items);
  }

  async findOne(id: string) {
    const item = await this.prisma.itemUnit.findFirst({
      where: { id, deletedAt: null },
    });
    if (!item) {
      throw new NotFoundException(`ItemUnit with id ${id} not found`);
    }
    return ok('ItemUnit returned successfully', item);
  }

  async update(id: string, updateItemUnitDto: UpdateItemUnitDto) {
    await this.findOne(id);
    const item = await this.prisma.itemUnit.update({
      where: { id },
      data: { name: updateItemUnitDto.name },
    });
    return ok('ItemUnit updated successfully', item);
  }

  async remove(id: string) {
    await this.findOne(id);
    const productsCount = await this.prisma.product.count({
      where: { primaryItemUnitId: id, deletedAt: null },
    });
    if (productsCount > 0) {
      throw new BadRequestException(
        `ItemUnit is used by ${productsCount} product(s) and cannot be deleted`,
      );
    }
    await this.prisma.itemUnit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('ItemUnit deleted successfully', null);
  }
}
