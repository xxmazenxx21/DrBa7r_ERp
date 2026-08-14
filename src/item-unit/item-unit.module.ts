import { Module } from '@nestjs/common';
import { ItemUnitService } from './item-unit.service';
import { ItemUnitController } from './item-unit.controller';

@Module({
  controllers: [ItemUnitController],
  providers: [ItemUnitService],
})
export class ItemUnitModule {}
