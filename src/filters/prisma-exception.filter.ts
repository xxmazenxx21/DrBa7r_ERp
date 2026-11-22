import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { ErrorBody, ErrorCode, errorBody } from '../utils/errors/error-codes';

/**
 * Turns Prisma database errors into clean HTTP responses instead of a 500.
 *   P2002 unique violation      -> 409 Conflict     "username already exists"
 *   P2003 foreign key violation -> 400 Bad Request  "categoryId does not exist"
 *   P2025 record not found      -> 404 Not Found
 * Anything else is logged and returned as 500.
 * Every body also has `code` (ALREADY_EXISTS / DOES_NOT_EXIST / NOT_FOUND /
 * INTERNAL_ERROR) and `field` (column name, or null).
 */

/** The parts of `PrismaClientKnownRequestError.meta` we read. */
interface PrismaErrorMeta {
  target?: string[] | string;
  field_name?: string;
  driverAdapterError?: {
    cause?: { constraint?: { fields?: string[]; index?: string } };
  };
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const fields = this.getFields(exception);
    const field = fields.length ? fields.join(', ') : null;
    let body: ErrorBody;

    switch (exception.code) {
      case 'P2002':
        body = errorBody(
          HttpStatus.CONFLICT,
          field
            ? `${field} already exists`
            : 'A record with this value already exists',
          ErrorCode.ALREADY_EXISTS,
          field,
        );
        break;
      case 'P2003':
        body = errorBody(
          HttpStatus.BAD_REQUEST,
          field ? `${field} does not exist` : 'Related record does not exist',
          ErrorCode.DOES_NOT_EXIST,
          field,
        );
        break;
      case 'P2025':
        body = errorBody(
          HttpStatus.NOT_FOUND,
          'Record not found',
          ErrorCode.NOT_FOUND,
          field,
        );
        break;
      default:
        this.logger.error(`${exception.code}: ${exception.message}`);
        body = errorBody(
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Internal server error',
          ErrorCode.INTERNAL_ERROR,
        );
    }

    res.status(body.statusCode).json(body);
  }

  /** Extracts the column name(s) from the different shapes Prisma uses. */
  private getFields(e: Prisma.PrismaClientKnownRequestError): string[] {
    const meta = (e.meta ?? {}) as PrismaErrorMeta;

    if (Array.isArray(meta.target)) return meta.target;
    if (typeof meta.target === 'string') {
      return [this.fromConstraint(meta.target)];
    }
    if (typeof meta.field_name === 'string') {
      return [this.fromConstraint(meta.field_name)];
    }

    // Driver adapters (e.g. @prisma/adapter-pg) put details here instead.
    const constraint = meta.driverAdapterError?.cause?.constraint;
    if (constraint?.fields?.length) {
      return constraint.fields.map((f) => f.replace(/"/g, ''));
    }
    if (typeof constraint?.index === 'string') {
      return [this.fromConstraint(constraint.index)];
    }
    return [];
  }

  /** "Product_categoryId_fkey" -> "categoryId", "User_username_key" -> "username" */
  private fromConstraint(name: string): string {
    const m = name.match(/^[^_]+_(.+)_(fkey|key|pkey)$/);
    return m ? m[1] : name;
  }
}
