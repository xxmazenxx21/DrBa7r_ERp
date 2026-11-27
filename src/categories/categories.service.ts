import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateUniqueCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const category = await this.prisma.categories.create({
      data: {
        name: createCategoryDto.name,
        code: await generateUniqueCode(this.prisma.categories, 'category'),
      },
    });
    return ok('Category created successfully', category);
  }

  async findAll() {
    const categories = await this.prisma.categories.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('All categories returned successfully', categories);
  }

  async findOne(id: string) {
    const category = await this.prisma.categories.findFirst({
      where: { id, deletedAt: null },
    });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    return ok('Category returned successfully', category);
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id);
    const category = await this.prisma.categories.update({
      where: { id },
      data: { name: updateCategoryDto.name },
    });
    return ok('Category updated successfully', category);
  }

  async remove(id: string) {
    await this.findOne(id);
    const productsCount = await this.prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (productsCount > 0) {
      throw new BadRequestException(
        `Category is used by ${productsCount} product(s) and cannot be deleted`,
      );
    }
    await this.prisma.categories.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('Category deleted successfully', null);
  }
}
