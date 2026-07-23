# CLAUDE.md — PKOS (Personal Knowledge Operating System)

Quick-reference for Claude Code when working in this repo. Deep dives live in `.claude/docs/`:
`features.md` (per-feature status + logic), `structure.md` (annotated file tree),
`callflows.md` (key request/data flows).

## Tech stack

- **Backend** — `apps/api`: NestJS 11, TypeScript, Prisma ORM **v7** (driver-adapter
  architecture, `@prisma/adapter-pg`), PostgreSQL (hosted on Supabase, pgvector enabled but
  unused), BullMQ + ioredis (queue, hosted on Upstash), Supabase Auth (JWT/JWKS), OpenRouter
  (AI, OpenAI-compatible API).
- **Frontend** — `apps/web`: Next.js **16** (App Router, Turbopack), React 19, TypeScript,
  Tailwind CSS 4, TanStack Query, `@supabase/ssr`.
- **Shared** — `packages/contracts`: small TS package (zod schemas + shared constants) built
  to CJS and consumed by both apps — **must be rebuilt after editing**
  (`pnpm --filter @pkos/contracts build`), since `apps/api` runs compiled output under plain
  `node` and can't transpile the package's TS source on its own.
- **Package manager** — pnpm workspaces, no Turborepo/Nx.

## Project layout

```
apps/api/          NestJS backend (see .claude/docs/structure.md for the full tree)
apps/web/           Next.js frontend
packages/contracts/  shared zod schemas + constants (build step required)
```

Not a `backend/` + `mobile/` split — there is no mobile app in this project.

## Architecture: 5 ports, everything else is plain services

Per the original plan (`C:\Users\vuhp\.claude\plans\project-personal-knowledge-mellow-dove.md`),
only the things the spec calls "abstractions" are behind a port (interface + DI token,
bound to an adapter in that module's `*.module.ts`). Everything else (`documents`,
`users`, `workspaces`, `tags`, `graph`, `chat`, `ingestion`) is a plain
service + Prisma repository — no forced domain/CQRS layering for code that doesn't need
to be swappable.

| Port | Interface | Adapter(s) | Selected via |
|---|---|---|---|
| `STORAGE_PORT` | `src/storage/storage.port.ts` | `LocalFsStorageAdapter` (R2 not implemented) | `STORAGE_DRIVER` |
| `SEARCH_PORT` | `src/search/search.port.ts` | `PostgresSearchAdapter` (full-text only) | — |
| `AI_PORT` | `src/ai/ai.port.ts` | `NullAiAdapter` (default), `OpenRouterAdapter` | `AI_ENABLED` + `OPENROUTER_API_KEY` |
| `AUTH_PORT` | `src/auth/auth.port.ts` | `SupabaseAuthAdapter` (JWKS/ES256 first, HS256 fallback) | — |
| `QUEUE_PORT` | `src/queue/queue.port.ts` | `BullMqQueueAdapter` | — |

**To add a new adapter**: implement the port's interface, wire it into that module's
provider factory (see `ai.module.ts` for the env-driven pattern), done — nothing outside
that module changes, since every consumer depends on the port token
(`@Inject(AI_PORT)`), never the concrete class.

## Key Features Registry

| Feature | Status | Notes |
|---|---|---|
| Auth + default workspace | ✅ | Supabase Auth, JWKS-first verification, auto-provision on first request |
| Document upload | ✅ | PDF/DOCX/MD/TXT, 20MB limit, local filesystem storage |
| Async ingestion pipeline | ✅ | extract → chunk → autotag → relate, BullMQ/Upstash |
| Full-text search | ✅ | Postgres `simple` tsvector + `unaccent` (VI diacritics-insensitive); title searchable + weighted; paginated (`limit`/`offset`, returns `total`) |
| Semantic/hybrid RAG | ✅ (opt-in) | Local embeddings via transformers.js (`multilingual-e5-small`, 384d); chat retrieval fuses lexical + semantic (RRF). Off unless `EMBEDDINGS_ENABLED=true`. `/search` itself stays full-text |
| Auto-tagging | ✅ (heuristic) | Top-5 by unigram frequency + recurring bigram phrases (helps VI), pure numbers dropped — still not real NLP/segmentation |
| Relationship detection | ✅ (naive stub) | `graph_edges` from shared tags only, no similarity leg |
| AI chat (per document) | ✅ | Retrieves most-relevant in-document chunks per question (lexical), falls back to doc head; last 10 messages as context |
| AI chat (whole knowledge base) | ✅ | `GET/POST /chat` — lexical RAG over all chunks in the workspace, returns cited `sources`; workspace-scoped session (`documentId=null`) |
| Document delete | ✅ | `DELETE /documents/:id` — removes storage object, graph node/edges, chat sessions; cascades content/chunks/tags |
| Tags UI | ✅ | `/tags` page (tag + document count), filter documents by tag (`GET /documents?tag=`), clickable tag nodes in graph |
| OCR (scanned PDFs) | 📋 not started | `status=needs_ocr` is set but nothing processes it (fast-follow: `tesseract.js`) |
| Graph visualization UI | 📋 not started | Schema/data exist (`graph_nodes`/`graph_edges`); only a flat "Related Documents" list is built |
| Flashcards / spaced repetition | 📋 not started | Out of MVP scope |
| Sharing / permissions beyond owner | 📋 not started | Single-owner workspace only |
| Admin tooling | 📋 not started | Out of MVP scope |

