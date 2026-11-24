import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { ErrorCode, errorBody } from '../errors/error-codes';

/**
 * Totals of any document (quotation, invoice, return), computed ONLY here and
 * ONLY with Prisma.Decimal (never JS numbers: 0.1 + 0.2 !== 0.3).
 * The frontend sends quantities, prices and percents; the server computes
 * every total.
 *
 *   line total    = qty x price - line discount                  (4 decimals)
 *   subTotal      = sum of the line totals                        (2 decimals)
 *   discountValue = subTotal x discountPercent / 100,
 *                   or the discountValue sent if no percent        (2 decimals)
 *   taxValue      = (subTotal - discountValue) x taxPercent / 100  (2 decimals)
 *   netTotal      = subTotal - discountValue + taxValue
 * Rounding: half up. A discount percent wins over a discount value.
 *
 * Example (PDF): calcTotals([1500], 10, undefined, 14)
 *   -> subTotal 1500, discountValue 150, taxValue 189, netTotal 1539
 */

/** Anything Prisma.Decimal accepts: number, numeric string or Decimal. */
export type DecimalInput = Prisma.Decimal | number | string;

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const LINE_DECIMALS = 4; // Decimal(18,4) columns: line totals, quantities
const MONEY_DECIMALS = 2; // Decimal(18,2) columns: document totals

const round = (value: Prisma.Decimal, places: number) =>
  value.toDecimalPlaces(places, Prisma.Decimal.ROUND_HALF_UP);

const toDecimal = (value: DecimalInput | null | undefined) =>
  value === null || value === undefined ? ZERO : new Prisma.Decimal(value);

const badRequest = (message: string, field: string) =>
  new BadRequestException(
    errorBody(400, message, ErrorCode.BAD_REQUEST, field),
  );

/**
 * The discount on `base`: percent of it if a percent is given, otherwise the
 * fixed value (or 0). Throws 400 if the percent is outside 0-100 or the value
 * is negative / bigger than `base`.
 */
function discountOf(
  base: Prisma.Decimal,
  discountPercent?: DecimalInput | null,
  discountValue?: DecimalInput | null,
): Prisma.Decimal {
  if (discountPercent !== undefined && discountPercent !== null) {
    const percent = toDecimal(discountPercent);
    if (percent.lt(0) || percent.gt(100)) {
      throw badRequest(
        'discountPercent must be between 0 and 100',
        'discountPercent',
      );
    }
    return base.mul(percent).div(HUNDRED);
  }
  const value = toDecimal(discountValue);
  if (value.lt(0) || value.gt(base)) {
    throw badRequest(
      'discountValue must be between 0 and the amount it is taken from',
      'discountValue',
    );
  }
  return value;
}

/**
 * One line: qty x price minus the line discount, rounded to 4 decimals.
 * @example calcLine(10, 150)                 // 1500
 * @example calcLine(10, 150, 10)             // 1350 (10% off)
 * @example calcLine(10, 150, undefined, 20)  // 1480 (20 off)
 */
export function calcLine(
  qty: DecimalInput,
  price: DecimalInput,
  discountPercent?: DecimalInput | null,
  discountValue?: DecimalInput | null,
): Prisma.Decimal {
  const gross = toDecimal(qty).mul(toDecimal(price));
  const discount = discountOf(gross, discountPercent, discountValue);
  return round(gross.minus(discount), LINE_DECIMALS);
}

export interface DocumentTotals {
  subTotal: Prisma.Decimal;
  discountValue: Prisma.Decimal;
  taxValue: Prisma.Decimal;
  netTotal: Prisma.Decimal;
}

/**
 * The header totals from the line totals (calcLine results).
 * Tax is taken AFTER the document discount.
 */
export function calcTotals(
  lineTotals: DecimalInput[],
  discountPercent?: DecimalInput | null,
  discountValue?: DecimalInput | null,
  taxPercent?: DecimalInput | null,
): DocumentTotals {
  const subTotal = round(
    lineTotals.reduce<Prisma.Decimal>(
      (sum, line) => sum.plus(toDecimal(line)),
      ZERO,
    ),
    MONEY_DECIMALS,
  );
  const discount = round(
    discountOf(subTotal, discountPercent, discountValue),
    MONEY_DECIMALS,
  );

  const tax = toDecimal(taxPercent);
  if (tax.lt(0) || tax.gt(100)) {
    throw badRequest('taxPercent must be between 0 and 100', 'taxPercent');
  }
  const taxValue = round(
    subTotal.minus(discount).mul(tax).div(HUNDRED),
    MONEY_DECIMALS,
  );

  return {
    subTotal,
    discountValue: discount,
    taxValue,
    netTotal: subTotal.minus(discount).plus(taxValue),
  };
}
