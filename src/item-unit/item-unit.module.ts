import { Module } from '@nestjs/common';
import { ItemUnitService } from './item-unit.service';
import { ItemUnitController } from './item-unit.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports:[PrismaModule],
  controllers: [ItemUnitController],
  providers: [ItemUnitService],
})
export class ItemUnitModule {}
