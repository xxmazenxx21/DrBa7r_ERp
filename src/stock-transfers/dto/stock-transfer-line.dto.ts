import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { Trim } from '../../utils/validation/optional';

/**
 * One line (بند) of a stock transfer: which product, in which unit, how many.
 * No price and no cost: the cost is the source warehouse's average, set by
 * the server when the transfer is posted (unitCost is rejected: 400).
 */
export class StockTransferLineDto {
  // الصنف (a STOCK product; SERVICE -> 400)
  @IsString()
  @IsNotEmpty()
  productId: string;

  // الوحدة: the primary unit or one of the product's units
  @IsString()
  @IsNotEmpty()
  itemUnitId: string;

  // الكمية in itemUnitId (> 0, max 4 decimals)
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  quantity: number;

  // ملاحظات
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(250)
  notes?: string | null;
}
