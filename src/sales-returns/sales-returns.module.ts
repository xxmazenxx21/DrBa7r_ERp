import { Module } from '@nestjs/common';
import { SalesReturnsService } from './sales-returns.service';
import { SalesReturnsController } from './sales-returns.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { StockModule } from '../stock/stock.module';

// Reads the sales-invoice tables directly; does NOT import the sales-invoices
// module and never writes invoices. No ProductUnitsModule: a return line takes
// its unit and factor from the invoice line.
@Module({
  imports: [PrismaModule, NumberingModule, StockModule],
  controllers: [SalesReturnsController],
  providers: [SalesReturnsService],
})
export class SalesReturnsModule {}
