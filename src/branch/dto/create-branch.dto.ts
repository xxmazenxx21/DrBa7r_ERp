import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  code: string;

  @IsOptional()
  @IsString()
  address?: string;
}
