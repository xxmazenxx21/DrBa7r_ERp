import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { Trim } from '../../utils/validation/optional';

export class CreateProductUnitDto {
  // الوحدة: an ItemUnit id (GET /item-unit). Not the product's primary unit.
  @IsString()
  @IsNotEmpty()
  itemUnitId: string;

  // عدد القطع في الوحدة: how many primary units one of this unit holds (carton = 12).
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  factor: number;

  // باركود الوحدة (optional, unique). PATCH null clears it.
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  barcode?: string | null;

  // سعر بيع الوحدة (optional, when the carton has its own selling price).
  // PATCH null clears it.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @MaxDecimalPlaces(4)
  @Min(0)
  retailPrice?: number | null;
}
