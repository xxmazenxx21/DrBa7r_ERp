import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Turns Prisma database errors into clean HTTP responses instead of a 500.
 *   P2002 unique violation      -> 409 Conflict     "username already exists"
 *   P2003 foreign key violation -> 400 Bad Request  "categoryId does not exist"
 *   P2025 record not found      -> 404 Not Found
 * Anything else is logged and returned as 500.
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
    const fieldText = fields.length ? fields.join(', ') : 'related record';

    let status: number;
    let error: string;
    let message: string;

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        error = 'Conflict';
        message = fields.length
          ? `${fieldText} already exists`
          : 'A record with this value already exists';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        error = 'Bad Request';
        message = fields.length
          ? `${fieldText} does not exist`
          : 'Related record does not exist';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        error = 'Not Found';
        message = 'Record not found';
        break;
      default:
        this.logger.error(`${exception.code}: ${exception.message}`);
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        error = 'Internal Server Error';
        message = 'Internal server error';
    }

    res.status(status).json({ statusCode: status, message, error });
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
