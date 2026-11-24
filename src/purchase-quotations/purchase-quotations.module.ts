import { Module } from '@nestjs/common';
import { PurchaseQuotationsService } from './purchase-quotations.service';
import { PurchaseQuotationsController } from './purchase-quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';

@Module({
  imports: [PrismaModule, NumberingModule, ProductUnitsModule],
  controllers: [PurchaseQuotationsController],
  providers: [PurchaseQuotationsService],
})
export class PurchaseQuotationsModule {}
