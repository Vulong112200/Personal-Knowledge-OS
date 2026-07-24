-- Persist per-message citation sources for whole-knowledge-base chat so they survive a reload.
-- NULL for user messages and per-document assistant replies. Shape: ChatSource[] JSON
-- (see packages/contracts chat.ts).
ALTER TABLE "ai_chat_messages" ADD COLUMN "sources" JSONB;
