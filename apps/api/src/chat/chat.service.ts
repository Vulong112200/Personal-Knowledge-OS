import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PORT, type AiPort, type ChatMessage } from '../ai/ai.port';
import type { CurrentUserPayload } from '../users/users.service';

const MAX_CONTEXT_CHARS = 6000;
const HISTORY_LIMIT = 10;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PORT) private readonly aiPort: AiPort,
  ) {}

  private async getOrCreateSession(workspaceId: string, documentId: string, userId: string) {
    const existing = await this.prisma.aiChatSession.findFirst({
      where: { workspaceId, documentId, createdBy: userId },
    });
    if (existing) return existing;
    return this.prisma.aiChatSession.create({ data: { workspaceId, documentId, createdBy: userId } });
  }

  async getHistory(user: CurrentUserPayload, documentId: string) {
    const session = await this.getOrCreateSession(user.defaultWorkspaceId, documentId, user.id);
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    return { available: this.aiPort.isAvailable, messages };
  }

  async sendMessage(user: CurrentUserPayload, documentId: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('message is required');

    if (!this.aiPort.isAvailable) {
      return { available: false as const };
    }

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, workspaceId: user.defaultWorkspaceId },
    });
    if (!document) throw new NotFoundException('Document not found');

    const session = await this.getOrCreateSession(user.defaultWorkspaceId, documentId, user.id);
    const documentContent = await this.prisma.documentContent.findUnique({ where: { documentId } });
    const contextText = (documentContent?.textContent ?? '').slice(0, MAX_CONTEXT_CHARS);

    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: HISTORY_LIMIT,
    });

    await this.prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: 'user', content },
    });

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a helpful assistant answering questions about the document titled "${document.title}". Only use the content below to answer; if the answer isn't in it, say so.\n\n${contextText}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: 'user', content },
    ];

    const reply = await this.aiPort.chatComplete(messages);

    await this.prisma.aiChatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: reply },
    });

    return { available: true as const, reply };
  }
}
