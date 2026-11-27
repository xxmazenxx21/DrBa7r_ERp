import { Module } from '@nestjs/common';
import { SalesInvoicesService } from './sales-invoices.service';
import { SalesInvoicesController } from './sales-invoices.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [PrismaModule, NumberingModule, ProductUnitsModule, StockModule],
  controllers: [SalesInvoicesController],
  providers: [SalesInvoicesService],
  // sales-quotations (convert-to-invoice) uses createFromQuotation().
  exports: [SalesInvoicesService],
})
export class SalesInvoicesModule {}
