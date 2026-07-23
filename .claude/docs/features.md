# Features — detailed status and logic

Status legend: ✅ done · 🚧 in progress · 📋 not started · ❌ dropped from scope

---

## Auth + default workspace ✅

- **Backend**: `src/auth/` (`AuthPort`, `SupabaseAuthAdapter`, `JwtAuthGuard`,
  `@Public()` decorator) + `src/users/`, `src/workspaces/`.
- **Frontend**: `app/login`, `app/signup` (client components, `@supabase/ssr`
  `createBrowserClient`), `proxy.ts` (root-level, Next 16's renamed `middleware.ts` —
  refreshes the session cookie on navigation).
- **Key logic**:
  - `SupabaseAuthAdapter.verifyToken` tries JWKS (`https://<project>.supabase.co/auth/v1/.well-known/jwks.json`,
    ES256) first, falls back to the legacy shared `SUPABASE_JWT_SECRET` (HS256) if JWKS has
    no matching key. `jose` is ESM-only, loaded via `await import('jose')` — a static
    top-level import breaks under Jest's CJS transform.
  - `JwtAuthGuard` is registered as `APP_GUARD` **inside `AuthModule`**, not `AppModule` —
    `useClass` DI resolution needs `AUTH_PORT` in scope at instantiation time.
  - On every authenticated request, `UsersService.findOrCreateFromAuth` upserts the local
    `users` row and `WorkspacesService.ensureDefaultWorkspace` creates the user's single
    workspace on first request only (idempotent — checked via `findFirst` before `create`).
  - No multi-workspace switcher; `slug` is just the user's UUID (not shown in any UI yet).

---

## Document upload ✅

- **Backend**: `src/documents/` + `src/storage/` (`StoragePort`, `LocalFsStorageAdapter`).
- **Frontend**: `app/documents/documents-view.tsx` (react-dropzone + TanStack Query,
  polls every 5s), `app/documents/[id]/` (detail page).
- **Key logic**:
  - Allowed extensions: `.pdf .docx .md .txt`, 20MB limit (enforced both at multer's
    `FileInterceptor` limits and in `DocumentsService.upload`).
  - Storage key format: `{workspaceId}/{documentId}/{originalFilename}`, rooted at
    `apps/api/var/storage/` (gitignored, `.gitkeep` tracked).
  - `sizeBytes` is a Prisma `BigInt` — **not** JSON-serializable by default; a global
    `BigInt.prototype.toJSON` patch in `main.ts` fixes this app-wide.
  - Upload enqueues `{documentId}` onto the `document-processing` BullMQ queue and returns
    `201` immediately — the pipeline runs fully async.

---

## Async ingestion pipeline ✅

- **Backend**: `src/ingestion/` (`DocumentProcessor` BullMQ worker), `src/queue/`
  (`QueuePort`, `BullMqQueueAdapter`).
- **Key logic** — `document-processor.worker.ts`, sequential stages per document, each
  recorded as a `processing_jobs` row (`extract`/`chunk`/`autotag`/`relate`):
  1. **Extract** (`extract-text.ts`) — `pdf-parse` v2's new `PDFParse` class API
     (`new PDFParse({data: buffer}).getText()`, must call `.destroy()` after), `mammoth`
     for DOCX (plain text only), raw UTF-8 read for md/txt. Empty PDF text →
     `status=needs_ocr`, pipeline stops (OCR itself is **not implemented**).
  2. **Chunk** (`chunk-text.ts`) — paragraph-first split, falls back to sentence split for
     any single paragraph over 800 tokens, target ~650 tokens/chunk via `gpt-tokenizer`'s
     `countTokens`.
  3. **Autotag** (`extract-keywords.ts`) — naive top-5 keyword frequency (EN+VI stop-word
     list), tagged with `source='ai'`. Explicitly low-fidelity — not real NLP.
  4. **Relate** (`src/graph/graph.service.ts`) — connects this document to every other
     document in the workspace sharing ≥1 tag; `ensureNode`/`ensureEdge` are manual
     find-or-create (no DB unique constraint on `(workspace_id, node_type, ref_id)`,
     accepted race-condition risk at MVP scale).
  - **Fail-soft pattern**: autotag/relate failures don't fail the document (extract+chunk
    already succeeded, so it's still FTS-searchable) — only that stage's `processing_jobs`
    row is marked `failed`. Only extract/chunk failures set `document.status='failed'`.
  - Final status: `processed` (or `needs_ocr`/`failed`).

---

## Full-text search ✅

