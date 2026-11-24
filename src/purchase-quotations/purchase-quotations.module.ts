import { Module } from '@nestjs/common';
import { PurchaseQuotationsService } from './purchase-quotations.service';
import { PurchaseQuotationsController } from './purchase-quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { PurchaseInvoicesModule } from '../purchase-invoices/purchase-invoices.module';

@Module({
  imports: [
    PrismaModule,
    NumberingModule,
    ProductUnitsModule,
    PurchaseInvoicesModule, // convert-to-invoice -> createFromQuotation
  ],
  controllers: [PurchaseQuotationsController],
  providers: [PurchaseQuotationsService],
})
export class PurchaseQuotationsModule {}
