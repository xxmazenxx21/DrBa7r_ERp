import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { UpdateStockTransferDto } from './dto/update-stock-transfer.dto';
import { StockTransferQueryDto } from './dto/stock-transfer-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly stockTransfersService: StockTransfersService) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreateStockTransferDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.stockTransfersService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: StockTransferQueryDto) {
    return this.stockTransfersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.stockTransfersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockTransferDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.stockTransfersService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.stockTransfersService.remove(id);
  }

  @Post(':id/post')
  @Roles(Role.SUPERADMIN)
  post(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.stockTransfersService.post(id, userId);
  }

  @Post(':id/cancel')
  @Roles(Role.SUPERADMIN)
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.stockTransfersService.cancel(id, userId);
  }
}
