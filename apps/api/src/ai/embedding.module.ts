import { Global, Logger, Module } from '@nestjs/common';
import { EMBEDDING_PORT } from './embedding.port';
import { NullEmbeddingAdapter } from './null-embedding.adapter';
import { TransformersEmbeddingAdapter } from './transformers-embedding.adapter';

const logger = new Logger('EmbeddingModule');

@Global()
@Module({
  providers: [
    {
      provide: EMBEDDING_PORT,
      useFactory: () => {
        // Opt-in: local embedding inference is CPU-heavy and downloads model weights, so it
        // stays off unless explicitly enabled. When off, search/RAG remain lexical-only.
        if (process.env.EMBEDDINGS_ENABLED === 'true') {
          logger.log('Embeddings enabled — using TransformersEmbeddingAdapter');
          return new TransformersEmbeddingAdapter();
        }
        return new NullEmbeddingAdapter();
      },
    },
  ],
  exports: [EMBEDDING_PORT],
})
export class EmbeddingModule {}
