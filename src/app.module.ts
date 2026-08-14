import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { BranchModule } from './branch/branch.module';
import { InventoryModule } from './inventory/inventory.module';
import { ConfigModule } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { ItemUnitModule } from './item-unit/item-unit.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, BranchModule, InventoryModule, CategoriesModule, ItemUnitModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
