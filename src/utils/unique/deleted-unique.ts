import { ConflictException } from '@nestjs/common';
import { ErrorCode, errorBody } from '../errors/error-codes';

/**
 * The part of a Prisma model delegate (e.g. `prisma.employee`) this helper uses.
 * Any model with a `deletedAt` column fits.
 */
interface SoftDeletableDelegate {
  findFirst(args: {
    where: Record<string, unknown>;
    select: { id: true };
  }): PromiseLike<{ id: string } | null>;
}

/**
 * Unique columns still count soft-deleted rows, so reusing a value that belongs
 * to a deleted row fails in the DB. This gives that case a clear 409 BEFORE the
 * write, e.g. "nationalId belongs to a deleted employee".
 *
 * Values used by an ACTIVE row are not checked here: the write fails and the
 * PrismaExceptionFilter answers 409 "<field> already exists".
 * Undefined / null values are skipped (field not sent).
 *
 * @example
 * await assertNotUsedByDeleted(this.prisma.user, 'user', {
 *   username: dto.username,
 *   email: dto.email,
 * });
 */
export async function assertNotUsedByDeleted(
  model: SoftDeletableDelegate,
  entityName: string,
  fields: Record<string, string | null | undefined>,
): Promise<void> {
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const deletedRow = await model.findFirst({
      where: { [field]: value, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deletedRow) {
      throw new ConflictException(
        errorBody(
          409,
          `${field} belongs to a deleted ${entityName}`,
          ErrorCode.BELONGS_TO_DELETED,
          field,
        ),
      );
    }
  }
}
