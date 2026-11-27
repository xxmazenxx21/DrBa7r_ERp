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

/** One line (بند) of a sales invoice. The client never sends a cost. */
export class SalesInvoiceLineDto {
  // الصنف
  @IsString()
  @IsNotEmpty()
  productId: string;

  // الوحدة: the primary unit or one of the product's units
  @IsString()
  @IsNotEmpty()
  itemUnitId: string;

  // الكمية in itemUnitId (5 cartons). > 0, max 4 decimals
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  quantity: number;

  // سعر البيع للوحدة: selling price of ONE itemUnitId (180 a carton), >= 0
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

  // قيمة خصم البند
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
