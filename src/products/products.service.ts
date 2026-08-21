import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/codeGenratror/code.generator';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) { }

  async create(createProductDto: CreateProductDto) {
    createProductDto.code = generateCode('PRD');
    const product = await this.prisma.product.findFirst({
      where: { code: createProductDto.code },
    });
    if (product) {
      throw new BadRequestException('Product already exists');
    }
    const newproduct = await this.prisma.product.create({
      data: createProductDto,
    });
    return {
      message: 'Product created successfully',
      product: newproduct,
    };
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      include: {
        category: true,
        primaryIteamUnit: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      message: 'Products fetched successfully',
      products,
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        primaryIteamUnit: true,
        productInventories: {
          include: {
            inventory: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return {
      message: 'Product fetched successfully',
      product,
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }



    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
    });

    return {
      message: 'Product updated successfully',
      product: updatedProduct,
    };
  }

  async remove(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Product deleted successfully' };
  }
}
