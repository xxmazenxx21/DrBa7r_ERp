import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { Trim } from '../../utils/validation/optional';

/** One line (بند) of a purchase quotation. */
export class PurchaseQuotationLineDto {
  // الصنف
  @IsString()
  @IsNotEmpty()
  productId: string;

  // الوحدة: the primary unit or one of GET /products/:productId/units
  @IsString()
  @IsNotEmpty()
  itemUnitId: string;

  // الكمية in itemUnitId (> 0, max 4 decimals)
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  quantity: number;

  // سعر الوحدة: price of ONE itemUnitId (>= 0)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(4)
  unitPrice: number;

  // نسبة خصم البند % (0-100). Send this OR discountValue, not both.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  discountPercent?: number | null;

  // قيمة خصم البند (fixed amount off this line)
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(4)
  discountValue?: number | null;

  // ملاحظات
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(250)
  notes?: string | null;
}
