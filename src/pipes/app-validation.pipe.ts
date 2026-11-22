import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';

/**
 * The global ValidationPipe:
 * - whitelist + forbidNonWhitelisted: unknown body fields -> 400 "property X should not exist"
 * - transform: plain JSON -> DTO instances (@Type conversions)
 * Errors keep Nest's default message array and add code VALIDATION_FAILED and
 * field = the first invalid property.
 */
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  }

  createExceptionFactory() {
    return (errors: ValidationError[] = []) =>
      new BadRequestException(
        errorBody(
          400,
          this.flattenValidationErrors(errors),
          ErrorCode.VALIDATION_FAILED,
          errors[0]?.property ?? null,
        ),
      );
  }
}
