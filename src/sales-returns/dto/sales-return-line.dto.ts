import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { IsOptionalNotNull, Trim } from '../../utils/validation/optional';

/**
 * One line (بند) of a sales return: which invoice line + how many (in that
 * line's unit). Product, unit, factor, price and cost ALWAYS come from the
 * invoice line: productId / itemUnitId / unitPrice are accepted (so the
 * frontend can send the invoice line back as it is) but ignored. A cost
 * (stockUnitCost, lineCost) is never accepted: 400 "should not exist".
 */
export class SalesReturnLineDto {
  // بند الفاتورة الأصلي (REQUIRED, a line of salesInvoiceId)
  @IsString()
  @IsNotEmpty()
  salesInvoiceLineId: string;

  // الكمية in the invoice line's unit (> 0, max 4 decimals)
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  quantity: number;

  // ignored (from the invoice line)
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  // ignored (from the invoice line)
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  itemUnitId?: string;

  // ignored (= invoice lineTotal / quantity)
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(4)
  unitPrice?: number;

  // ملاحظات
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(250)
  notes?: string | null;
}
