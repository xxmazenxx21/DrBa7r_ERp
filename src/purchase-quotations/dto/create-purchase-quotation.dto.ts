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
import { PurchaseQuotationLineDto } from './purchase-quotation-line.dto';

/**
 * Header (الرأس) + lines (البنود). The server computes every total and the
 * code (PQ-2026-000001); never send them.
 */
export class CreatePurchaseQuotationDto {
  // تاريخ العرض: "2026-11-24"
  @IsDateString()
  quotationDate: string;

  // صالح حتى (>= quotationDate). PATCH null clears it.
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  // المورد
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  // الفرع
  @IsString()
  @IsNotEmpty()
  branchId: string;

  // المخزن (optional, must belong to the branch). PATCH null clears it.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string | null;

  // نسبة الخصم % (0-100). Above 0 it wins over discountValue.
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  discountPercent?: number;

  // قيمة الخصم: used only when there is no discountPercent
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  discountValue?: number;

  // نسبة الضريبة % (0-100), e.g. 14
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  taxPercent?: number;

  // ملاحظات. PATCH null clears it.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  // البنود: at least one
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseQuotationLineDto)
  lines: PurchaseQuotationLineDto[];
}
