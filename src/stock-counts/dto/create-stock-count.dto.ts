import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../utils/validation/optional';

/**
 * Opens a stock count (فتح جرد). Only the header: the server makes the lines
 * itself, one per stock row of the warehouse (sending "lines" -> 400).
 */
export class CreateStockCountDto {
  // تاريخ الجرد "2026-11-30"
  @IsDateString()
  countDate: string;

  // المخزن (an active warehouse with at least one STOCK product)
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  // ملاحظات. null clears.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
