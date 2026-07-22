import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { CurrentUserPayload } from '../users/users.service';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    return ctx.switchToHttp().getRequest().user;
  },
);
