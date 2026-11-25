import { Module } from '@nestjs/common';
import { PurchaseReturnsService } from './purchase-returns.service';
import { PurchaseReturnsController } from './purchase-returns.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { StockModule } from '../stock/stock.module';

// Reads the purchase-invoice tables directly; does NOT import the
// purchase-invoices module and never writes invoices.
@Module({
  imports: [PrismaModule, NumberingModule, ProductUnitsModule, StockModule],
  controllers: [PurchaseReturnsController],
  providers: [PurchaseReturnsService],
})
export class PurchaseReturnsModule {}
