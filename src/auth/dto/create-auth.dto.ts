import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  MinLength,
  IsEnum,
} from 'class-validator';
import { Role } from '../../utils/enum/enum';
import { IsUsername } from '../../utils/validation/username';

export class CreateAuthDto {
  // trimmed; 3-30 chars: letters, digits . _ - (no spaces)
  @IsUsername()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsEmail()
  @IsOptional()
  email?: string | null;

  @IsString()
  @IsOptional()
  employeeId?: string | null;

  @IsString()
  @IsOptional()
  branchId?: string | null;

  // Accepted so sending it is not a validation error, but NEVER used:
  // signup always creates a SUPERADMIN.
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
