import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerDto } from './create-customer.dto';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateCustomerDto extends PartialType(CreateCustomerDto, {
  skipNullProperties: false,
}) {}
