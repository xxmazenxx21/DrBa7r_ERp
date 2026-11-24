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
import { PurchaseQuotationsService } from './purchase-quotations.service';
import { CreatePurchaseQuotationDto } from './dto/create-purchase-quotation.dto';
import { UpdatePurchaseQuotationDto } from './dto/update-purchase-quotation.dto';
import { UpdateQuotationStatusDto } from './dto/update-quotation-status.dto';
import { PurchaseQuotationQueryDto } from './dto/purchase-quotation-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('purchase-quotations')
export class PurchaseQuotationsController {
  constructor(
    private readonly purchaseQuotationsService: PurchaseQuotationsService,
  ) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreatePurchaseQuotationDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseQuotationsService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: PurchaseQuotationQueryDto) {
    return this.purchaseQuotationsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.purchaseQuotationsService.findOne(id);
  }

  @Patch(':id/status')
  @Roles(Role.SUPERADMIN)
  changeStatus(@Param('id') id: string, @Body() dto: UpdateQuotationStatusDto) {
    return this.purchaseQuotationsService.changeStatus(id, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseQuotationDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseQuotationsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.purchaseQuotationsService.remove(id);
  }
}
