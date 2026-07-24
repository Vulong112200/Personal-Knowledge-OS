import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { StorageModule } from './storage/storage.module';
import { DocumentsModule } from './documents/documents.module';
import { QueueModule } from './queue/queue.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { SearchModule } from './search/search.module';
import { AiModule } from './ai/ai.module';
import { EmbeddingModule } from './ai/embedding.module';
import { TagsModule } from './tags/tags.module';
import { GraphModule } from './graph/graph.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    QueueModule,
    AiModule,
    EmbeddingModule,
    WorkspacesModule,
    UsersModule,
    AuthModule,
    DocumentsModule,
    TagsModule,
    GraphModule,
    IngestionModule,
    SearchModule,
    ChatModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
