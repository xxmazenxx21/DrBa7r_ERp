import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  MinLength,
  IsEnum,
} from 'class-validator';
import { Role } from '../../utils/enum/enum';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsEnum(Role)
  role: Role;
}
