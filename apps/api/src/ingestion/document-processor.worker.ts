import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { createRedisConnection } from '../queue/redis-connection';
import { DOCUMENT_PROCESSING_QUEUE, type DocumentProcessingPayload } from './document-processing.constants';
import { extractText } from './extract-text';
import { chunkText } from './chunk-text';

@Injectable()
export class DocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessor.name);
  private worker!: Worker<DocumentProcessingPayload>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
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

    // Embedding (M5) and relationship detection (M6) will extend this pipeline;
    // until then, extract+chunk is the full pipeline this MVP slice covers.
    await this.prisma.document.update({ where: { id: documentId }, data: { status: 'processed' } });
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

  private startJob(documentId: string, jobType: 'extract' | 'chunk') {
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
