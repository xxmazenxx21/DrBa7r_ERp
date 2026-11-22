import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/code-generator/code.generator';
import { ok } from '../utils/response/response';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        code: generateCode('CUS'),
        name: dto.name,
        taxNumber: dto.taxNumber,
        commercialRecord: dto.commercialRecord,
        phone: dto.phone,
        address: dto.address,
        creditLimit: dto.creditLimit,
        openingBalance: dto.openingBalance,
      },
    });
    return ok('customer created successfully', customer);
  }

  async findAll() {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('Customers returned successfully', customers);
  }

  private async getActive(id: string, notFoundMessage: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) throw new NotFoundException(notFoundMessage);
    return customer;
  }

  async findOne(id: string) {
    const customer = await this.getActive(id, 'customer does not exist');
    return ok('Customer returned successfully', customer);
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.getActive(id, 'customer not found');
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        taxNumber: dto.taxNumber,
        commercialRecord: dto.commercialRecord,
        phone: dto.phone,
        address: dto.address,
        creditLimit: dto.creditLimit,
        openingBalance: dto.openingBalance,
      },
    });
    return ok('customer updated successfully', customer);
  }

  async remove(id: string) {
    await this.getActive(id, 'customer not found');
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('customer deleted successfully', null);
  }
}
