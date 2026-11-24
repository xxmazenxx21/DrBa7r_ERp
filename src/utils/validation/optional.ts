import { ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Like @IsOptional(), but only `undefined` (field not sent) skips validation.
 * `null` is validated and rejected (400), for optional fields whose DB column
 * is NOT nullable (e.g. creditLimit, reorderLimit). Nullable fields keep
 * @IsOptional(), where sending null clears the value.
 */
export const IsOptionalNotNull = (): PropertyDecorator =>
  ValidateIf((_object, value) => value !== undefined);

/** Trims string input before validation (" ahmed " -> "ahmed"). */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
