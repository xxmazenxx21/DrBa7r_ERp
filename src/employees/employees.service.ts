import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PrismaService } from '../prisma/prisma.service';
import { generateCode } from '../utils/codeGenratror/code.generator';
import { ok } from '../utils/response/response';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertBranch(branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException(`Branch with id ${branchId} not found`);
    }
  }

  async create(branchId: string, dto: CreateEmployeeDto) {
    await this.assertBranch(branchId);
    // Active duplicate -> PrismaExceptionFilter 409 "nationalId already exists".
    await assertNotUsedByDeleted(this.prisma.employee, 'employee', {
      nationalId: dto.nationalId,
    });

    const employee = await this.prisma.employee.create({
      data: {
        code: generateCode('EMP'),
        fullName: dto.fullName,
        nationalId: dto.nationalId,
        jobTitle: dto.jobTitle,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
        branchId,
      },
    });
    return ok('Employee created successfully', employee);
  }

  async findAllByBranch(branchId: string) {
    await this.assertBranch(branchId);
    const employees = await this.prisma.employee.findMany({
      where: { branchId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return ok('Employees returned successfully', employees);
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }
    return ok('Employee returned successfully', employee);
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    // Active duplicate -> PrismaExceptionFilter 409 "nationalId already exists".
    await assertNotUsedByDeleted(this.prisma.employee, 'employee', {
      nationalId: dto.nationalId,
    });

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        nationalId: dto.nationalId,
        jobTitle: dto.jobTitle,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
      },
    });
    return ok('Employee updated successfully', employee);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('Employee deleted successfully', null);
  }
}
