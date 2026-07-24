import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import { EMBEDDING_PORT, type EmbeddingPort } from '../ai/embedding.port';
import { TagsService } from '../tags/tags.service';
import { GraphService } from '../graph/graph.service';
import { createRedisConnection } from '../queue/redis-connection';
import { DOCUMENT_PROCESSING_QUEUE, type DocumentProcessingPayload } from './document-processing.constants';
import { extractText } from './extract-text';
import { chunkText } from './chunk-text';
import { extractKeywords } from './extract-keywords';
import { runOcrOnPdf } from './run-ocr';

const OCR_ENABLED = process.env.OCR_ENABLED !== 'false';
// OCR (tesseract.js) is memory- and CPU-heavy. The worker runs several jobs concurrently, so
// gate OCR separately to a small limit to avoid multiple scanned PDFs spiking memory at once.
const OCR_CONCURRENCY = Math.max(1, Number(process.env.OCR_CONCURRENCY) || 1);

/** Minimal counting semaphore — limits how many callers hold the resource at once. */
class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}

  acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (this.active < this.max) {
          this.active++;
          resolve(() => this.release());
        } else {
          this.waiters.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release() {
    this.active--;
    this.waiters.shift()?.();
  }
}

@Injectable()
export class DocumentProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentProcessor.name);
  private worker!: Worker<DocumentProcessingPayload>;
  private readonly ocrSemaphore = new Semaphore(OCR_CONCURRENCY);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(EMBEDDING_PORT) private readonly embedding: EmbeddingPort,
    private readonly tagsService: TagsService,
    private readonly graphService: GraphService,
  ) {}

  onModuleInit() {
    this.worker = new Worker<DocumentProcessingPayload>(
      DOCUMENT_PROCESSING_QUEUE,
      (job) => this.process(job),
      // Default concurrency is 1 (fully serial) — bumped so a bulk folder upload of
      // hundreds of documents doesn't queue up an extremely long serial tail. The
      // pipeline here is local/CPU-bound (no AI/OpenRouter calls), so this carries no
      // rate-limit risk; GraphService's node/edge upserts are atomic (see graph.service.ts)
      // so concurrent jobs sharing a tag no longer race.
      { connection: createRedisConnection(), concurrency: 4 },
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

    // Everything (including the initial load + status flip) runs inside the try so a failure
    // in any of it routes through markFailed rather than leaving the document stuck.
    try {
      const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'processing' },
      });
      await this.runExtract(document);
    } catch (error) {
      await this.markFailed(documentId, error);
      throw error;
    }
  }

  private async runExtract(document: {
    id: string;
    source: 'upload' | 'note';
    storageKey: string | null;
    originalFilename: string | null;
  }) {
    const extractJob = await this.startJob(document.id, 'extract');

    // Notes carry their Markdown in document_content already (written by the create/update
    // endpoint) — there's no stored file to fetch, extract, or OCR. Chunk that text directly.
    if (document.source === 'note') {
      const existing = await this.prisma.documentContent.findUnique({ where: { documentId: document.id } });
      const noteText = existing?.textContent ?? '';
      await this.finishJob(extractJob.id, 'succeeded');
      if (!noteText.trim()) {
        this.logger.warn(`Note ${document.id} has empty content — 0 chunks/tags will be produced.`);
      }
      await this.runChunk(document.id, noteText);
      return;
    }

    if (!document.storageKey || !document.originalFilename) {
      throw new Error(`Uploaded document ${document.id} is missing storageKey/originalFilename.`);
    }
    const buffer = await this.storage.getObject(document.storageKey);
    const extension = extname(document.originalFilename).toLowerCase();
    const { text: extractedText, needsOcr } = await extractText(buffer, extension);
    let text = extractedText;

    if (needsOcr) {
      // No embedded text layer (a scanned PDF). Try OCR to recover it before giving up.
      const ocrText = OCR_ENABLED ? await this.tryOcr(document.id, buffer) : '';
      if (!ocrText) {
        await this.finishJob(extractJob.id, 'succeeded');
        await this.prisma.document.update({
          where: { id: document.id },
          data: { status: 'needs_ocr' },
        });
        return;
      }
      text = ocrText;
    }

    if (!text.trim()) {
      // Not a scanned PDF (that path sets needs_ocr above), but extraction produced no
      // usable text — e.g. an empty .txt/.md or a DOCX with no body. Let it finish as
      // 'processed' (nothing to chunk/tag), but surface it in the logs rather than silently.
      this.logger.warn(`Document ${document.id} extracted to empty text — 0 chunks/tags will be produced.`);
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

    // Mark processed as soon as it's FTS-searchable; embeddings backfill after (fail-soft).
    await this.prisma.document.update({ where: { id: documentId }, data: { status: 'processed' } });

    await this.runEmbed(documentId);
  }

  private async runEmbed(documentId: string) {
    if (!this.embedding.isAvailable) return;

    // Fully self-contained: the document is already 'processed' by the time we get here, so
    // nothing in this stage — not even the startJob write — may throw up into markFailed and
    // regress the status. Any failure is logged and swallowed.
    let embedJob: { id: string } | undefined;
    try {
      embedJob = await this.startJob(documentId, 'embed');
      // Chunks were just delete+recreated in runChunk, so their old embeddings are already
      // gone (FK cascade) — insert fresh ones. Store via raw SQL: pgvector's `vector` type
      // isn't representable in the Prisma schema (modeled as Unsupported).
      const chunks = await this.prisma.chunk.findMany({
        where: { documentId },
        orderBy: { ordinal: 'asc' },
        select: { id: true, content: true },
      });
      if (chunks.length === 0) {
        await this.finishJob(embedJob.id, 'succeeded');
        return;
      }

      const vectors = await this.embedding.embed(
        chunks.map((c) => c.content),
        'passage',
      );

      for (let i = 0; i < chunks.length; i++) {
        const vector = vectors[i];
        if (!vector || vector.length === 0) continue;
        // Guard against embedding-config drift: if the model's output width doesn't match the
        // pgvector column (embedding.dimensions), every INSERT would fail with an opaque
        // pgvector error. Fail fast with a clear message instead (caught → failJobSoftly).
        if (vector.length !== this.embedding.dimensions) {
          throw new Error(
            `Embedding dimension mismatch for model "${this.embedding.model}": produced ${vector.length} dims but the DB vector column / EMBEDDING_DIMENSIONS expects ${this.embedding.dimensions}. Align EMBEDDING_DIMENSIONS, the embeddings column type, and re-run the migration.`,
          );
        }
        const literal = `[${vector.join(',')}]`;
        await this.prisma.$executeRaw`
          INSERT INTO embeddings (id, chunk_id, embedding, model, created_at)
          VALUES (${randomUUID()}::uuid, ${chunks[i].id}::uuid, ${literal}::vector, ${this.embedding.model}, now())
        `;
      }
      await this.finishJob(embedJob.id, 'succeeded');
    } catch (error) {
      // Embedding failure doesn't fail the document — it stays processed + FTS-searchable,
      // just without semantic vectors (hybrid search falls back to lexical for it).
      const message = error instanceof Error ? error.message : String(error);
      if (embedJob) {
        await this.failJobSoftly(embedJob.id, error, `Embedding failed for document ${documentId}`).catch(() => {});
      } else {
        this.logger.warn(`Embedding stage could not start for document ${documentId}: ${message}`);
      }
    }
  }

  private async runAutoTagAndRelate(documentId: string, workspaceId: string, text: string) {
    const autotagJob = await this.startJob(documentId, 'autotag');
    try {
      // Clear previously AI-assigned tags first so a re-extraction with a different keyword
      // set doesn't leave stale tags behind (chunks are already delete+recreated upstream).
      await this.tagsService.clearAiTags(documentId);
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
      // Backlinks: turn [[wiki-links]] in the content into real document→document edges.
      await this.graphService.relateByLinks(workspaceId, documentId, text);
      await this.finishJob(relateJob.id, 'succeeded');
    } catch (error) {
      await this.failJobSoftly(relateJob.id, error, `Relationship detection failed for document ${documentId}`);
    }
  }

  private async tryOcr(documentId: string, buffer: Buffer): Promise<string> {
    this.logger.log(`Document ${documentId} has no text layer — attempting OCR...`);
    // Bound concurrent OCR runs regardless of the worker's job concurrency (memory guard).
    const release = await this.ocrSemaphore.acquire();
    try {
      const text = await runOcrOnPdf(buffer);
      if (text) this.logger.log(`OCR recovered ${text.length} chars for document ${documentId}.`);
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OCR failed for document ${documentId}: ${message}`);
      return '';
    } finally {
      release();
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
    // Best-effort: if the document row is already gone (e.g. deleted mid-processing) this
    // must not throw and mask the original error that's about to be rethrown.
    try {
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed', errorMessage: message },
      });
      await this.prisma.processingJob.updateMany({
        where: { documentId, status: 'running' },
        data: { status: 'failed', errorMessage: message, finishedAt: new Date() },
      });
    } catch (markError) {
      const markMessage = markError instanceof Error ? markError.message : String(markError);
      this.logger.error(`Failed to mark document ${documentId} as failed: ${markMessage}`);
    }
  }

  private startJob(documentId: string, jobType: 'extract' | 'chunk' | 'autotag' | 'relate' | 'embed') {
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
