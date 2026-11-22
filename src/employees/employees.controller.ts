import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';
import { BranchFilterDto } from '../utils/dto/branch-filter.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post('branch/:branchId')
  @Roles(Role.SUPERADMIN)
  create(
    @Param('branchId') branchId: string,
    @Body() createEmployeeDto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(branchId, createEmployeeDto);
  }

  @Get('branch/:branchId')
  @Roles(Role.SUPERADMIN)
  findAllByBranch(@Param('branchId') branchId: string) {
    return this.employeesService.findAllByBranch(branchId);
  }

  // GET /employees  or  GET /employees?branchId=...  (must stay BEFORE @Get(':id'))
  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: BranchFilterDto) {
    return this.employeesService.findAll(query.branchId);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }
}
