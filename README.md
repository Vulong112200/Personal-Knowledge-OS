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

Architecture and milestone plan: see the foundation plan doc for context on the 5 cross-cutting ports (Storage, Search, AI, Auth, Queue) and the module layout.
