import { PartialType } from '@nestjs/mapped-types';
import { CreateProductUnitDto } from './create-product-unit.dto';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateProductUnitDto extends PartialType(CreateProductUnitDto, {
  skipNullProperties: false,
}) {}