- **Backend**: `src/search/` (`SearchPort`, `PostgresSearchAdapter`).
- **Frontend**: `app/search/` (query box, snippet highlighting).
- **Key logic**:
  - `tsv` column on `document_content` uses the **`simple`** tsvector config (not
    `english`) — the target content is English *and* Vietnamese, and English stemming
    corrupts Vietnamese tokens. Generated column, added by hand-editing the migration SQL
    (Prisma can't express `GENERATED ALWAYS AS ... STORED` natively).
  - `ts_headline` highlight markers are **control characters** (`\x01`/`\x02`, exported as
    `SNIPPET_HIGHLIGHT_START`/`END` from `@pkos/contracts`), not literal `<mark>` HTML —
    `ts_headline` does not escape the underlying document text, so literal HTML tags +
    `dangerouslySetInnerHTML` would be a real XSS vector against user-uploaded content.
    The frontend splits on the markers and renders highlights as plain React text nodes.
  - `GET /search?q=` returns `{ results }` — flat, no `semanticUnavailable` flag (removed
    when semantic search was dropped; see below).

## Semantic/hybrid search ❌ dropped from scope

Originally planned (embedding column, `hnsw` index, RRF merge with full-text — all built
and manually verified once). Dropped because the chosen AI provider, **OpenRouter**, has no
embeddings endpoint (confirmed via its API reference — only `/chat/completions`,
`/generation`, `/models`). `pgvector`/`vector(1536)`/`hnsw` remain in the schema, unused.

---

## AI abstraction + chat ✅ (chat-only)

- **Backend**: `src/ai/` (`AiPort`, `NullAiAdapter`, `OpenRouterAdapter`), `src/chat/`.
- **Frontend**: `app/documents/[id]/document-detail-view.tsx` (chat panel, disabled input
  when `available: false`).
- **Key logic**:
  - `AiPort` is intentionally narrow: `{ isAvailable, chatComplete(messages) }` — no
    embedding methods (see above).
  - `OpenRouterAdapter` uses the `openai` npm SDK pointed at
    `baseURL: 'https://openrouter.ai/api/v1'` (OpenRouter's API is OpenAI-compatible — no
    separate client library needed). Default model `openai/gpt-oss-20b:free`, overridable
    via `OPENROUTER_MODEL` — **OpenRouter's free-tier catalog changes over time**; check
    `GET https://openrouter.ai/api/v1/models` (filter `id.includes(':free')`) if the
    default stops working.
  - `AiModule`'s factory: `AI_ENABLED=true` + missing `OPENROUTER_API_KEY` → logs a warning
    and falls back to `NullAiAdapter` — **the app must never fail to boot** on AI
    misconfiguration.
  - `ChatService.sendMessage` injects up to 6000 chars of the document's extracted text
    plus the last 10 messages as chat context; returns `{ available: false }` (not an
    error) when AI is disabled, at both `GET` (history) and `POST` (send).

---

## Tags + relationships (graph) ✅ (naive)

- **Backend**: `src/tags/`, `src/graph/`.
- **Frontend**: "Related Documents" panel on the document detail page — a flat list, not
  a graph visualization.
- **Key logic**: see "Async ingestion pipeline" above (autotag/relate stages). `GET
  /documents/:id/related` walks `graph_edges` from/to this document's `graph_nodes` row
  and returns `{documentId, title}` pairs.

---

## Not started (explicitly out of MVP scope)

- **OCR** — `status=needs_ocr` is set on empty-text PDFs but nothing processes them further.
- **Graph visualization UI** — data model exists, no 2D/3D/force-graph rendering.
- **Flashcards / spaced repetition, sharing/permissions beyond single-owner, admin tooling** —
  named in the original product spec, not part of this foundation build.

---

## Database Tables Status

| Table | Status | Notes |
|---|---|---|
| `users` | ✅ used | id = Supabase auth UID |
| `workspaces` | ✅ used | single default workspace per user |
| `workspace_members` | ✅ used | role: owner/admin/member (only owner used so far) |
| `documents` | ✅ used | status: uploaded/processing/processed/failed/needs_ocr |
| `document_content` | ✅ used | has generated `tsv` column, not in Prisma schema |
| `chunks` | ✅ used | |
| `embeddings` | ❌ unused | schema only — no embeddings provider (see above) |
| `tags` / `document_tags` | ✅ used | AI-sourced only so far (`source='ai'`); no manual tagging UI |
| `processing_jobs` | ✅ used | one row per pipeline stage per document |
| `graph_nodes` / `graph_edges` | ✅ used | `shares_tag` edges only; `similar_content` unused (needed embeddings) |
| `ai_chat_sessions` / `ai_chat_messages` | ✅ used | one session per (workspace, document, user) |

## Frontend state — TanStack Query key map

No global client-state library (no Zustand/Redux) — TanStack Query is the only state layer,
plus local `useState` for form drafts. Query keys in use:

| Key | Used in | Notes |
|---|---|---|
| `["documents"]` | `documents-view.tsx` | `refetchInterval: 5000` (polls pipeline status) |
| `["document", id]` | `document-detail-view.tsx` | |
| `["document", id, "related"]` | `document-detail-view.tsx` | |
| `["document", id, "chat"]` | `document-detail-view.tsx` | invalidated on send |
| (search) | `search-view.tsx` | `useMutation`, not `useQuery` — no cache key, re-fetches per submit |
