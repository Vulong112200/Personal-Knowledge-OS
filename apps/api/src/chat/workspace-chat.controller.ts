import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserPayload } from '../users/users.service';
import { ChatService } from './chat.service';

// Whole-knowledge-base chat: reasons across every document in the workspace via lexical
// RAG retrieval (see ChatService.sendWorkspaceMessage), as opposed to the single-document
// ChatController mounted at documents/:id/chat.
@Controller('chat')
export class WorkspaceChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  history(@CurrentUser() user: CurrentUserPayload) {
    return this.chatService.getWorkspaceHistory(user);
  }

  @Post()
  send(@CurrentUser() user: CurrentUserPayload, @Body('message') message: string) {
    return this.chatService.sendWorkspaceMessage(user, message);
  }
}
