import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from './users.service';
import { UserDeletionService } from './user-deletion.service';

@Controller()
export class UsersController {
  constructor(private readonly userDeletion: UserDeletionService) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: CurrentUserPayload) {
    await this.userDeletion.deleteAccount(user.id);
  }
}
