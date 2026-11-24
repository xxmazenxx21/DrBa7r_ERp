import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ProductUnitsService } from './product-units.service';
import { CreateProductUnitDto } from './dto/create-product-unit.dto';
import { UpdateProductUnitDto } from './dto/update-product-unit.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';

// @Controller() is empty on purpose: the routes use two prefixes
// (/products/:productId/units and /product-units/:id), so each method has its
// full path.
@Controller()
export class ProductUnitsController {
  constructor(private readonly productUnitsService: ProductUnitsService) {}

  @Post('products/:productId/units')
  @Roles(Role.SUPERADMIN)
  create(
    @Param('productId') productId: string,
    @Body() dto: CreateProductUnitDto,
  ) {
    return this.productUnitsService.create(productId, dto);
  }

  @Get('products/:productId/units')
  @Roles(Role.SUPERADMIN)
  findByProduct(@Param('productId') productId: string) {
    return this.productUnitsService.findByProduct(productId);
  }

  @Patch('product-units/:id')
  @Roles(Role.SUPERADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProductUnitDto) {
    return this.productUnitsService.update(id, dto);
  }

  @Delete('product-units/:id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.productUnitsService.remove(id);
  }
}
