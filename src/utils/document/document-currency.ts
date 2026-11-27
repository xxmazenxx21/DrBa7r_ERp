import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { assertExists } from '../exists/assert-exists';
import { ErrorCode, errorBody } from '../errors/error-codes';
import { DecimalInput } from './document-totals';

const ONE = new Prisma.Decimal(1);

const badRequest = (message: string, field: string) =>
  new BadRequestException(
    errorBody(400, message, ErrorCode.BAD_REQUEST, field),
  );

/**
 * Currency + exchange rate of a document (purchase invoices, sales invoices):
 *  - no currencyId -> the default currency, rate 1 (400 if there is none)
 *  - the default currency -> rate 1 (another rate -> 400)
 *  - another currency -> exchangeRate is required (> 0, checked by the DTO)
 * `db` = this.prisma, or the transaction (tx) to read inside it.
 */
export async function resolveCurrency(
  db: Prisma.TransactionClient,
  currencyId: string | null | undefined,
  exchangeRate: DecimalInput | null | undefined,
): Promise<{ currencyId: string; exchangeRate: Prisma.Decimal }> {
  const currency = currencyId
    ? await assertExists(db.currency, 'currencyId', currencyId)
    : await db.currency.findFirst({
        where: { isDefault: true, deletedAt: null },
      });
  if (!currency) {
    throw badRequest(
      'There is no default currency: create one (POST /currency) or send currencyId',
      'currencyId',
    );
  }
  const rate =
    exchangeRate === undefined || exchangeRate === null
      ? null
      : new Prisma.Decimal(exchangeRate);
  if (currency.isDefault) {
    if (rate && !rate.eq(1)) {
      throw badRequest(
        'exchangeRate must be 1 for the default currency',
        'exchangeRate',
      );
    }
    return { currencyId: currency.id, exchangeRate: ONE };
  }
  if (!rate) {
    throw badRequest(
      'exchangeRate is required for a currency that is not the default',
      'exchangeRate',
    );
  }
  return { currencyId: currency.id, exchangeRate: rate };
}
