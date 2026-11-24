import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthRequest, JwtPayload } from '../guards/auth.guard';

/**
 * The logged-in user, read from the JWT that AuthGuard already verified
 * (request.user = { sub, username, role }). `sub` is the user's id.
 *
 * Use it for createdBy / postedBy. NEVER take the user id from the body.
 *
 * @example
 * create(@Body() dto: CreateXDto, @CurrentUser() user: JwtPayload)   // whole payload
 * create(@Body() dto: CreateXDto, @CurrentUser('sub') userId: string) // only the id
 */
export const CurrentUser = createParamDecorator(
  (field: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<AuthRequest>().user;
    return field ? user?.[field] : user;
  },
);
