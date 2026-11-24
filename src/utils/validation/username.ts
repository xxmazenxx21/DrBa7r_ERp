import { applyDecorators } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { Trim } from './optional';

export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

/**
 * username rule (signup, create user, update user): trimmed, 3-30 chars,
 * only letters, digits, dot, underscore, dash. No spaces.
 */
export const IsUsername = (): PropertyDecorator =>
  applyDecorators(
    Trim(),
    IsString(),
    Matches(USERNAME_PATTERN, {
      message:
        'username must be 3-30 characters: letters, digits, dot, underscore or dash only (no spaces)',
    }),
  );
