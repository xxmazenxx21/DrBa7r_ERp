import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsOptional()
  nationalId?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsDateString()
  @IsOptional()
  hireDate?: string;
}
