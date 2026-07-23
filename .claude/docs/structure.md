# Structure — annotated file tree

Only source files are listed (no `node_modules`, `dist`, `.next`, `prisma/generated`,
`var/storage`, lockfiles). Update this file when adding/removing/renaming source files.

```
pkos/
├── CLAUDE.md
├── README.md                          # setup, dev, testing, architecture summary
├── .env.example                       # documents every env var used by apps/api + apps/web
├── pnpm-workspace.yaml
├── package.json                       # root scripts: dev:api, dev:web, build, lint
├── tsconfig.base.json                 # shared compiler options
│
├── apps/api/                          # NestJS backend
│   ├── prisma/
│   │   ├── schema.prisma              # full MVP data model
│   │   └── migrations/*/migration.sql # hand-edited: adds `vector` ext, `tsv` gen column, hnsw index
│   ├── prisma.config.ts               # Prisma v7 config (single DATABASE_URL, no directUrl)
│   ├── test/
│   │   ├── app.e2e-spec.ts            # black-box e2e — spawns dist/src/main.js, hits it over HTTP
│   │   └── jest-e2e.json
│   └── src/
│       ├── main.ts                    # bootstrap, Swagger setup, BigInt.prototype.toJSON patch
│       ├── app.module.ts              # root module — wires every feature module + the 5 ports
│       ├── app.controller.ts          # Nest scaffold default route, @Public()
│       ├── app.service.ts
│       │
│       ├── prisma/                    # PrismaService (driver-adapter pattern) + PrismaModule (@Global)
│       │   ├── prisma.service.ts      # `new PrismaClient({ adapter: new PrismaPg(...) })`
│       │   └── prisma.module.ts
│       │
│       ├── health/
│       │   └── health.controller.ts   # GET /health (no DB), GET /health/db (queries DB) — both @Public()
│       │
│       ├── auth/                      # AUTH_PORT
│       │   ├── auth.port.ts           # AuthPort interface, AUTH_PORT token
│       │   ├── supabase-auth.adapter.ts # JWKS-first (ES256), HS256-secret fallback; dynamic `import('jose')`
│       │   ├── jwt-auth.guard.ts      # global guard (registered as APP_GUARD inside auth.module.ts)
│       │   ├── public.decorator.ts    # @Public() — IS_PUBLIC_KEY metadata
│       │   ├── current-user.decorator.ts # @CurrentUser() param decorator
│       │   └── auth.module.ts         # binds AUTH_PORT + registers APP_GUARD (must be here, not app.module.ts)
│       │
│       ├── users/
│       │   ├── users.service.ts       # findOrCreateFromAuth — upserts user, ensures default workspace
│       │   ├── users.controller.ts    # GET /me
│       │   └── users.module.ts
│       │
│       ├── workspaces/
│       │   ├── workspaces.service.ts  # ensureDefaultWorkspace (idempotent find-or-create)
│       │   └── workspaces.module.ts
│       │
│       ├── storage/                   # STORAGE_PORT
│       │   ├── storage.port.ts
│       │   ├── local-fs-storage.adapter.ts # keyed {workspaceId}/{documentId}/{filename} under var/storage
│       │   └── storage.module.ts      # @Global, chooses adapter via STORAGE_DRIVER env
│       │
│       ├── documents/
│       │   ├── documents.service.ts   # upload (validates ext+size, sha256 checksum), list, get, download
│       │   ├── documents.controller.ts # POST/GET /documents, GET /documents/:id[/download]
│       │   └── documents.module.ts
│       │
│       ├── queue/                     # QUEUE_PORT
│       │   ├── queue.port.ts
│       │   ├── redis-connection.ts    # ioredis w/ maxRetriesPerRequest:null, enableReadyCheck:false (Upstash)
│       │   ├── bullmq-queue.adapter.ts
│       │   └── queue.module.ts        # @Global
│       │
│       ├── ingestion/
│       │   ├── document-processor.worker.ts # the BullMQ Worker — orchestrates the whole pipeline
│       │   ├── document-processing.constants.ts # queue name + job payload type (shared by producer/consumer)
│       │   ├── extract-text.ts        # pdf-parse / mammoth / plain-read dispatch by extension
│       │   ├── chunk-text.ts          # paragraph/sentence-aware splitter, ~650 tokens via gpt-tokenizer
│       │   ├── extract-keywords.ts    # naive top-N keyword frequency (autotag stub)
│       │   └── ingestion.module.ts    # imports TagsModule + GraphModule
│       │
│       ├── search/                    # SEARCH_PORT
│       │   ├── search.port.ts         # searchFullText only (searchSemantic removed)
│       │   ├── postgres-search.adapter.ts # plainto_tsquery('simple', ...) + ts_rank + ts_headline
│       │   ├── search.controller.ts   # GET /search?q=
│       │   └── search.module.ts       # @Global
│       │
│       ├── ai/                        # AI_PORT
│       │   ├── ai.port.ts             # chat-only interface: { isAvailable, chatComplete }
│       │   ├── null-ai.adapter.ts     # default, throws AiUnavailableError
│       │   ├── openrouter.adapter.ts  # openai SDK w/ baseURL override, default model gpt-oss-20b:free
│       │   └── ai.module.ts           # @Global, env-driven factory w/ fail-soft fallback + warning log
│       │
│       ├── tags/
│       │   ├── tags.service.ts        # findOrCreate, assignToDocument, listForWorkspace/Document
│       │   ├── tags.controller.ts     # GET /tags
│       │   └── tags.module.ts
│       │
│       ├── graph/
│       │   ├── graph.service.ts       # ensureNode/ensureEdge, relateByTags, getRelatedDocuments
│       │   ├── graph.controller.ts    # GET /documents/:id/related
│       │   └── graph.module.ts
│       │
│       └── chat/
│           ├── chat.service.ts        # per-(workspace,document,user) session, injects doc text as context
│           ├── chat.controller.ts     # GET/POST /documents/:id/chat
│           └── chat.module.ts
│
├── apps/web/                          # Next.js frontend (App Router)
│   ├── next.config.ts                 # transpilePackages: ["@pkos/contracts"]
│   ├── proxy.ts                       # Next 16's renamed middleware.ts — refreshes Supabase session cookie
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts              # createBrowserClient — for client components
│   │   │   └── server.ts              # createServerClient (async cookies()) — for server components
│   │   ├── api.ts                     # apiFetch() — attaches Supabase access_token to API calls
│   │   └── query-provider.tsx         # TanStack QueryClientProvider (wraps app/layout.tsx)
│   └── app/
│       ├── layout.tsx                 # wraps children in QueryProvider
│       ├── page.tsx                   # redirects to /dashboard or /login based on session
│       ├── login/page.tsx
│       ├── signup/page.tsx
│       ├── dashboard/
│       │   ├── page.tsx               # calls GET /me server-side, links to Documents/Search
│       │   └── logout-button.tsx      # client component, supabase.auth.signOut()
│       ├── documents/
│       │   ├── page.tsx
│       │   ├── documents-view.tsx     # react-dropzone upload + status-polling list
│       │   └── [id]/
│       │       ├── page.tsx           # async params (Next 16: params is a Promise)
│       │       └── document-detail-view.tsx # Related Documents panel + AI chat panel
│       └── search/
│           ├── page.tsx
│           └── search-view.tsx        # renders ts_headline snippets as React text nodes, not raw HTML
│
└── packages/contracts/                # shared, built to CJS — rebuild after every edit
    ├── tsconfig.json                  # extends root, outDir dist, declaration:true
    └── src/
        ├── index.ts                  # re-exports document.ts, search.ts
        ├── document.ts                # documentStatusSchema (zod)
        └── search.ts                  # SNIPPET_HIGHLIGHT_START/END control-char constants
```
