import { BadRequestException } from '@nestjs/common';
import { ErrorCode, errorBody } from '../errors/error-codes';

/**
 * The part of a Prisma model delegate (e.g. `prisma.branch`) this helper uses.
 * Any model with a `deletedAt` column fits.
 */
interface SoftDeletableFinder<T> {
  findFirst(args: {
    where: { id: string; deletedAt: null };
  }): PromiseLike<T | null>;
}

/** 400 DOES_NOT_EXIST "<field> does not exist" (same body as a DB FK error). */
export function doesNotExist(field: string): BadRequestException {
  return new BadRequestException(
    errorBody(400, `${field} does not exist`, ErrorCode.DOES_NOT_EXIST, field),
  );
}

/**
 * Checks an id sent in a request BODY that points to another record.
 * A missing id and a soft-deleted one are rejected the same way:
 * 400 { code: "DOES_NOT_EXIST", field, message: "<field> does not exist" }.
 * Returns the active row.
 *
 * (Ids in the URL path keep answering 404 NOT_FOUND, for missing and deleted
 * rows alike, e.g. POST /inventory/branch/:branchId.)
 *
 * @example
 * const employee = await assertExists(this.prisma.employee, 'employeeId', dto.employeeId);
 */
export async function assertExists<T>(
  model: SoftDeletableFinder<T>,
  field: string,
  id: string,
): Promise<T> {
  const row = await model.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw doesNotExist(field);
  return row;
}
