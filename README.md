# PKOS — Personal Knowledge Operating System

Monorepo (pnpm workspaces):

- `apps/api` — NestJS backend
- `apps/web` — Next.js frontend
- `packages/contracts` — shared zod schemas/DTOs

## Setup

```bash
pnpm install
cp .env.example apps/api/.env      # fill in Supabase/Upstash/OpenAI values
cp .env.example apps/web/.env.local
```

## Dev

```bash
pnpm --filter @pkos/contracts build   # run this first, and again after editing packages/contracts —
                                        # apps/api runs compiled output under plain `node`, which can't
                                        # transpile the package's TS source on its own
pnpm dev:api   # http://localhost:3001
pnpm dev:web   # http://localhost:3000
```

API docs (Swagger UI): http://localhost:3001/docs — public, no auth required.

## Testing

```bash
pnpm --filter @pkos/api build     # e2e tests spawn the compiled server, so build first
pnpm --filter @pkos/api test:e2e
```

The e2e suite spawns the real compiled server (`node dist/src/main.js`) and hits it over
HTTP, rather than bootstrapping `AppModule` in-process via Nest's `TestingModule`. That
in-process route triggers Prisma 7's WASM query-compiler loader (a dynamic `import()` deep
in `@prisma/client`'s runtime) under ts-jest's CJS/VM sandbox, which fails outright even
with `--experimental-vm-modules` set — Jest's module system and Prisma 7's WASM loader
don't currently mix. Running the actual built server sidesteps it entirely. One consequence:
auth-success paths (a valid Supabase token producing a `200`) need a real Supabase-issued
JWT and aren't covered by this suite — they're exercised manually against the live project
per milestone (see the plan doc's verification notes).

## Architecture

Modular monolith. Every module lives under `apps/api/src/<name>/` with its own
`*.module.ts`, `*.service.ts`, `*.controller.ts`. Five cross-cutting concerns are behind
**ports** — an interface + DI token in `<name>.port.ts`, bound to a concrete adapter by each
module's `*.module.ts` (env-driven where more than one adapter exists) — so the rest of the
app depends only on the interface, never the concrete implementation:

| Port | Interface | Adapter(s) |
|---|---|---|
| `STORAGE_PORT` | `src/storage/storage.port.ts` | `LocalFsStorageAdapter` (R2 adapter not yet implemented) |
| `SEARCH_PORT` | `src/search/search.port.ts` | `PostgresSearchAdapter` (full-text only — see AI note below) |
| `AI_PORT` | `src/ai/ai.port.ts` | `NullAiAdapter` (default), `OpenRouterAdapter` |
| `AUTH_PORT` | `src/auth/auth.port.ts` | `SupabaseAuthAdapter` (JWKS/ES256 first, HS256-secret fallback) |
| `QUEUE_PORT` | `src/queue/queue.port.ts` | `BullMqQueueAdapter` |

Everything else (`documents`, `users`, `workspaces`, `tags`, `graph`, `chat`, `ingestion`) is
a plain service + Prisma repository — no forced domain/CQRS layering for code that doesn't
need to be swappable.

### Adding a new adapter for an existing port

1. Implement the port's interface (e.g. `AiPort`) in a new class under that module's folder.
2. Wire it into the module's provider factory (see `ai.module.ts` for the env-driven
   pattern) — usually just a new `if` branch keyed off an env var.
3. Nothing outside that module needs to change — every consumer depends on the port token
   (`@Inject(AI_PORT)`), not the concrete class.

### Notable implementation decisions (things that weren't in the original plan)

- **AI provider is OpenRouter, chat-only.** Originally planned around OpenAI (embeddings +
  chat). OpenRouter has no embeddings endpoint, so semantic/hybrid search was dropped —
  search is full-text only (`SearchPort.searchFullText`, Postgres `simple` tsvector config,
  chosen over `english` because the target content is English + Vietnamese and `english`
  stemming corrupts Vietnamese tokens). `pgvector`/`vector(1536)`/`hnsw` remain in the schema
  unused, in case a future embeddings-capable provider is added.
- **Prisma ORM v7** changed enough to affect setup: no more `directUrl` (pooled-vs-direct
  split) — a single direct connection string is used for both the app and migrations;
  the client generator needs `moduleFormat = "cjs"` to build under NestJS; and a driver
  adapter (`@prisma/adapter-pg`) is required instead of the old built-in query engine.
- **Supabase's direct connection host resolved IPv6-only** on the dev network — the pooler
  hostname on port 5432 (session mode, not 6543 transaction mode) is used instead.
