import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCategoryDto {

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}
