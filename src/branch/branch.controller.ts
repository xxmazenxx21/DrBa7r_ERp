import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';

@Controller('branch')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}
  @Post()
  @Roles(Role.SUPERADMIN)
  create(@Body() createBranchDto: CreateBranchDto) {
    return this.branchService.create(createBranchDto);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll() {
    return this.branchService.findAll();
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.branchService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(@Param('id') id: string, @Body() updateBranchDto: UpdateBranchDto) {
    return this.branchService.update(id, updateBranchDto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.branchService.remove(id);
  }
}
