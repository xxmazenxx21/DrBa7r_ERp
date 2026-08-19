import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsNumber,
	Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
	@IsString()
	@IsNotEmpty()
	code: string;

	@IsString()
	@IsNotEmpty()
	name: string;

	@IsOptional()
	@IsString()
	taxNumber?: string;

	@IsOptional()
	@IsString()
	contactPerson?: string;

	@IsOptional()
	@IsString()
	phone?: string;

	@IsOptional()
	@IsEmail()
	email?: string;

	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	openingBalance?: number;
}
