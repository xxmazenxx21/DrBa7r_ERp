import { ValidateBy, ValidationOptions } from 'class-validator';

/** Number of digits after the decimal point, also for 1e-7 style numbers. */
export function countDecimalPlaces(value: number): number {
  const [mantissa, exponent] = value.toString().toLowerCase().split('e');
  const decimals = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, decimals - Number(exponent ?? 0));
}

/**
 * Rejects numbers with more than `max` decimal places, so the DB never rounds
 * silently. Use 4 for prices / quantities / costs, 2 for money amounts.
 * Combine with @IsNumber() (this one passes non-numbers through to it).
 * (class-validator's own `maxDecimalPlaces` throws on values like 1e-7.)
 */
export function MaxDecimalPlaces(
  max: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'maxDecimalPlaces',
      constraints: [max],
      validator: {
        validate: (value: unknown) =>
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          countDecimalPlaces(value) <= max,
        defaultMessage: (args) =>
          `${args?.property} must have at most ${max} decimal places`,
      },
    },
    validationOptions,
  );
}
