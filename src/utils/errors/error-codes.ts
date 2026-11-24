import { STATUS_CODES } from 'http';

/**
 * Stable, language-independent error codes. Every error response carries one
 * (plus `field`), so the frontend can translate errors without parsing `message`.
 */
export const ErrorCode = {
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DOES_NOT_EXIST: 'DOES_NOT_EXIST',
  BELONGS_TO_DELETED: 'BELONGS_TO_DELETED',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Week 2 (documents and stock):
  INVALID_STATUS: 'INVALID_STATUS', // 409: action not allowed in the document's current status
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK', // 400: not enough quantity in the warehouse
  QUANTITY_EXCEEDED: 'QUANTITY_EXCEEDED', // 400: returning more than was bought
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The shape of EVERY error response. */
export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  code: ErrorCode;
  field: string | null;
}

/**
 * Builds an error body. Pass it to a Nest exception to choose the code/field:
 *   throw new BadRequestException(
 *     errorBody(400, 'categoryId does not exist', ErrorCode.DOES_NOT_EXIST, 'categoryId'),
 *   );
 */
export function errorBody(
  statusCode: number,
  message: string | string[],
  code: ErrorCode,
  field: string | null = null,
): ErrorBody {
  return {
    statusCode,
    message,
    error: STATUS_CODES[statusCode] ?? 'Error',
    code,
    field,
  };
}
