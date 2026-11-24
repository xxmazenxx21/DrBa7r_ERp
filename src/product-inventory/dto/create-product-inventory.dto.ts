import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';

export class CreateProductInventoryDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  // Ignored: the warehouse comes from the URL (:inventoryId).
  @IsOptional()
  @IsString()
  inventoryId?: string;

  @Type(() => Number)
  @IsNumber()
  @MaxDecimalPlaces(4)
  @Min(0)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @MaxDecimalPlaces(4)
  @Min(0)
  costPrice: number;
}
