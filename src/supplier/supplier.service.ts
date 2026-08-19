import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSupplierDto: CreateSupplierDto) {
    const existingSupplier = await this.prisma.supplier.findUnique({
      where: { code: createSupplierDto.code }
    });
    
    if (existingSupplier) {
      throw new BadRequestException('this supplier already exists');
    }

    const newSupplier = await this.prisma.supplier.create({
      data: { ...createSupplierDto }
    });

    return {
      message: "supplier created successfully",
      supplier: newSupplier
    };
  }

  async findAll() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null }
    });

    if (suppliers.length === 0) {
      return { message: "no suppliers found" };
    }

    return suppliers;
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null }
    });

    if (!supplier) {
      throw new NotFoundException('supplier does not exist');
    }

    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null }
    });
    
    if (!supplier) {
      throw new NotFoundException("supplier not found");
    }
    
    if (updateSupplierDto.code && updateSupplierDto.code !== supplier.code) {
      const checkCode = await this.prisma.supplier.findFirst({
        where: { code: updateSupplierDto.code }
      });
      if (checkCode) {
        throw new BadRequestException("this code already exists");
      }
    }

    const updatedSupplier = await this.prisma.supplier.update({
      where: { id },
      data: updateSupplierDto,
    });

    return {
      message: 'supplier updated successfully',
      supplier: updatedSupplier,
    };
  }

  async remove(id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null }
    });
    
    if (!supplier) {
      throw new NotFoundException("supplier not found");
    }

    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'supplier deleted successfully' };
  }
}
