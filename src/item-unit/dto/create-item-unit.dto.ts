import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateItemUnitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}
