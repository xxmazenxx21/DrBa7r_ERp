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
import { SalesReturnsService } from './sales-returns.service';
import { CreateSalesReturnDto } from './dto/create-sales-return.dto';
import { UpdateSalesReturnDto } from './dto/update-sales-return.dto';
import { SalesReturnQueryDto } from './dto/sales-return-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('sales-returns')
export class SalesReturnsController {
  constructor(private readonly salesReturnsService: SalesReturnsService) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreateSalesReturnDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesReturnsService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: SalesReturnQueryDto) {
    return this.salesReturnsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.salesReturnsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesReturnDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesReturnsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.salesReturnsService.remove(id);
  }

  @Post(':id/post')
  @Roles(Role.SUPERADMIN)
  post(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.salesReturnsService.post(id, userId);
  }

  @Post(':id/cancel')
  @Roles(Role.SUPERADMIN)
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.salesReturnsService.cancel(id, userId);
  }
}
