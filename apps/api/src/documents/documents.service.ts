import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES } from '@pkos/contracts';
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
    const buffer = await this.storage.getObject(document.storageKey);
    return { document, buffer };
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
    await this.prisma.$transaction([
      this.prisma.graphNode.deleteMany({
        where: { workspaceId: document.workspaceId, nodeType: 'document', refId: id },
      }),
      this.prisma.aiChatSession.deleteMany({ where: { documentId: id } }),
      this.prisma.document.delete({ where: { id } }),
    ]);

    await this.storage.deleteObject(document.storageKey).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Deleted document ${id} but failed to remove its stored object: ${message}`);
    });

    return { id };
  }
}
