import { PartialType } from '@nestjs/mapped-types';
import { CreateProductInventoryDto } from './create-product-inventory.dto';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateProductInventoryDto extends PartialType(
  CreateProductInventoryDto,
  { skipNullProperties: false },
) {}
