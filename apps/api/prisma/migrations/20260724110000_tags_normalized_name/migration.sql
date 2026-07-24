-- Add a diacritics-folded dedup key to tags so accent variants ("chi phí" / "chi phi")
-- collapse to a single tag. Requires f_unaccent (created in
-- 20260723150000_search_unaccent_and_chunk_fts).
--
-- NOTE: statements here must each be self-contained — Supabase's transaction-mode pooler can
-- run each statement on a different connection, so temp tables / session state can't be shared
-- across statements. The keeper mapping is therefore recomputed via an inline CTE in every
-- statement (identical because `tags` isn't mutated until the final DELETE). Also idempotent
-- (IF [NOT] EXISTS) so it can be safely re-run after a partially-applied attempt.

ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "normalized_name" TEXT;
UPDATE "tags" SET "normalized_name" = f_unaccent(lower("name")) WHERE "normalized_name" IS NULL;

-- Repoint loser links to the oldest (keeper) tag per (workspace_id, normalized_name), unless
-- the keeper link already exists for that document.
WITH keepers AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY workspace_id, normalized_name ORDER BY id) AS keeper_id
  FROM "tags"
)
UPDATE "document_tags" dt
SET "tag_id" = k.keeper_id
FROM keepers k
WHERE dt."tag_id" = k.id
  AND k.id <> k.keeper_id
  AND NOT EXISTS (
    SELECT 1 FROM "document_tags" existing
    WHERE existing."document_id" = dt."document_id" AND existing."tag_id" = k.keeper_id
  );

-- Drop now-redundant loser links (keeper link already existed for those documents).
WITH keepers AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY workspace_id, normalized_name ORDER BY id) AS keeper_id
  FROM "tags"
)
DELETE FROM "document_tags" dt
USING keepers k
WHERE dt."tag_id" = k.id AND k.id <> k.keeper_id;

-- Delete the loser tags.
WITH keepers AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY workspace_id, normalized_name ORDER BY id) AS keeper_id
  FROM "tags"
)
DELETE FROM "tags" t
USING keepers k
WHERE t.id = k.id AND k.id <> k.keeper_id;

-- Drop orphaned tag graph nodes whose backing tag was merged away (their edges cascade via FK).
DELETE FROM "graph_nodes" gn
WHERE gn."node_type" = 'tag'
  AND NOT EXISTS (SELECT 1 FROM "tags" t WHERE t.id = gn."ref_id");

ALTER TABLE "tags" ALTER COLUMN "normalized_name" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "tags_workspace_id_normalized_name_key" ON "tags" ("workspace_id", "normalized_name");
