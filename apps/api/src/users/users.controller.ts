import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from './users.service';
import { UsersService } from './users.service';
import { UserDeletionService } from './user-deletion.service';

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly userDeletion: UserDeletionService,
  ) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }

  @Patch('me')
  updateMe(@CurrentUser() user: CurrentUserPayload, @Body('displayName') displayName?: string) {
    if (typeof displayName !== 'string') {
      throw new BadRequestException('displayName is required');
    }
    return this.users.updateDisplayName(user, displayName);
  }

  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: CurrentUserPayload) {
    await this.userDeletion.deleteAccount(user.id);
  }
}
