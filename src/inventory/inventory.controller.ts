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
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';
import { BranchFilterDto } from '../utils/dto/branch-filter.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('branch/:branchId')
  @Roles(Role.SUPERADMIN)
  create(
    @Param('branchId') branchId: string,
    @Body() createInventoryDto: CreateInventoryDto,
  ) {
    return this.inventoryService.create(branchId, createInventoryDto);
  }

  @Get('branch/:branchId')
  @Roles(Role.SUPERADMIN)
  findAllByBranchId(@Param('branchId') branchId: string) {
    return this.inventoryService.findAllByBranchId(branchId);
  }

  // GET /inventory  or  GET /inventory?branchId=...  (must stay BEFORE @Get(':id'))
  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: BranchFilterDto) {
    return this.inventoryService.findAll(query.branchId);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
