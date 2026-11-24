import { Module } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [PrismaModule, NumberingModule, ProductUnitsModule, StockModule],
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService],
  // purchase-quotations (convert-to-invoice) uses createFromQuotation().
  exports: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
