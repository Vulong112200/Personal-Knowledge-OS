import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { WorkspaceChatController } from './workspace-chat.controller';

@Module({
  controllers: [ChatController, WorkspaceChatController],
  providers: [ChatService],
})
export class ChatModule {}
