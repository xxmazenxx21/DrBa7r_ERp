import {
    IsArray,
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductInventoryDto {
    @IsString()
    @IsNotEmpty()
    inventoryId: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    quantity: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    costPrice: number;
}

export class CreateProductDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsOptional()
    @IsString()
    barcode?: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    categoryId: string;

    @IsString()
    @IsNotEmpty()
    primaryIteamUnitId: string;

    @Type(() => Number)
    @IsInt()
    @IsNotEmpty()
    itemType: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    costingMethod?: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    retailPrice: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    wholesalePrice: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    bulkWholesalePrice: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    reorderLimit?: number;

    @IsOptional()
    @IsBoolean()
    hasExpiryDate?: boolean;


}

