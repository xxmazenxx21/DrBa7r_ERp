import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/codeGenratror/code.generator';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createCategoryDto: CreateCategoryDto) {
    createCategoryDto.code = generateCode('category');
    const category = await this.prisma.categories.create({
      data: createCategoryDto,
    });
    return { data: category, message: 'Category created successfully' };
  }

  async findAll() {
    const categories = await this.prisma.categories.findMany();
    return {
      data: categories,
      message: 'All categories returned successfully',
    };
  }

  async findOne(id: string) {
    const category = await this.prisma.categories.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    return { data: category, message: 'Category returned successfully' };
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.prisma.categories.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    const updated = await this.prisma.categories.update({
      where: { id },
      data: updateCategoryDto,
    });
    return { data: updated, message: 'Category updated successfully' };
  }

  async remove(id: string) {
    const category = await this.prisma.categories.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    const productsCount = await this.prisma.product.count({
      where: { categoryId: id },
    });
    if (productsCount > 0) {
      throw new BadRequestException(
        `Category is used by ${productsCount} product(s) and cannot be deleted`,
      );
    }
    await this.prisma.categories.delete({ where: { id } });
    return {
      data: null,
      message: `Category with id ${id} removed successfully`,
    };
  }
}
