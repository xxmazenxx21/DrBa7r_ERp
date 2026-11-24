import { HttpException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import type { Product } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ProductUnitsService } from '../../product-units/product-units.service';
import { assertExists } from '../exists/assert-exists';
import { ErrorCode, ErrorBody, errorBody } from '../errors/error-codes';
import { calcLine, DecimalInput } from './document-totals';

/** What every document line (quotation, invoice, return) sends. */
export interface DocumentLineInput {
  productId: string;
  itemUnitId: string;
  quantity: DecimalInput; // in itemUnitId (e.g. 10 cartons)
  price: DecimalInput; // price / cost of ONE itemUnitId (e.g. 150 a carton)
  discountPercent?: DecimalInput | null;
  discountValue?: DecimalInput | null;
}

/** A line after the server checked and priced it. */
export interface ResolvedLine {
  product: Product;
  unitFactor: Prisma.Decimal; // pieces in one itemUnitId (getUnitFactor)
  baseQuantity: Prisma.Decimal; // quantity x unitFactor = pieces (4 dp)
  lineTotal: Prisma.Decimal; // calcLine (4 dp)
}

/**
 * Runs `work` for line `index`; an error about "itemUnitId" becomes an error
 * about "lines.<index>.itemUnitId", so the frontend knows WHICH line is wrong.
 */
export async function inLine<T>(
  index: number,
  work: () => Promise<T> | T,
): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof HttpException) {
      const body = e.getResponse() as Partial<ErrorBody>;
      if (typeof body === 'object' && body.code) {
        const field = body.field
          ? `lines.${index}.${body.field}`
          : `lines.${index}`;
        throw new HttpException({ ...body, field }, e.getStatus());
      }
    }
    throw e;
  }
}

/**
 * Checks and prices every line, in order:
 *  - productId must be an active product          -> 400 DOES_NOT_EXIST
 *  - only ONE of discountPercent / discountValue   -> 400 VALIDATION_FAILED
 *  - itemUnitId must be a unit of the product      -> 400 (getUnitFactor)
 *  - lineTotal = calcLine(quantity, price, %, value)
 * Errors carry field "lines.<i>.<field>".
 */
export async function resolveLines(
  prisma: PrismaService,
  productUnits: ProductUnitsService,
  lines: DocumentLineInput[],
): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = [];
  for (const [i, line] of lines.entries()) {
    resolved.push(
      await inLine(i, async () => {
        const product = await assertExists(
          prisma.product,
          'productId',
          line.productId,
        );
        const hasPercent =
          line.discountPercent !== undefined && line.discountPercent !== null;
        const hasValue =
          line.discountValue !== undefined && line.discountValue !== null;
        if (hasPercent && hasValue) {
          throw new HttpException(
            errorBody(
              400,
              [`lines.${i}: send discountPercent or discountValue, not both`],
              ErrorCode.VALIDATION_FAILED,
              'discountValue',
            ),
            400,
          );
        }
        const unitFactor = await productUnits.getUnitFactor(
          line.productId,
          line.itemUnitId,
        );
        const quantity = new Prisma.Decimal(line.quantity);
        return {
          product,
          unitFactor,
          baseQuantity: quantity
            .mul(unitFactor)
            .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
          lineTotal: calcLine(
            quantity,
            line.price,
            line.discountPercent,
            line.discountValue,
          ),
        };
      }),
    );
  }
  return resolved;
}

/**
 * The document discount to give calcTotals: a discountPercent above 0 wins,
 * otherwise the fixed discountValue (0 if none).
 */
export function headerDiscount(
  discountPercent: DecimalInput | null | undefined,
  discountValue: DecimalInput | null | undefined,
): { percent?: DecimalInput; value?: DecimalInput } {
  const percent = new Prisma.Decimal(discountPercent ?? 0);
  return percent.gt(0) ? { percent } : { value: discountValue ?? 0 };
}

/**
 * Filter for a @db.Date column: dateFrom / dateTo inclusive ("2026-11-30"
 * includes the whole day).
 */
export function dateFilter(
  dateFrom?: string,
  dateTo?: string,
): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (dateFrom) range.gte = new Date(dateFrom.slice(0, 10));
  if (dateTo) range.lte = new Date(dateTo.slice(0, 10));
  return range;
}

/** Today as a @db.Date (UTC midnight). */
export function todayDate(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

/** A document's warehouse must be an active warehouse of ITS branch. */
export async function assertWarehouseInBranch(
  prisma: PrismaService,
  warehouseId: string,
  branchId: string,
): Promise<void> {
  const warehouse = await assertExists(
    prisma.inventory,
    'warehouseId',
    warehouseId,
  );
  if (warehouse.branchId !== branchId) {
    throw new HttpException(
      errorBody(
        400,
        'warehouseId must belong to branchId',
        ErrorCode.BAD_REQUEST,
        'warehouseId',
      ),
      400,
    );
  }
}

/** "2026-11-24" or "2026-11-24T10:00:00Z" -> 2026-11-24 as a @db.Date. */
export function toDate(value: string): Date {
  return new Date(value.slice(0, 10));
}

/** 400 if `later` (e.g. validUntil / dueDate) is before `earlier`. */
export function assertNotBefore(
  later: Date | null | undefined,
  earlier: Date,
  field: string,
  earlierField: string,
): void {
  if (later && later < earlier) {
    throw new HttpException(
      errorBody(
        400,
        `${field} must be on or after ${earlierField}`,
        ErrorCode.BAD_REQUEST,
        field,
      ),
      400,
    );
  }
}

/** 409 INVALID_STATUS: the action is not allowed in the document's status. */
export function invalidStatus(message: string): HttpException {
  return new HttpException(
    errorBody(409, message, ErrorCode.INVALID_STATUS, 'status'),
    409,
  );
}
