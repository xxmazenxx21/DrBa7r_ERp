import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { BranchModule } from './branch/branch.module';
import { InventoryModule } from './inventory/inventory.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CategoriesModule } from './categories/categories.module';
import { ItemUnitModule } from './item-unit/item-unit.module';
import { ProductsModule } from './products/products.module';
import { ProductInventoryModule } from './product-inventory/product-inventory.module';
import { CustomerModule } from './customer/customer.module';
import { SupplierModule } from './supplier/supplier.module';
import { EmployeesModule } from './employees/employees.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { NumberingModule } from './numbering/numbering.module';
import { CurrencyModule } from './currency/currency.module';
import { ProductUnitsModule } from './product-units/product-units.module';
import { StockModule } from './stock/stock.module';
import { PurchaseQuotationsModule } from './purchase-quotations/purchase-quotations.module';
import { PurchaseInvoicesModule } from './purchase-invoices/purchase-invoices.module';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'defaultSecret',
        signOptions: { expiresIn: '3650d' },
      }),
      inject: [ConfigService],
      global: true,
    }),
    PrismaModule,
    BranchModule,
    InventoryModule,
    CategoriesModule,
    ItemUnitModule,
    ProductsModule,
    ProductInventoryModule,
    CustomerModule,
    SupplierModule,
    EmployeesModule,
    UsersModule,
    AuthModule,
    NumberingModule,
    CurrencyModule,
    ProductUnitsModule,
    StockModule,
    PurchaseQuotationsModule,
    PurchaseInvoicesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
