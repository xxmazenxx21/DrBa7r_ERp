import { InternalServerErrorException } from '@nestjs/common';

/** `PRD-123456`: the prefix + a random 6-digit number (NOT checked for uniqueness). */
export function generateCode(value: string): string {
  const random = Math.floor(100000 + Math.random() * 900000);

  return `${value}-${random}`;
}

/**
 * The part of a Prisma model delegate (e.g. `prisma.product`, or `tx.product`
 * inside a transaction) this helper uses. Any model with a unique `code` fits.
 */
interface CodeFinder {
  findUnique(args: {
    where: { code: string };
    select: { id: true };
  }): PromiseLike<unknown>;
}

const MAX_TRIES = 10;

/**
 * A server-generated `code` that no row of the model uses yet. Tries up to
 * 10 random codes; `findUnique` also sees soft-deleted rows, so a deleted row
 * keeps its code. 10 collisions in a row -> 500.
 *
 * @example
 * code: await generateUniqueCode(this.prisma.product, 'PRD'),
 */
export async function generateUniqueCode(
  model: CodeFinder,
  prefix: string,
): Promise<string> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const code = generateCode(prefix);
    const taken = await model.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new InternalServerErrorException('Could not generate a unique code');
}
