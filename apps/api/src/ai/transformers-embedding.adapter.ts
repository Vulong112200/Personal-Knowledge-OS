import { Logger } from '@nestjs/common';
import { EmbeddingKind, EmbeddingPort } from './embedding.port';

// A small multilingual sentence-embedding model that runs locally (CPU) via transformers.js
// — no API key, no per-call cost, good Vietnamese coverage. e5 models are asymmetric: inputs
// must be prefixed with "query:" or "passage:". The model weights (~100MB) are downloaded
// from the Hugging Face hub on first use and cached on disk.
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';
const DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) || 384;

export class TransformersEmbeddingAdapter implements EmbeddingPort {
  readonly isAvailable = true;
  readonly dimensions = DIMENSIONS;
  readonly model = DEFAULT_MODEL;

  private readonly logger = new Logger(TransformersEmbeddingAdapter.name);
  // transformers.js is ESM-only and heavy, so it (and the model) is loaded lazily on first
  // use — never at boot — and reused across calls.
  private pipelinePromise: Promise<(input: string[], opts: unknown) => Promise<{ tolist(): number[][] }>> | null =
    null;

  private getPipeline() {
    if (!this.pipelinePromise) {
      this.logger.log(`Loading embedding model "${this.model}" (first use downloads weights)...`);
      const loading = import('@huggingface/transformers').then(({ pipeline }) =>
        pipeline('feature-extraction', this.model),
      ) as Promise<(input: string[], opts: unknown) => Promise<{ tolist(): number[][] }>>;
      // If the (first) model load rejects — a network blip, HF outage, disk error — don't
      // cache the rejected promise forever (that would 503 every chat/search until restart).
      // Clear it so the next call retries the load from scratch.
      loading.catch(() => {
        if (this.pipelinePromise === loading) this.pipelinePromise = null;
      });
      this.pipelinePromise = loading;
    }
    return this.pipelinePromise;
  }

  async embed(texts: string[], kind: EmbeddingKind): Promise<number[][]> {
    if (texts.length === 0) return [];
    const prefix = kind === 'query' ? 'query: ' : 'passage: ';
    const inputs = texts.map((t) => `${prefix}${t}`);
    const extractor = await this.getPipeline();
    const output = await extractor(inputs, { pooling: 'mean', normalize: true });
    return output.tolist();
  }
}
