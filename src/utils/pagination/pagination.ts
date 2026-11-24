import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Query string of every new (paginated) list: ?page=1&pageSize=20
 * page >= 1 (default 1), pageSize 1-100 (default 20). Anything else -> 400.
 * A list with more filters extends this class.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}

/** { page, pageSize } with the defaults filled in. */
function resolve(query: PaginationQueryDto) {
  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

/**
 * The Prisma part of a page: spread it into findMany.
 * page 3, pageSize 20 -> { skip: 40, take: 20 } (skip the first 2 pages).
 */
export function pageArgs(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  const { page, pageSize } = resolve(query);
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * The "data" of a paginated list:
 * { items: [...], meta: { page, pageSize, total, totalPages } }
 *
 * @example
 * const where = { deletedAt: null };
 * const [items, total] = await this.prisma.$transaction([
 *   this.prisma.x.findMany({ where, ...pageArgs(query) }),
 *   this.prisma.x.count({ where }),
 * ]);
 * return ok('...', paginated(items, total, query));
 */
export function paginated<T>(
  items: T[],
  total: number,
  query: PaginationQueryDto,
): Paginated<T> {
  const { page, pageSize } = resolve(query);
  return {
    items,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
