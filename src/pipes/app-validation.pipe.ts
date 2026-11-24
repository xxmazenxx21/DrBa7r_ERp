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
 * field = the path of the first invalid property: "name", or for nested
 * objects / arrays the full path, e.g. "lines.0.quantity".
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
          errors[0] ? firstErrorPath(errors[0]) : null,
        ),
      );
  }
}

/** "lines" -> "0" -> "quantity" becomes "lines.0.quantity" (first leaf error). */
function firstErrorPath(error: ValidationError): string {
  let path = error.property;
  let current = error;
  while (!current.constraints && current.children?.length) {
    current = current.children[0];
    path += `.${current.property}`;
  }
  return path;
}
