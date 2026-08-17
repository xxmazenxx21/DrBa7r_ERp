import { Module } from '@nestjs/common';
import { ProdcutInventoryService } from './prodcut-inventory.service';
import { ProdcutInventoryController } from './prodcut-inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProdcutInventoryController],
  providers: [ProdcutInventoryService],
})
export class ProdcutInventoryModule {}
