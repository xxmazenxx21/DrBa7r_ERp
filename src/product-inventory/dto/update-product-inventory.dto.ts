import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateProductInventoryDto } from './create-product-inventory.dto';
import { Trim } from '../../utils/validation/optional';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateProductInventoryDto extends PartialType(
  CreateProductInventoryDto,
  { skipNullProperties: false },
) {
  // السبب: REQUIRED when quantity or costPrice actually changes (checked in
  // StockService.adjust); saved on the ADJUSTMENT movement. Max 250 chars.
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  reason?: string;
}
