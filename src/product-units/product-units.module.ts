import { Module } from '@nestjs/common';
import { ProductUnitsService } from './product-units.service';
import { ProductUnitsController } from './product-units.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductUnitsController],
  providers: [ProductUnitsService],
  // Documents (quotations, invoices, returns) need getUnitFactor().
  exports: [ProductUnitsService],
})
export class ProductUnitsModule {}
