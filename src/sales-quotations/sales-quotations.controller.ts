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
import { SalesQuotationsService } from './sales-quotations.service';
import { CreateSalesQuotationDto } from './dto/create-sales-quotation.dto';
import { UpdateSalesQuotationDto } from './dto/update-sales-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { SalesQuotationQueryDto } from './dto/sales-quotation-query.dto';
import { ConvertToInvoiceDto } from './dto/convert-to-invoice.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('sales-quotations')
export class SalesQuotationsController {
  constructor(
    private readonly salesQuotationsService: SalesQuotationsService,
  ) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreateSalesQuotationDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesQuotationsService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: SalesQuotationQueryDto) {
    return this.salesQuotationsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.salesQuotationsService.findOne(id);
  }

  @Post(':id/convert-to-invoice')
  @Roles(Role.SUPERADMIN)
  convertToInvoice(
    @Param('id') id: string,
    @Body() dto: ConvertToInvoiceDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesQuotationsService.convertToInvoice(id, dto, userId);
  }

  @Patch(':id/status')
  @Roles(Role.SUPERADMIN)
  changeStatus(@Param('id') id: string, @Body() dto: UpdateQuotationStatusDto) {
    return this.salesQuotationsService.changeStatus(id, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesQuotationDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.salesQuotationsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.salesQuotationsService.remove(id);
  }
}
