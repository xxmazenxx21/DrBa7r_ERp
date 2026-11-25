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
 * One line (بند) of a purchase return.
 * - Linked return (purchaseInvoiceId sent): send purchaseInvoiceLineId +
 *   quantity. productId / itemUnitId / unitCost come from the invoice line
 *   (anything sent for them is ignored).
 * - Not linked: send productId, itemUnitId, quantity and unitCost.
 */
export class PurchaseReturnLineDto {
  // بند الفاتورة الأصلي (linked returns only)
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  purchaseInvoiceLineId?: string;

  // الصنف (not linked)
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  // الوحدة (not linked): the primary unit or one of the product's units
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  itemUnitId?: string;

  // الكمية in the line's unit (> 0, max 4 decimals)
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  quantity: number;

  // سعر الوحدة (not linked), >= 0
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(4)
  unitCost?: number;

  // ملاحظات
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(250)
  notes?: string | null;
}
