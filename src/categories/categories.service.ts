import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class CategoriesService {
  constructor(private readonly prisma:PrismaService){}


  
async create(createCategoryDto: CreateCategoryDto) {
  const categoryExists  = await this.prisma.categories.findUnique({ where:{code:createCategoryDto.code}});
if(categoryExists){
  throw new Error(`Category with code ${createCategoryDto.code} already exists`);}
 const category =  await this.prisma.categories.create({data:createCategoryDto});
 return {data:category,message:'Category created successfully'};



  }

  async findAll() {
    const categories = await this.prisma.categories.findMany();
    return { data: categories, message: 'All categories returned successfully' };
  }

  async findOne(id: string) {
    const category = await this.prisma.categories.findUnique({ where: { id } });
    if (!category) {
      throw new Error(`Category with id ${id} not found`);
    }
    return { data: category, message: 'Category returned successfully' };
  }

async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.prisma.categories.findUnique({ where: { id } });
    if (!category) {
      throw new Error(`Category with id ${id} not found`);
    }
    return await this.prisma.categories.update({ where: { id }, data: updateCategoryDto });
  }

  async remove(id: string) {
    const category = await this.prisma.categories.findUnique({ where: { id } });
    if (!category) {
      throw new Error(`Category with id ${id} not found`);
    }
    await this.prisma.categories.delete({ where: { id } });
    return { data: null, message: `Category with id ${id} removed successfully` };
  }
}
