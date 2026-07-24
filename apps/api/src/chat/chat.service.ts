import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PORT, type AiPort, type ChatMessage } from '../ai/ai.port';
import { SEARCH_PORT, type SearchPort, type ChunkHit } from '../search/search.port';
import type { CurrentUserPayload } from '../users/users.service';

const MAX_CONTEXT_CHARS = 6000; // per-document chat
const MAX_WORKSPACE_CONTEXT_CHARS = 8000; // whole-knowledge-base chat
const HISTORY_LIMIT = 10;
const PER_DOC_CHUNK_K = 6;
const WORKSPACE_CHUNK_K = 8;

export interface ChatSource {
  index: number;
  documentId: string;
  title: string;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PORT) private readonly aiPort: AiPort,
    @Inject(SEARCH_PORT) private readonly searchPort: SearchPort,
  ) {}

  // --- sessions --------------------------------------------------------------

  private async getOrCreateSession(workspaceId: string, documentId: string | null, userId: string) {
    const where = { workspaceId, documentId, createdBy: userId };
    const existing = await this.prisma.aiChatSession.findFirst({ where });
    if (existing) return existing;
    try {
      return await this.prisma.aiChatSession.create({ data: where });
    } catch (err: any) {
      // Concurrent first messages can both miss the findFirst and race on create.
      // The unique constraint (per-document) / partial unique index (workspace-wide,
      // documentId IS NULL) turns the loser into a P2002 — re-read the winner's row.
      if (err?.code === 'P2002') {
        return this.prisma.aiChatSession.findFirstOrThrow({ where });
      }
      throw err;
    }
  }

  private async recentHistory(sessionId: string): Promise<ChatMessage[]> {
    // Newest HISTORY_LIMIT messages, returned in chronological order for the model.
    const recent = await this.prisma.aiChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    return recent.reverse().map((m) => ({ role: m.role, content: m.content }) as ChatMessage);
  }

  private async requireOwnedDocument(user: CurrentUserPayload, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, workspaceId: user.defaultWorkspaceId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  /** Call the AI, converting any transport/empty-reply failure into a clean 503 instead of
   * a 500, and never persisting anything until we have a usable reply (so a failure can't
   * leave an orphaned user message polluting the next turn's context window). */
  private async complete(messages: ChatMessage[], logContext: string): Promise<string> {
    let reply: string;
    try {
      reply = await this.aiPort.chatComplete(messages);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Chat completion failed (${logContext}): ${message}`);
      throw new ServiceUnavailableException('The AI service failed to respond. Please try again.');
    }
    if (!reply?.trim()) {
      throw new ServiceUnavailableException('The AI service returned an empty response. Please try again.');
    }
    return reply;
  }

  private persistTurn(sessionId: string, userContent: string, assistantContent: string) {
    // Postgres now()/CURRENT_TIMESTAMP is transaction-stable, so both rows created in one
    // $transaction would share an identical created_at and their intra-turn order (ordered
    // by created_at alone) would be undefined. Stamp explicit timestamps 1ms apart so the
    // user message always sorts before its assistant reply.
    const now = Date.now();
    return this.prisma.$transaction([
      this.prisma.aiChatMessage.create({
        data: { sessionId, role: 'user', content: userContent, createdAt: new Date(now) },
      }),
      this.prisma.aiChatMessage.create({
        data: { sessionId, role: 'assistant', content: assistantContent, createdAt: new Date(now + 1) },
      }),
    ]);
  }

  /** Assemble numbered RAG context from retrieved chunks, capped at maxChars, plus the
   * de-duplicated list of source documents cited by [#n] markers. */
  private buildContext(hits: ChunkHit[], maxChars: number): { context: string; sources: ChatSource[] } {
    const sources: ChatSource[] = [];
    const indexByDocument = new Map<string, number>();
    const parts: string[] = [];
    let used = 0;

    for (const hit of hits) {
      const existing = indexByDocument.get(hit.documentId);
      const index = existing ?? sources.length + 1;
      const part = `[#${index}] ${hit.title}\n${hit.content}`;
      // Check the budget BEFORE recording the source, so `sources` never cites a document
      // whose text didn't actually make it into `context` (which would mislabel citations
      // and, if the first hit overflows, contradict the "nothing matched" system prompt).
      if (used + part.length > maxChars) break;
      if (existing === undefined) {
        indexByDocument.set(hit.documentId, index);
        sources.push({ index, documentId: hit.documentId, title: hit.title });
      }
      parts.push(part);
      used += part.length;
    }

    return { context: parts.join('\n\n'), sources };
  }

  // --- per-document chat -----------------------------------------------------

  async getHistory(user: CurrentUserPayload, documentId: string) {
    // Verify ownership before touching sessions, so we never materialize a session row
    // pointing at a document outside the caller's workspace.
    await this.requireOwnedDocument(user, documentId);
    const session = await this.getOrCreateSession(user.defaultWorkspaceId, documentId, user.id);
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    return { available: this.aiPort.isAvailable, messages };
  }

  async sendMessage(user: CurrentUserPayload, documentId: string, content: string) {
    if (!content?.trim()) throw new BadRequestException('message is required');
    if (!this.aiPort.isAvailable) return { available: false as const };

    const document = await this.requireOwnedDocument(user, documentId);

    const documentContent = await this.prisma.documentContent.findUnique({ where: { documentId } });
    const fullText = (documentContent?.textContent ?? '').trim();
    if (!fullText) {
      throw new ConflictException(
        'This document is not ready to chat yet — it has no extracted text (still processing, needs OCR, or empty).',
      );
    }

    // Retrieve the most relevant chunks WITHIN this document for the question; fall back to
    // the head of the document when nothing matches (e.g. a very short/generic question).
    const hits = await this.searchPort.searchChunks(
      user.defaultWorkspaceId,
      content,
      PER_DOC_CHUNK_K,
      documentId,
    );
    const contextText = hits.length
      ? hits.map((h) => h.content).join('\n\n---\n\n').slice(0, MAX_CONTEXT_CHARS)
      : fullText.slice(0, MAX_CONTEXT_CHARS);

    const session = await this.getOrCreateSession(user.defaultWorkspaceId, documentId, user.id);
    const history = await this.recentHistory(session.id);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a helpful assistant answering questions about the document titled "${document.title}". Only use the content below to answer; if the answer isn't in it, say so.\n\n${contextText}`,
      },
      ...history,
      { role: 'user', content },
    ];

    const reply = await this.complete(messages, `document ${documentId}`);
    await this.persistTurn(session.id, content, reply);
    return { available: true as const, reply };
  }

  // --- whole-knowledge-base chat ---------------------------------------------

  async getWorkspaceHistory(user: CurrentUserPayload) {
    const session = await this.getOrCreateSession(user.defaultWorkspaceId, null, user.id);
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    return { available: this.aiPort.isAvailable, messages };
  }

  async sendWorkspaceMessage(user: CurrentUserPayload, content: string) {
    if (!content?.trim()) throw new BadRequestException('message is required');
    if (!this.aiPort.isAvailable) return { available: false as const };

    // Retrieve across every document in the workspace — this is what makes chat a "second
    // brain" rather than single-document Q&A. No embeddings needed: lexical (tsvector) top-k.
    const hits = await this.searchPort.searchChunks(user.defaultWorkspaceId, content, WORKSPACE_CHUNK_K);
    const { context, sources } = this.buildContext(hits, MAX_WORKSPACE_CONTEXT_CHARS);

    const session = await this.getOrCreateSession(user.defaultWorkspaceId, null, user.id);
    const history = await this.recentHistory(session.id);

    const systemContent = context
      ? `You are the user's personal knowledge assistant. Answer the question using ONLY the document excerpts below, drawn from the user's knowledge base. Cite the excerpts you rely on with their [#n] markers. If the excerpts do not contain the answer, say you don't know rather than guessing.\n\n${context}`
      : `You are the user's personal knowledge assistant. No documents in the user's knowledge base matched this question. Use the prior conversation if relevant; otherwise say you couldn't find anything relevant in their knowledge base.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content },
    ];

    const reply = await this.complete(messages, `workspace ${user.defaultWorkspaceId}`);
    await this.persistTurn(session.id, content, reply);
    return { available: true as const, reply, sources };
  }
}
