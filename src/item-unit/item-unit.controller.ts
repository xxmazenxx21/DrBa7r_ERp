import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ItemUnitService } from './item-unit.service';
import { CreateItemUnitDto } from './dto/create-item-unit.dto';
import { UpdateItemUnitDto } from './dto/update-item-unit.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';

@Controller('item-unit')
export class ItemUnitController {
  constructor(private readonly itemUnitService: ItemUnitService) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(@Body() createItemUnitDto: CreateItemUnitDto) {
    return this.itemUnitService.create(createItemUnitDto);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll() {
    return this.itemUnitService.findAll();
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.itemUnitService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() updateItemUnitDto: UpdateItemUnitDto,
  ) {
    return this.itemUnitService.update(id, updateItemUnitDto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.itemUnitService.remove(id);
  }
}
