import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

// skipNullProperties: false -> null is validated: it clears a nullable field
// (declared @IsOptional()) and is rejected (400) for a non-nullable one.
export class UpdateUserDto extends PartialType(CreateUserDto, {
  skipNullProperties: false,
}) {}
