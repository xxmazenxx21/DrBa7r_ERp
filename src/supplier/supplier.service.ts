import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateUniqueCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';

@Injectable()
export class SupplierService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSupplierDto) {
    const supplier = await this.prisma.supplier.create({
      data: {
        code: await generateUniqueCode(this.prisma.supplier, 'SUP'),
        name: dto.name,
        taxNumber: dto.taxNumber,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        openingBalance: dto.openingBalance,
      },
    });
    return ok('supplier created successfully', supplier);
  }

  async findAll() {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('Suppliers returned successfully', suppliers);
  }

  private async getActive(id: string, notFoundMessage: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException(notFoundMessage);
    return supplier;
  }

  async findOne(id: string) {
    const supplier = await this.getActive(id, 'supplier does not exist');
    return ok('Supplier returned successfully', supplier);
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.getActive(id, 'supplier not found');
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        taxNumber: dto.taxNumber,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        openingBalance: dto.openingBalance,
      },
    });
    return ok('supplier updated successfully', supplier);
  }

  async remove(id: string) {
    await this.getActive(id, 'supplier not found');
    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('supplier deleted successfully', null);
  }
}
