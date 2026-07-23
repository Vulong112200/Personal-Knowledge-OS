# Call flows — key request/data paths

Update this file only when a flow changes meaningfully (new step, endpoint changes logic,
new flow added) — not for every commit.

---

## 1. Authenticated request (any protected route)

```
Client request
  → Authorization: Bearer <supabase_access_token> header
  → JwtAuthGuard.canActivate (global APP_GUARD, registered in auth.module.ts)
      → @Public() check via Reflector — public routes (/, /health*, Swagger /docs) skip everything below
      → extractToken(request) — 401 if missing
      → AUTH_PORT.verifyToken(token)  [SupabaseAuthAdapter]
          → dynamic `import('jose')`
          → try JWKS (createRemoteJWKSet, ES256) first
          → catch → fall back to SUPABASE_JWT_SECRET (HS256) if set, else 401
          → returns { id, email } from payload.sub / payload.email
      → UsersService.findOrCreateFromAuth({id, email})
          → prisma.user.upsert (by id)
          → WorkspacesService.ensureDefaultWorkspace(userId, email)
              → findFirst by ownerId — if exists, return it (idempotent)
              → else create Workspace + WorkspaceMember(role='owner') in one Prisma call
          → returns CurrentUserPayload { id, email, displayName, defaultWorkspaceId }
      → request.user = CurrentUserPayload
  → Controller handler runs, @CurrentUser() decorator reads request.user
```

Every feature request (`/documents`, `/search`, `/tags`, `/documents/:id/chat`, etc.) scopes
its query by `user.defaultWorkspaceId` — there is no cross-workspace access path currently.

---

## 2. Document upload → async processing

```
POST /documents (multipart, field "file")
  → DocumentsController.upload → DocumentsService.upload(user, file)
      → validate extension (.pdf/.docx/.md/.txt) and size (≤20MB)
      → sha256 checksum of file.buffer
      → STORAGE_PORT.putObject(key, buffer)  [LocalFsStorageAdapter]
          → key = `{workspaceId}/{documentId}/{originalFilename}`
          → writes under apps/api/var/storage/
      → prisma.document.create (status='uploaded')
      → QUEUE_PORT.enqueue('document-processing', {documentId})  [BullMqQueueAdapter]
      → returns 201 with the document row immediately (pipeline runs fully async)

[async, in DocumentProcessor.process — the BullMQ Worker]
  → document.status = 'processing'
  → runExtract(document)
      → processing_jobs row (job_type='extract', status='running')
      → STORAGE_PORT.getObject(storageKey) → buffer
      → extractText(buffer, extension)
          .pdf  → pdf-parse's PDFParse class, .getText(), then .destroy()
          .docx → mammoth.extractRawText({buffer})
          .md/.txt → buffer.toString('utf-8')
      → if empty text (scanned PDF) → document.status='needs_ocr', STOP (no further stages)
      → else: upsert document_content, finish 'extract' job → runChunk(...)
  → runChunk(documentId, text)
      → processing_jobs row (job_type='chunk')
      → chunkText(text) → paragraph-first split, ~650 tokens/chunk (gpt-tokenizer)
      → delete old chunks (retry-safe), createMany new chunks
      → finish 'chunk' job → runAutoTagAndRelate(...)
  → runAutoTagAndRelate(documentId, workspaceId, text)
      → processing_jobs row (job_type='autotag')
      → extractKeywords(text, 5) → for each: TagsService.findOrCreate + assignToDocument(source='ai')
      → on success: processing_jobs row (job_type='relate')
          → GraphService.relateByTags(workspaceId, documentId)
              → find this doc's tags → find other docs sharing any of them
              → ensureNode (document) for self + each related doc
              → ensureEdge (edge_type='shares_tag'), bumping weight if it already exists
      → autotag/relate failures are caught and marked 'failed' on that job row only —
        document.status still becomes 'processed' (extract+chunk already succeeded)
  → document.status = 'processed'

[on any extract/chunk exception] → markFailed: document.status='failed' + errorMessage,
  all 'running' processing_jobs rows for this document → 'failed'
```

Frontend: `documents-view.tsx` polls `GET /documents` every 5s (TanStack Query
`refetchInterval`) to show live status badges — no websocket/SSE push.

---

## 3. Full-text search

```
GET /search?q=<query>
  → SearchController.search(user, q)
      → empty/whitespace q → { results: [] }, no DB call
      → SEARCH_PORT.searchFullText(workspaceId, q)  [PostgresSearchAdapter]
          → SQL: document_content.tsv @@ plainto_tsquery('simple', q)
          → ts_rank(...) for ordering, ts_headline(...) for snippet
          → StartSel/StopSel = SNIPPET_HIGHLIGHT_START/END (control chars \x01/\x02,
            from @pkos/contracts) — NOT literal HTML, to avoid XSS from ts_headline
            not escaping the underlying (user-uploaded) document text
      → returns { results: [{documentId, title, snippet, rank}] }

Frontend (search-view.tsx): splits snippet on the control chars, wraps the highlighted
segment in a plain <mark> React element — never dangerouslySetInnerHTML.
```

---

## 4. AI chat with a document

```
GET /documents/:id/chat  (history)
  → ChatService.getHistory(user, documentId)
      → getOrCreateSession(workspaceId, documentId, userId) — one session per triple, idempotent
      → returns { available: AI_PORT.isAvailable, messages: [...] }
      → NOTE: history is returned even when available=false (past messages from when AI was
        enabled remain visible; only *sending new messages* is blocked)

POST /documents/:id/chat  { message }
  → ChatService.sendMessage(user, documentId, message)
      → 400 if message is empty
      → if !AI_PORT.isAvailable → return { available: false } immediately, no DB writes beyond none
      → else:
          → verify document belongs to user's workspace (404 otherwise)
          → getOrCreateSession(...)
          → documentContent.textContent, sliced to 6000 chars → context
          → last 10 ai_chat_messages for this session → history
          → persist the user message
          → AI_PORT.chatComplete([
               {role:'system', content: `...about "${title}"...\n\n${context}`},
               ...history,
               {role:'user', content: message},
             ])  [OpenRouterAdapter → openai SDK, baseURL=openrouter.ai/api/v1]
          → persist the assistant reply
          → return { available: true, reply }
```

Frontend (`document-detail-view.tsx`): input disabled when `available === false`; on send,
invalidates the `["document", id, "chat"]` query key to refetch history.
