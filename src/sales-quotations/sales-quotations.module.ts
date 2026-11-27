import { Module } from '@nestjs/common';
import { SalesQuotationsService } from './sales-quotations.service';
import { SalesQuotationsController } from './sales-quotations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NumberingModule } from '../numbering/numbering.module';
import { ProductUnitsModule } from '../product-units/product-units.module';

@Module({
  imports: [PrismaModule, NumberingModule, ProductUnitsModule],
  controllers: [SalesQuotationsController],
  providers: [SalesQuotationsService],
})
export class SalesQuotationsModule {}
