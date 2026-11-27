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
import { StockCountsService } from './stock-counts.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { UpdateStockCountDto } from './dto/update-stock-count.dto';
import { UpdateStockCountLinesDto } from './dto/update-stock-count-lines.dto';
import { StockCountQueryDto } from './dto/stock-count-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

// No /:id/cancel on purpose: a POSTED count is final (Week 3 decision 3).
@Controller('stock-counts')
export class StockCountsController {
  constructor(private readonly stockCountsService: StockCountsService) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(@Body() dto: CreateStockCountDto, @CurrentUser('sub') userId: string) {
    return this.stockCountsService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: StockCountQueryDto) {
    return this.stockCountsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.stockCountsService.findOne(id);
  }

  // before PATCH :id
  @Patch(':id/lines')
  @Roles(Role.SUPERADMIN)
  updateLines(
    @Param('id') id: string,
    @Body() dto: UpdateStockCountLinesDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.stockCountsService.updateLines(id, dto, userId);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStockCountDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.stockCountsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.stockCountsService.remove(id);
  }

  @Post(':id/post')
  @Roles(Role.SUPERADMIN)
  post(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.stockCountsService.post(id, userId);
  }
}
