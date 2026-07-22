import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from './users.service';

@Controller()
export class UsersController {
  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }
}
