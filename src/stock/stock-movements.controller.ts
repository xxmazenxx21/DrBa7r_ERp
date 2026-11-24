import { Controller, Get, Query } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { ItemCardQueryDto } from './dto/item-card-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';

// Read only. There is NO POST: movements are written only by documents and
// by the product-inventory endpoints (opening / adjustment), via StockService.
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @Roles(Role.SUPERADMIN)
  findMovements(@Query() query: StockMovementQueryDto) {
    return this.stockService.findMovements(query);
  }

  @Get('item-card')
  @Roles(Role.SUPERADMIN)
  itemCard(@Query() query: ItemCardQueryDto) {
    return this.stockService.itemCard(query);
  }
}
