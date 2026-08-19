import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) { }
  async create(createCustomerDto: CreateCustomerDto) {
    const Customer = await this.prisma.customer.findUnique({
      where: { code: createCustomerDto.code }
    })
    if (Customer) throw new BadRequestException('this customer already exists')

    const newcustomer = await this.prisma.customer.create({
      data: { ...createCustomerDto }
    })
    return {
      message: "customer created successfully",
      customer: newcustomer
    }

  }

  async findAll() {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null }
    });

    if (customers.length === 0) {
      return { message: "no customers found" };
    }

    return customers;
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: id as any, deletedAt: null }
    })

    if (!customer) {
      throw new NotFoundException('customer does not exist');
    }

    return customer;
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    // Check if customer exists and is not soft-deleted
    const customer = await this.prisma.customer.findFirst({
      where: { id: id as any, deletedAt: null }
    })
    if (!customer) throw new NotFoundException("customer not found")
    if (updateCustomerDto.code && updateCustomerDto.code !== customer.code) {
      const checkcode = await this.prisma.customer.findFirst({
        where: { code: updateCustomerDto.code }
      })
      if (checkcode) throw new BadRequestException("this code already exists")
    }

    const updatedCustomer = await this.prisma.customer.update({
      where: { id: id as any },
      data: updateCustomerDto,
    });

    return {
      message: 'customer updated successfully',
      customer: updatedCustomer,
    };
  }

  async remove(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: id as any, deletedAt: null }
    })
    if (!customer) throw new NotFoundException("customer not found")

    await this.prisma.customer.update({
      where: { id: id as any },
      data: { deletedAt: new Date() },
    });

    return { message: 'customer deleted successfully' };
  }
}
