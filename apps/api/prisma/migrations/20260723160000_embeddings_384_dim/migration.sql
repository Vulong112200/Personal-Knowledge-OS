-- Switch the embeddings column from the original OpenAI-sized vector(1536) to vector(384)
-- to match the local multilingual model (Xenova/multilingual-e5-small, 384 dims). The table
-- has always been unused (no embeddings provider until now), so there is no data to migrate.
-- If you choose a different model, change the dimension here (and EMBEDDING_DIMENSIONS) to match.
DROP INDEX IF EXISTS "embeddings_embedding_hnsw_idx";
ALTER TABLE "embeddings" ALTER COLUMN "embedding" TYPE vector(384);
CREATE INDEX "embeddings_embedding_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
