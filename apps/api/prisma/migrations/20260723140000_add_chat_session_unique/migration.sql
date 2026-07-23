-- One AiChatSession per (workspace, document, user). Backs the atomic-upsert / P2002
-- guard in ChatService.getOrCreateSession, closing the find-then-create race that allowed
-- duplicate sessions + split history under concurrent first messages.
-- (If this fails, there are pre-existing duplicate rows to collapse first.)
CREATE UNIQUE INDEX "ai_chat_sessions_workspace_id_document_id_created_by_key" ON "ai_chat_sessions"("workspace_id", "document_id", "created_by");

-- Postgres treats NULLs as distinct in a plain unique index, so the index above does NOT
-- dedupe workspace-wide chat sessions (document_id IS NULL — used by whole-knowledge-base
-- chat in Phase 2). A partial unique index enforces one such session per (workspace, user).
CREATE UNIQUE INDEX "ai_chat_sessions_workspace_user_null_document_key" ON "ai_chat_sessions"("workspace_id", "created_by") WHERE "document_id" IS NULL;
