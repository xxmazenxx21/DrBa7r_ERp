import { Module } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersController } from './stock-transfers.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [PrismaModule, NumberingModule, ProductUnitsModule, StockModule],
  controllers: [StockTransfersController],
  providers: [StockTransfersService],
})
export class StockTransfersModule {}
