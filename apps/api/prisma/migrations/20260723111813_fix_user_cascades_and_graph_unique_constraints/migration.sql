-- Fix onDelete on FKs pointing to `users` so deleting a user (via the new self-service
-- account deletion feature) cascades instead of being blocked by Postgres FK constraints.
-- At this MVP stage each workspace has exactly one owner, so uploader/creator == owner in
-- practice; if workspaces later support multiple members, `documents_uploaded_by_fkey`
-- should be revisited (SetNull + app-level handling) rather than cascading from a non-owner
-- member's account deletion.
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_owner_id_fkey";
ALTER TABLE "documents" DROP CONSTRAINT "documents_uploaded_by_fkey";
ALTER TABLE "ai_chat_sessions" DROP CONSTRAINT "ai_chat_sessions_created_by_fkey";

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Close the GraphService find-then-create/update race (see graph.service.ts ensureNode/
-- ensureEdge) by backing atomic upserts with real unique constraints. Verified no existing
-- duplicate rows before adding these.
CREATE UNIQUE INDEX "graph_nodes_workspace_id_node_type_ref_id_key" ON "graph_nodes"("workspace_id", "node_type", "ref_id");
CREATE UNIQUE INDEX "graph_edges_workspace_id_edge_type_source_node_id_target_no_key" ON "graph_edges"("workspace_id", "edge_type", "source_node_id", "target_node_id");
