import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProdcutInventoryService } from './prodcut-inventory.service';
import { CreateProdcutInventoryDto } from './dto/create-prodcut-inventory.dto';
import { UpdateProdcutInventoryDto } from './dto/update-prodcut-inventory.dto';

@Controller('prodcut-inventory')
export class ProdcutInventoryController {
  constructor(
    private readonly prodcutInventoryService: ProdcutInventoryService,
  ) {}

  @Post('inventory/:inventoryId')
  create(
    @Param('inventoryId') inventoryId: string,
    @Body() createProdcutInventoryDto: CreateProdcutInventoryDto,
  ) {
    return this.prodcutInventoryService.create(
      inventoryId,
      createProdcutInventoryDto,
    );
  }

  @Get('inventory/:inventoryId')
  findAllByInventoryId(@Param('inventoryId') inventoryId: string) {
    return this.prodcutInventoryService.findAllByInventoryId(inventoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.prodcutInventoryService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProdcutInventoryDto: UpdateProdcutInventoryDto,
  ) {
    return this.prodcutInventoryService.update(id, updateProdcutInventoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prodcutInventoryService.remove(id);
  }
}
