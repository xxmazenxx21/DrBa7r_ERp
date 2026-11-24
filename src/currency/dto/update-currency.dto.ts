import { PartialType } from '@nestjs/mapped-types';
import { CreateCurrencyDto } from './create-currency.dto';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateCurrencyDto extends PartialType(CreateCurrencyDto, {
  skipNullProperties: false,
}) {}
