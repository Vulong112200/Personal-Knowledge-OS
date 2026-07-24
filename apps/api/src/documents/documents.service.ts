import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  createNoteSchema,
  updateNoteSchema,
} from '@pkos/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { QUEUE_PORT, type QueuePort } from '../queue/queue.port';
import { DOCUMENT_PROCESSING_QUEUE } from '../ingestion/document-processing.constants';
import { CurrentUserPayload } from '../users/users.service';

export const MAX_SIZE_BYTES = MAX_DOCUMENT_SIZE_BYTES;

const ALLOWED_EXTENSIONS = new Set<string>(ALLOWED_DOCUMENT_EXTENSIONS);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(QUEUE_PORT) private readonly queue: QueuePort,
  ) {}

  async upload(user: CurrentUserPayload, file: Express.Multer.File) {
    // Guard the no-file case (multipart with no "file" field) — otherwise extname(undefined)
    // throws a TypeError and surfaces as a 500 instead of a clear 400.
    if (!file) {
      throw new BadRequestException('file is required (multipart field "file")');
    }
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestException(
        `Unsupported file type "${ext}" — allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds max size of ${MAX_SIZE_BYTES} bytes`);
    }

    const documentId = randomUUID();
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${user.defaultWorkspaceId}/${documentId}/${file.originalname}`;

    await this.storage.putObject(storageKey, file.buffer);

    const document = await this.prisma.document.create({
      data: {
        id: documentId,
        workspaceId: user.defaultWorkspaceId,
        uploadedBy: user.id,
        title: file.originalname,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        checksum,
        storageDriver: 'local',
        storageKey,
        status: 'uploaded',
      },
    });

    await this.queue.enqueue(DOCUMENT_PROCESSING_QUEUE, { documentId }, { jobId: documentId });

    return document;
  }

  /** Create an in-app note. Notes are `source='note'` documents with no stored file — their
   * Markdown body lives in document_content, and they flow through the same ingestion pipeline
   * (chunk → tag → embed → relate) so they're immediately searchable, chattable, and graphed. */
  async createNote(user: CurrentUserPayload, body: unknown) {
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const { title, content } = parsed.data;

    const documentId = randomUUID();
    // Write the row + its content together so the worker (which reads document_content for
    // notes instead of storage) never races an enqueue against a missing content row.
    const document = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          id: documentId,
          workspaceId: user.defaultWorkspaceId,
          uploadedBy: user.id,
          source: 'note',
          title,
          status: 'uploaded',
        },
      });
      await tx.documentContent.create({ data: { documentId, textContent: content } });
      return doc;
    });

    await this.queue.enqueue(DOCUMENT_PROCESSING_QUEUE, { documentId }, { jobId: documentId });
    return document;
  }

  /** Update an in-app note's title/content and re-run ingestion so chunks/tags/embeddings/
   * backlinks refresh. Only notes are editable — uploaded files have no in-app content source. */
  async updateNote(user: CurrentUserPayload, id: string, body: unknown) {
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const document = await this.get(user, id); // ownership + 404
    if (document.source !== 'note') {
      throw new BadRequestException('Only notes can be edited; uploaded files are immutable.');
    }

    const { title, content } = parsed.data;
    if (title !== undefined) {
      await this.prisma.document.update({ where: { id }, data: { title } });
    }
    if (content !== undefined) {
      await this.prisma.documentContent.upsert({
        where: { documentId: id },
        update: { textContent: content, extractedAt: new Date() },
        create: { documentId: id, textContent: content },
      });
    }

    // Re-index against the new content (prunes jobs, resets status, re-enqueues).
    await this.reprocess(user, id);
    return this.get(user, id);
  }

  /** Re-run the ingestion pipeline for an existing document (re-extract → chunk → tag →
   * relate → embed). Used to refresh a document after a code/model change (e.g. re-embedding
   * after an embedding-model swap) or to retry a failed one.
   *
   * Enqueues with a UNIQUE jobId, never `jobId=documentId`: the original enqueue's job may
   * still linger in Redis (removeOnComplete keeps completed jobs for an hour), and BullMQ
   * silently drops an add() whose jobId already exists — so reusing the id could no-op.
   * (BullMQ forbids ':' in a custom job id — it's the internal key separator — so use '_'.) */
  async reprocess(user: CurrentUserPayload, id: string) {
    await this.get(user, id); // ownership + 404

    // Reset the DB state BEFORE the job becomes visible to the worker: prune prior job history
    // (the worker writes fresh stage rows as it runs) and flip status back to 'uploaded'. Doing
    // this after enqueue would race the worker (it could already have set 'processing').
    await this.prisma.processingJob.deleteMany({ where: { documentId: id } });
    await this.prisma.document.update({
      where: { id },
      data: { status: 'uploaded', errorMessage: null },
    });

    await this.queue.enqueue(
      DOCUMENT_PROCESSING_QUEUE,
      { documentId: id },
      { jobId: `${id}_${randomUUID()}` },
    );

    return { id, status: 'uploaded' as const };
  }

  list(user: CurrentUserPayload, tagId?: string) {
    return this.prisma.document.findMany({
      where: {
        workspaceId: user.defaultWorkspaceId,
        ...(tagId ? { tags: { some: { tagId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: CurrentUserPayload, id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, workspaceId: user.defaultWorkspaceId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async download(user: CurrentUserPayload, id: string) {
    const document = await this.get(user, id);
    // Notes have no stored file — serve their Markdown body as a .md download instead.
    if (document.source === 'note' || !document.storageKey) {
      const content = await this.prisma.documentContent.findUnique({ where: { documentId: id } });
      return {
        filename: `${document.title || 'note'}.md`,
        mimeType: 'text/markdown; charset=utf-8',
        buffer: Buffer.from(content?.textContent ?? '', 'utf8'),
      };
    }
    const buffer = await this.storage.getObject(document.storageKey);
    return {
      filename: document.originalFilename ?? document.title ?? 'download',
      mimeType: document.mimeType ?? 'application/octet-stream',
      buffer,
    };
  }

  async getContent(user: CurrentUserPayload, id: string) {
    await this.get(user, id); // ownership + 404
    const content = await this.prisma.documentContent.findUnique({ where: { documentId: id } });
    return { textContent: content?.textContent ?? null };
  }

  async remove(user: CurrentUserPayload, id: string) {
    const document = await this.get(user, id); // ownership + 404

    // Document delete cascades to content/chunks/tags/jobs via FK. Two things don't:
    //  - graph_nodes.ref_id is a plain string (not an FK), so the document's graph node
    //    must be removed explicitly (its edges cascade off the node).
    //  - ai_chat_sessions.document_id is onDelete:SetNull; letting it null out would collide
    //    with the workspace-chat partial unique index, so delete the doc's sessions first.
    try {
      await this.prisma.$transaction([
        this.prisma.graphNode.deleteMany({
          where: { workspaceId: document.workspaceId, nodeType: 'document', refId: id },
        }),
        this.prisma.aiChatSession.deleteMany({ where: { documentId: id } }),
        this.prisma.document.delete({ where: { id } }),
      ]);
    } catch (err: any) {
      // Deleted concurrently between the ownership check and the transaction — treat a
      // double-delete as success rather than surfacing a 500.
      if (err?.code !== 'P2025') throw err;
    }

    // Notes have no stored object to remove.
    if (document.storageKey) {
      await this.storage.deleteObject(document.storageKey).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Deleted document ${id} but failed to remove its stored object: ${message}`);
      });
    }

    return { id };
  }
}
