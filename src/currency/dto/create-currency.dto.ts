import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { IsOptionalNotNull, Trim } from '../../utils/validation/optional';

export class CreateCurrencyDto {
  // Sent by the user (the only module where the client sends "code"):
  // ISO 4217, exactly 3 capital letters. Must be unique.
  @Trim()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'code must be exactly 3 capital letters (ISO code, e.g. EGP, USD)',
  })
  code: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  name: string;

  // Optional, e.g. "ج.م" or "$". PATCH null clears it.
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  symbol?: string | null;

  // true -> this becomes THE default currency, every other one becomes false.
  @IsOptionalNotNull()
  @IsBoolean()
  isDefault?: boolean;
}
