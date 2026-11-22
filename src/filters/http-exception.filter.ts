import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { STATUS_CODES } from 'http';
import { ErrorBody, ErrorCode, errorBody } from '../utils/errors/error-codes';

/**
 * Catch-all filter: gives EVERY error response the same shape
 *   { statusCode, message, error, code, field }
 * without changing any message text.
 *
 * - An exception thrown with errorBody(...) already has code/field: kept as is.
 * - Otherwise the code comes from the status:
 *     400 + message array -> VALIDATION_FAILED, other 4xx -> BAD_REQUEST,
 *     401 -> UNAUTHORIZED, 403 -> FORBIDDEN, 404 -> NOT_FOUND,
 *     409 -> ALREADY_EXISTS, 5xx / unknown errors -> INTERNAL_ERROR.
 * Prisma errors are handled by PrismaExceptionFilter (registered after this one).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    res.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
      return errorBody(500, 'Internal server error', ErrorCode.INTERNAL_ERROR);
    }

    const status = exception.getStatus();
    const raw = exception.getResponse();
    const res: Partial<ErrorBody> =
      typeof raw === 'string' ? { message: raw } : raw;
    const message = res.message ?? exception.message;

    return {
      statusCode: status,
      message,
      error: res.error ?? STATUS_CODES[status] ?? 'Error',
      code: res.code ?? this.codeFor(status, message),
      field: res.field ?? null,
    };
  }

  private codeFor(status: number, message: string | string[]): ErrorCode {
    switch (status) {
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.ALREADY_EXISTS;
    }
    if (status === 400 && Array.isArray(message)) {
      return ErrorCode.VALIDATION_FAILED;
    }
    if (status >= 400 && status < 500) return ErrorCode.BAD_REQUEST;
    return ErrorCode.INTERNAL_ERROR;
  }
}
