-- Enable pgvector for the embeddings.embedding column below
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'processing', 'processed', 'failed', 'needs_ocr');

-- CreateEnum
CREATE TYPE "StorageDriver" AS ENUM ('local', 'r2');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('user', 'ai');

-- CreateEnum
CREATE TYPE "ProcessingJobType" AS ENUM ('extract', 'chunk', 'embed', 'autotag', 'relate');

-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "GraphNodeType" AS ENUM ('document', 'tag');

-- CreateEnum
CREATE TYPE "GraphEdgeType" AS ENUM ('shares_tag', 'similar_content');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "storage_driver" "StorageDriver" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- `tsv` is a generated column (not modeled in schema.prisma — Prisma has no native
-- support for STORED generated columns) using the 'simple' text-search config,
-- since the project targets Vietnamese + English content and 'english' stemming
-- would corrupt Vietnamese tokens.
CREATE TABLE "document_content" (
    "document_id" UUID NOT NULL,
    "text_content" TEXT NOT NULL,
    "language" TEXT,
    "page_count" INTEGER,
    "extracted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "text_content")) STORED,

    CONSTRAINT "document_content_pkey" PRIMARY KEY ("document_id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tags" (
    "document_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "source" "TagSource" NOT NULL,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("document_id","tag_id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "job_type" "ProcessingJobType" NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "node_type" "GraphNodeType" NOT NULL,
    "ref_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_node_id" UUID NOT NULL,
    "target_node_id" UUID NOT NULL,
    "edge_type" "GraphEdgeType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "document_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (full-text search)
CREATE INDEX "document_content_tsv_idx" ON "document_content" USING GIN ("tsv");

-- CreateIndex (semantic search — hnsw requires pgvector >= 0.5.0; Supabase ships a
-- recent enough version as of writing. Fall back to ivfflat if hnsw is unavailable.)
CREATE INDEX "embeddings_embedding_hnsw_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_chunk_id_key" ON "embeddings"("chunk_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_workspace_id_name_key" ON "tags"("workspace_id", "name");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_content" ADD CONSTRAINT "document_content_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
