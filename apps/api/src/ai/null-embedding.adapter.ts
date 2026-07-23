import { EmbeddingKind, EmbeddingPort } from './embedding.port';

/** Used when embeddings are disabled — search/RAG stay lexical-only. */
export class NullEmbeddingAdapter implements EmbeddingPort {
  readonly isAvailable = false;
  readonly dimensions = 0;
  readonly model = 'none';

  async embed(_texts: string[], _kind: EmbeddingKind): Promise<number[][]> {
    throw new Error('Embeddings are not enabled');
  }
}
