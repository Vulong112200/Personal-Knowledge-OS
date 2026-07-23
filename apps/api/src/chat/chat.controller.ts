import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { ChatService } from './chat.service';

@Controller('documents/:id/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  history(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.chatService.getHistory(user, id);
  }

  @Post()
  send(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body('message') message: string,
  ) {
    return this.chatService.sendMessage(user, id, message);
  }
}
