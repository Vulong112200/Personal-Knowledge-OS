import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { TagsService } from '../tags/tags.service';
import { GraphService } from '../graph/graph.service';
import { createRedisConnection } from '../queue/redis-connection';
import { DOCUMENT_PROCESSING_QUEUE, type DocumentProcessingPayload } from './document-processing.constants';
import { extractText } from './extract-text';
import { chunkText } from './chunk-text';
import { extractKeywords } from './extract-keywords';

@Injectable()
export class DocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessor.name);
  private worker!: Worker<DocumentProcessingPayload>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly tagsService: TagsService,
    private readonly graphService: GraphService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<DocumentProcessingPayload>(
      DOCUMENT_PROCESSING_QUEUE,
      (job) => this.process(job),
      { connection: createRedisConnection() },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker.close();
  }

  private async process(job: Job<DocumentProcessingPayload>): Promise<void> {
    const { documentId } = job.data;
    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });

    try {
      await this.runExtract(document);
    } catch (error) {
      await this.markFailed(documentId, error);
      throw error;
    }
  }

  private async runExtract(document: { id: string; storageKey: string; originalFilename: string }) {
    const extractJob = await this.startJob(document.id, 'extract');

    const buffer = await this.storage.getObject(document.storageKey);
    const extension = extname(document.originalFilename).toLowerCase();
    const { text, needsOcr } = await extractText(buffer, extension);

    if (needsOcr) {
      await this.finishJob(extractJob.id, 'succeeded');
      await this.prisma.document.update({
        where: { id: document.id },
        data: { status: 'needs_ocr' },
      });
      return;
    }

    await this.prisma.documentContent.upsert({
      where: { documentId: document.id },
      update: { textContent: text, extractedAt: new Date() },
      create: { documentId: document.id, textContent: text },
    });
    await this.finishJob(extractJob.id, 'succeeded');

    await this.runChunk(document.id, text);
  }

  private async runChunk(documentId: string, text: string) {
    const chunkJob = await this.startJob(documentId, 'chunk');

    const chunks = chunkText(text);
    await this.prisma.chunk.deleteMany({ where: { documentId } });

    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    await this.prisma.chunk.createMany({
      data: chunks.map((chunk, ordinal) => ({
        documentId,
        workspaceId: document.workspaceId,
        ordinal,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
      })),
    });

    await this.finishJob(chunkJob.id, 'succeeded');

    await this.runAutoTagAndRelate(documentId, document.workspaceId, text);

    await this.prisma.document.update({ where: { id: documentId }, data: { status: 'processed' } });
  }

  private async runAutoTagAndRelate(documentId: string, workspaceId: string, text: string) {
    const autotagJob = await this.startJob(documentId, 'autotag');
    try {
      const keywords = extractKeywords(text, 5);
      for (const keyword of keywords) {
        const tag = await this.tagsService.findOrCreate(workspaceId, keyword);
        await this.tagsService.assignToDocument(documentId, tag.id, 'ai');
      }
      await this.finishJob(autotagJob.id, 'succeeded');
    } catch (error) {
      // Auto-tag/relate failures don't fail the document — extract+chunk already
      // succeeded, so it's still FTS-searchable; only tags/relationships are missing.
      await this.failJobSoftly(autotagJob.id, error, `Auto-tag failed for document ${documentId}`);
      return;
    }

    const relateJob = await this.startJob(documentId, 'relate');
    try {
      await this.graphService.relateByTags(workspaceId, documentId);
      await this.finishJob(relateJob.id, 'succeeded');
    } catch (error) {
      await this.failJobSoftly(relateJob.id, error, `Relationship detection failed for document ${documentId}`);
    }
  }

  private async failJobSoftly(jobId: string, error: unknown, logPrefix: string) {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });
    this.logger.warn(`${logPrefix}: ${message}`);
  }

  private async markFailed(documentId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'failed', errorMessage: message },
    });
    await this.prisma.processingJob.updateMany({
      where: { documentId, status: 'running' },
      data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
    });
  }

  private startJob(documentId: string, jobType: 'extract' | 'chunk' | 'autotag' | 'relate') {
    return this.prisma.processingJob.create({
      data: { documentId, jobType, status: 'running', startedAt: new Date() },
    });
  }

  private finishJob(id: string, status: 'succeeded' | 'failed') {
    return this.prisma.processingJob.update({
      where: { id },
      data: { status, finishedAt: new Date() },
    });
  }
}
