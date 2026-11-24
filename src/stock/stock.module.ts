import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockMovementsController } from './stock-movements.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StockMovementsController],
  providers: [StockService],
  // product-inventory now, purchase invoices / returns later.
  exports: [StockService],
})
export class StockModule {}
