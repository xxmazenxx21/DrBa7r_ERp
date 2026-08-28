import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/codeGenratror/code.generator';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) { }

  async create(branchId: string, createEmployeeDto: CreateEmployeeDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${branchId} not found`);
    }

    const existingCode = await this.prisma.employee.findFirst({
      where: { code: createEmployeeDto.code, deletedAt: null },
    });

    if (existingCode) {
      throw new BadRequestException(`Employee with code ${createEmployeeDto.code} already exists`);
    }
    createEmployeeDto.code = generateCode("EMP");

    if (createEmployeeDto.nationalId) {
      const existingNationalId = await this.prisma.employee.findFirst({
        where: { nationalId: createEmployeeDto.nationalId, deletedAt: null },
      });
      if (existingNationalId) {
        throw new BadRequestException(`Employee with national ID ${createEmployeeDto.nationalId} already exists`);
      }
    }

    const employee = await this.prisma.employee.create({
      data: {
        ...createEmployeeDto,
        branchId,
      },
    });

    return { data: employee, message: 'Employee created successfully' };
  }

  async findAllByBranch(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with id ${branchId} not found`);
    }

    const employees = await this.prisma.employee.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return { data: employees, message: 'Employees returned successfully' };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    return { data: employee, message: 'Employee returned successfully' };
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    if (updateEmployeeDto.code && updateEmployeeDto.code !== employee.code) {
      const existingCode = await this.prisma.employee.findFirst({
        where: {
          code: updateEmployeeDto.code,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existingCode) {
        throw new BadRequestException(`Employee with code ${updateEmployeeDto.code} already exists`);
      }
    }

    if (updateEmployeeDto.nationalId && updateEmployeeDto.nationalId !== employee.nationalId) {
      const existingNationalId = await this.prisma.employee.findFirst({
        where: {
          nationalId: updateEmployeeDto.nationalId,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existingNationalId) {
        throw new BadRequestException(`Employee with national ID ${updateEmployeeDto.nationalId} already exists`);
      }
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: { id },
      data: updateEmployeeDto,
    });

    return {
      data: updatedEmployee,
      message: 'Employee updated successfully',
    };
  }

  async remove(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Employee deleted successfully' };
  }
}
