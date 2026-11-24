import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ProductInventoryService } from './product-inventory.service';
import { CreateProductInventoryDto } from './dto/create-product-inventory.dto';
import { UpdateProductInventoryDto } from './dto/update-product-inventory.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';
import { CurrentUser } from '../decorators/current-user.decorator';

@Controller('product-inventory')
export class ProductInventoryController {
  constructor(
    private readonly productInventoryService: ProductInventoryService,
  ) {}

  @Post('inventory/:inventoryId')
  @Roles(Role.SUPERADMIN)
  create(
    @Param('inventoryId') inventoryId: string,
    @Body() createProductInventoryDto: CreateProductInventoryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.productInventoryService.create(
      inventoryId,
      createProductInventoryDto,
      userId,
    );
  }

  @Get('inventory/:inventoryId')
  @Roles(Role.SUPERADMIN)
  findAllByInventoryId(@Param('inventoryId') inventoryId: string) {
    return this.productInventoryService.findAllByInventoryId(inventoryId);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.productInventoryService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() updateProductInventoryDto: UpdateProductInventoryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.productInventoryService.update(
      id,
      updateProductInventoryDto,
      userId,
    );
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.productInventoryService.remove(id, userId);
  }
}
