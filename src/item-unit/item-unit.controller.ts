import { Controller, Get, Post, Body, Patch, Param, Delete, UsePipes, ValidationPipe } from '@nestjs/common';
import { ItemUnitService } from './item-unit.service';
import { CreateItemUnitDto } from './dto/create-item-unit.dto';
import { UpdateItemUnitDto } from './dto/update-item-unit.dto';

@Controller('item-unit')
export class ItemUnitController {
  constructor(private readonly itemUnitService: ItemUnitService) {}

  @Post()
  @UsePipes(ValidationPipe)
  create(@Body() createItemUnitDto: CreateItemUnitDto) {
    return this.itemUnitService.create(createItemUnitDto);
  }

  @Get()
  findAll() {
    return this.itemUnitService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemUnitService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(ValidationPipe)
  update(@Param('id') id: string, @Body() updateItemUnitDto: UpdateItemUnitDto) {
    return this.itemUnitService.update(id, updateItemUnitDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.itemUnitService.remove(id);
  }
}
