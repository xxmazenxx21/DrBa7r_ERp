import { Module } from '@nestjs/common';
import { SalesQuotationsService } from './sales-quotations.service';
import { SalesQuotationsController } from './sales-quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { SalesInvoicesModule } from '../sales-invoices/sales-invoices.module';

@Module({
  imports: [
    PrismaModule,
    NumberingModule,
    ProductUnitsModule,
    SalesInvoicesModule, // convert-to-invoice -> createFromQuotation
  ],
  controllers: [SalesQuotationsController],
  providers: [SalesQuotationsService],
})
export class SalesQuotationsModule {}