Status legend: ✅ done · 🚧 in progress · 📋 not started · ❌ dropped from scope (with reason)

## API Endpoints Summary

| Method | Path | Auth | Module |
|---|---|---|---|
| GET | `/` | public | — (Nest scaffold default) |
| GET | `/health`, `/health/db` | public | health |
| GET | `/me` | required | users |
| PATCH | `/me` | required | users (body `{displayName}`) |
| POST | `/documents` | required | documents (multipart, field `file`) |
| GET | `/documents` | required | documents (list, workspace-scoped; optional `?tag=<tagId>`) |
| GET | `/documents/:id` | required | documents |
| GET | `/documents/:id/content` | required | documents (extracted text for in-app reader) |
| GET | `/documents/:id/download` | required | documents |
| DELETE | `/documents/:id` | required | documents |
| GET | `/documents/:id/related` | required | graph |
| GET/POST | `/documents/:id/chat` | required | chat — per-document (GET = history, POST body `{message}`) |
| GET/POST | `/chat` | required | chat — whole knowledge base (POST returns `{reply, sources}`) |
| GET | `/tags` | required | tags (each with `documentCount`) |
| GET | `/search?q=` | required | search (optional `limit`/`offset`; returns `{results, total}`) |

Full OpenAPI schema (auto-generated, always current): run the API and open `/docs`
(Swagger UI, public route — mounted via middleware so the global auth guard doesn't apply).

## Database models (Prisma, `apps/api/prisma/schema.prisma`)

`users`, `workspaces`, `workspace_members`, `documents`, `document_content` (has a
generated `tsv` column not modeled in Prisma — see structure.md), `chunks` (also has a
generated `tsv` column for chunk-level RAG), `embeddings` (`vector(384)`, populated by the
opt-in embed stage), `tags`, `document_tags`,
`processing_jobs`, `graph_nodes`, `graph_edges`, `ai_chat_sessions`, `ai_chat_messages`.

Full status/relationships table: `.claude/docs/features.md`.

## Environment variables

See `.env.example` (root) for the authoritative list with comments. Key gotchas:
- `DATABASE_URL` must be the Supabase **direct** connection string (port 5432) via the
  **pooler hostname**, not `db.<ref>.supabase.co` (IPv6-only, unreachable on some networks).
  Prisma v7 removed `directUrl` — there's only one connection string now.
- `AI_ENABLED=true` needs `OPENROUTER_API_KEY`; missing key falls back to `NullAiAdapter`
  with a boot-time warning, never a crash.

## Most important files

- `apps/api/src/ingestion/document-processor.worker.ts` — the BullMQ worker orchestrating
  the whole pipeline (extract → chunk → autotag → relate); the highest-risk integration point.
- `apps/api/src/ai/ai.module.ts` — the fail-soft provider-selection pattern (env misconfig
  → `NullAiAdapter` + warning, never a boot failure); copy this pattern for future ports.
- `apps/api/prisma/schema.prisma` + `apps/api/prisma/migrations/*/migration.sql` — the
  hand-edited migration adds the `vector` extension, the `tsv` generated column, and the
  `hnsw` index that Prisma can't express natively; check the migration file, not just the
  schema, when touching search/embeddings.
- `apps/api/src/auth/jwt-auth.guard.ts` + `apps/api/src/auth/auth.module.ts` — the global
  guard is registered as `APP_GUARD` **inside** `AuthModule` (not `AppModule`) because
  `useClass` DI resolution needs `AUTH_PORT` in scope — see the module for why.

## Testing

`pnpm --filter @pkos/api test:e2e` — black-box e2e (spawns the compiled server, hits it
over HTTP). **Cannot** use Nest's in-process `TestingModule`: bootstrapping `AppModule` in
Jest triggers Prisma 7's WASM query-compiler loader, which fails under ts-jest's CJS/VM
sandbox even with `--experimental-vm-modules`. Build first: `pnpm --filter @pkos/api build`.

## Notable decisions that changed from the original plan

- **AI chat provider is OpenRouter (chat-only), not OpenAI.** OpenRouter has no embeddings
  endpoint, so embeddings are produced locally instead (see next bullet); `/search` remains
  full-text only, while chat retrieval can use semantic/hybrid.
- **Embeddings are local via transformers.js** (`EmbeddingPort` → `TransformersEmbeddingAdapter`,
  `multilingual-e5-small`, opt-in `EMBEDDINGS_ENABLED`). `pgvector`/`hnsw` are now used;
  the `embedding` column was resized `vector(1536)` → `vector(384)` to match the model.
  Chat RAG (`searchChunks`) fuses lexical + semantic with reciprocal rank fusion when enabled.
- **Prisma v7** removed the pooled/direct URL split, needs `moduleFormat = "cjs"` in the
  generator block to build under NestJS, and requires a driver adapter
  (`@prisma/adapter-pg`) instead of the old built-in query engine.
