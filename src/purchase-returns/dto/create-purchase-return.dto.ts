import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { IsOptionalNotNull, Trim } from '../../utils/validation/optional';
import { PurchaseReturnLineDto } from './purchase-return-line.dto';

/**
 * Header (الرأس) + lines (البنود). The server computes every total and the
 * code (PR-2026-000001).
 * Linked to an invoice (purchaseInvoiceId): supplier / branch / warehouse
 * default to the invoice's, and discount + tax come from the invoice.
 */
export class CreatePurchaseReturnDto {
  // تاريخ المرتجع "2026-11-25"
  @IsDateString()
  returnDate: string;

  // سبب الإرجاع: تالف، زيادة، غلط... null clears.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(250)
  reason?: string | null;

  // فاتورة الشراء الأصلية (optional, must be POSTED). PATCH null unlinks.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  purchaseInvoiceId?: string | null;

  // المورد: required when not linked; when linked it must be the invoice's
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  supplierId?: string;

  // الفرع: required when not linked (linked: the invoice's if not sent)
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  branchId?: string;

  // المخزن: required when not linked (linked: the invoice's if not sent)
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  // نسبة الخصم % (not linked only; linked -> from the invoice)
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  discountPercent?: number;

  // قيمة الخصم (not linked only, when there is no discountPercent)
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  discountValue?: number;

  // نسبة الضريبة % (not linked only; linked -> from the invoice)
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  taxPercent?: number;

  // المبلغ المسترد: cash the supplier gave back, 0..netTotal (default 0)
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
  @Type(() => PurchaseReturnLineDto)
  lines: PurchaseReturnLineDto[];
}
