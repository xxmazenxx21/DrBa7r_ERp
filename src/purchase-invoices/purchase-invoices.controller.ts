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
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { UpdatePurchaseInvoiceDto } from './dto/update-purchase-invoice.dto';
import { PurchaseInvoiceQueryDto } from './dto/purchase-invoice-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(
    private readonly purchaseInvoicesService: PurchaseInvoicesService,
  ) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreatePurchaseInvoiceDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseInvoicesService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: PurchaseInvoiceQueryDto) {
    return this.purchaseInvoicesService.findAll(query);
  }

  @Get(':id/returnable')
  @Roles(Role.SUPERADMIN)
  returnable(@Param('id') id: string) {
    return this.purchaseInvoicesService.returnable(id);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.purchaseInvoicesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseInvoiceDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseInvoicesService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.purchaseInvoicesService.remove(id, userId);
  }

  @Post(':id/post')
  @Roles(Role.SUPERADMIN)
  post(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.purchaseInvoicesService.post(id, userId);
  }

  @Post(':id/cancel')
  @Roles(Role.SUPERADMIN)
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.purchaseInvoicesService.cancel(id, userId);
  }
}
