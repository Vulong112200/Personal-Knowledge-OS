-- Phase 3: diacritics-insensitive Vietnamese/English full-text search.
-- unaccent() is only STABLE (it depends on a dictionary), so Postgres refuses it in a
-- GENERATED column or a functional index. Wrap it in an IMMUTABLE SQL function — safe
-- because the 'unaccent' dictionary is never modified at runtime. Passing the dictionary
-- name explicitly (two-arg form) is what makes pinning it IMMUTABLE correct.
-- NOTE: on Supabase, extensions may live in the "extensions" schema (already on the
-- search_path). If this fails, create the extension with `SCHEMA extensions`.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION f_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT unaccent('unaccent', $1) $$;

-- Rebuild document_content.tsv to fold diacritics, so a query for "hoc" matches "học".
-- Dropping the column also drops its dependent GIN index; both are recreated below.
ALTER TABLE "document_content" DROP COLUMN "tsv";
ALTER TABLE "document_content"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent("text_content"))) STORED;
CREATE INDEX "document_content_tsv_idx" ON "document_content" USING GIN ("tsv");

-- Phase 2: chunk-level full-text index powering whole-knowledge-base RAG retrieval.
-- Same 'simple' + unaccent treatment as document_content so retrieval matches search.
ALTER TABLE "chunks"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent("content"))) STORED;
CREATE INDEX "chunks_tsv_idx" ON "chunks" USING GIN ("tsv");
