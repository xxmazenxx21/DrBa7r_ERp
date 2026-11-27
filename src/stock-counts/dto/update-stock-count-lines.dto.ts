import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';

/** One counted line: the line of THIS count + what is really on the shelf. */
export class StockCountLineCountDto {
  // the line id (from GET /stock-counts/:id)
  @IsString()
  @IsNotEmpty()
  lineId: string;

  // الكمية الفعلية in pieces (the primary unit), >= 0, max 4 decimals.
  // null = not counted (clears an earlier count). Required: send a number or null.
  @ValidateIf((o: StockCountLineCountDto) => o.countedQuantity !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(4)
  countedQuantity: number | null;
}

/** PATCH /stock-counts/:id/lines (DRAFT only). Only the lines sent change. */
export class UpdateStockCountLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineCountDto)
  lines: StockCountLineCountDto[];
}
