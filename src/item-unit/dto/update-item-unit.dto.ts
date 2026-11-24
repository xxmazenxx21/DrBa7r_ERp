import { PartialType } from '@nestjs/mapped-types';
import { CreateItemUnitDto } from './create-item-unit.dto';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateItemUnitDto extends PartialType(CreateItemUnitDto, {
  skipNullProperties: false,
}) {}
