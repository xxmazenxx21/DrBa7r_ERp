import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Trim } from '../../utils/validation/optional';
import { StockTransferLineDto } from './stock-transfer-line.dto';

/**
 * Header (الرأس) + lines (البنود) of a stock transfer. The server gives the
 * code (ST-2026-000001) and, on post, the cost (unitCost, totalCost).
 */
export class CreateStockTransferDto {
  // تاريخ التحويل "2026-11-29"
  @IsDateString()
  transferDate: string;

  // من مخزن (an active warehouse)
  @IsString()
  @IsNotEmpty()
  fromWarehouseId: string;

  // إلى مخزن (an active warehouse, different from fromWarehouseId; any branch)
  @IsString()
  @IsNotEmpty()
  toWarehouseId: string;

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
  @Type(() => StockTransferLineDto)
  lines: StockTransferLineDto[];
}
