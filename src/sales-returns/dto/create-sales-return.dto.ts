import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { IsOptionalNotNull, Trim } from '../../utils/validation/optional';
import { SalesReturnLineDto } from './sales-return-line.dto';

/**
 * Header (الرأس) + lines (البنود) of a sales return. ALWAYS linked to a
 * POSTED sales invoice (Week 3 decision 2). The server takes customer,
 * branch, warehouse, discount share and tax from the invoice and computes
 * every total, the code (SR-2026-000001) and the cost. No discount / tax /
 * cost fields: they are rejected (400 "should not exist").
 */
export class CreateSalesReturnDto {
  // تاريخ المرتجع "2026-11-28"
  @IsDateString()
  returnDate: string;

  // سبب الإرجاع. null clears.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(250)
  reason?: string | null;

  // فاتورة البيع الأصلية (REQUIRED, must be POSTED)
  @IsString()
  @IsNotEmpty()
  salesInvoiceId: string;

  // العميل: optional; when sent it must be the invoice's customer
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  // الفرع: optional; when sent it must be the invoice's branch
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  branchId?: string;

  // المخزن: optional; when sent it must be the invoice's warehouse
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  // المبلغ المردود للعميل: 0..netTotal (default 0)
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  refundAmount?: number;

  // ملاحظات. null clears.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  // البنود: at least one
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesReturnLineDto)
  lines: SalesReturnLineDto[];
}
