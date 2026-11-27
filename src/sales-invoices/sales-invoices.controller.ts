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
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto } from './dto/create-sales-invoice.dto';
import { UpdateSalesInvoiceDto } from './dto/update-sales-invoice.dto';
import { SalesInvoiceQueryDto } from './dto/sales-invoice-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('sales-invoices')
export class SalesInvoicesController {
  constructor(private readonly salesInvoicesService: SalesInvoicesService) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreateSalesInvoiceDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesInvoicesService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: SalesInvoiceQueryDto) {
    return this.salesInvoicesService.findAll(query);
  }

  @Get(':id/returnable')
  @Roles(Role.SUPERADMIN)
  returnable(@Param('id') id: string) {
    return this.salesInvoicesService.returnable(id);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.salesInvoicesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesInvoicesService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.salesInvoicesService.remove(id);
  }

  @Post(':id/post')
  @Roles(Role.SUPERADMIN)
  post(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.salesInvoicesService.post(id, userId);
  }

  @Post(':id/cancel')
  @Roles(Role.SUPERADMIN)
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.salesInvoicesService.cancel(id, userId);
  }
}
