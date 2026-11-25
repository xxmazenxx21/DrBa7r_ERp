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
import { PurchaseReturnsService } from './purchase-returns.service';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto';
import { UpdatePurchaseReturnDto } from './dto/update-purchase-return.dto';
import { PurchaseReturnQueryDto } from './dto/purchase-return-query.dto';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Role } from '../utils/enum/enum';

@Controller('purchase-returns')
export class PurchaseReturnsController {
  constructor(
    private readonly purchaseReturnsService: PurchaseReturnsService,
  ) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(
    @Body() dto: CreatePurchaseReturnDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseReturnsService.create(dto, userId);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll(@Query() query: PurchaseReturnQueryDto) {
    return this.purchaseReturnsService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.purchaseReturnsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseReturnDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.purchaseReturnsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.purchaseReturnsService.remove(id);
  }

  @Post(':id/post')
  @Roles(Role.SUPERADMIN)
  post(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.purchaseReturnsService.post(id, userId);
  }

  @Post(':id/cancel')
  @Roles(Role.SUPERADMIN)
  cancel(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.purchaseReturnsService.cancel(id, userId);
  }
}
