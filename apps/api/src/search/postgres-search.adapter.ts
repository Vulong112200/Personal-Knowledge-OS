import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/prisma/client';
import { SNIPPET_HIGHLIGHT_START, SNIPPET_HIGHLIGHT_END } from '@pkos/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { EMBEDDING_PORT, type EmbeddingPort } from '../ai/embedding.port';
import { ChunkHit, SearchOptions, SearchPage, SearchPort, SearchResult } from './search.port';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const RRF_K = 60; // reciprocal-rank-fusion constant; larger = flatter weighting

@Injectable()
export class PostgresSearchAdapter implements SearchPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDING_PORT) private readonly embedding: EmbeddingPort,
  ) {}

  async searchFullText(workspaceId: string, query: string, opts?: SearchOptions): Promise<SearchPage> {
    const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(opts?.offset ?? 0, 0);

    // Diacritics-insensitive tsquery ("hoc" matches "học") via the immutable f_unaccent
    // wrapper (see migration). Title is matched inline and weighted above body text so a
    // title hit ranks first; the body tsv is a precomputed generated column (GIN-indexed).
    const rows = await this.prisma.$queryRaw<Array<SearchResult & { total: bigint }>>`
      WITH q AS (SELECT plainto_tsquery('simple', f_unaccent(${query})) AS query)
      SELECT
        d.id AS "documentId",
        d.title AS "title",
        -- StartSel/StopSel use control characters (never escaped by ts_headline, unlike
        -- the underlying document text) so the frontend can split on them safely instead
        -- of rendering raw HTML from user-uploaded content via dangerouslySetInnerHTML.
        ts_headline(
          'simple',
          dc.text_content,
          q.query,
          ${`MaxWords=30, MinWords=15, StartSel=${SNIPPET_HIGHLIGHT_START}, StopSel=${SNIPPET_HIGHLIGHT_END}`}
        ) AS "snippet",
        (
          ts_rank(dc.tsv, q.query)
          + ts_rank(to_tsvector('simple', f_unaccent(d.title)), q.query) * 2
        )::float AS "rank",
        COUNT(*) OVER()::bigint AS "total"
      FROM document_content dc
      JOIN documents d ON d.id = dc.document_id
      CROSS JOIN q
      WHERE d.workspace_id = ${workspaceId}::uuid
        AND (
          dc.tsv @@ q.query
          OR to_tsvector('simple', f_unaccent(d.title)) @@ q.query
        )
      ORDER BY "rank" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const total = rows.length ? Number(rows[0].total) : 0;
    const results = rows.map(({ total: _total, ...r }) => r);
    return { results, total };
  }

  async searchChunks(
    workspaceId: string,
    query: string,
    limit: number,
    documentId?: string,
  ): Promise<ChunkHit[]> {
    const k = Math.min(Math.max(limit, 1), MAX_LIMIT);

    // Lexical only when embeddings are off; otherwise fuse lexical + semantic with RRF so a
    // chunk ranked highly by either method surfaces (keyword precision + semantic recall).
    if (!this.embedding.isAvailable) {
      return this.lexicalChunks(workspaceId, query, k, documentId);
    }

    const [lexical, semantic] = await Promise.all([
      this.lexicalChunks(workspaceId, query, k * 2, documentId),
      this.semanticChunks(workspaceId, query, k * 2, documentId),
    ]);
    return this.fuse(lexical, semantic, k);
  }

  private async lexicalChunks(
    workspaceId: string,
    query: string,
    limit: number,
    documentId?: string,
  ): Promise<ChunkHit[]> {
    const documentFilter = documentId ? Prisma.sql`AND c.document_id = ${documentId}::uuid` : Prisma.empty;
    return this.prisma.$queryRaw<ChunkHit[]>`
      WITH q AS (SELECT plainto_tsquery('simple', f_unaccent(${query})) AS query)
      SELECT
        c.id AS "chunkId",
        c.document_id AS "documentId",
        d.title AS "title",
        c.content AS "content",
        c.ordinal AS "ordinal",
        ts_rank(c.tsv, q.query)::float AS "rank"
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      CROSS JOIN q
      WHERE c.workspace_id = ${workspaceId}::uuid
        ${documentFilter}
        AND c.tsv @@ q.query
      ORDER BY "rank" DESC
      LIMIT ${limit}
    `;
  }

  private async semanticChunks(
    workspaceId: string,
    query: string,
    limit: number,
    documentId?: string,
  ): Promise<ChunkHit[]> {
    const [queryVector] = await this.embedding.embed([query], 'query');
    if (!queryVector || queryVector.length === 0) return [];
    const literal = `[${queryVector.join(',')}]`;
    const documentFilter = documentId ? Prisma.sql`AND c.document_id = ${documentId}::uuid` : Prisma.empty;

    // Cosine distance (<=>) on the HNSW-indexed embedding; rank as 1 - distance (similarity).
    return this.prisma.$queryRaw<ChunkHit[]>`
      SELECT
        c.id AS "chunkId",
        c.document_id AS "documentId",
        d.title AS "title",
        c.content AS "content",
        c.ordinal AS "ordinal",
        (1 - (e.embedding <=> ${literal}::vector))::float AS "rank"
      FROM embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      JOIN documents d ON d.id = c.document_id
      WHERE c.workspace_id = ${workspaceId}::uuid
        ${documentFilter}
      ORDER BY e.embedding <=> ${literal}::vector
      LIMIT ${limit}
    `;
  }

  /** Reciprocal rank fusion: score each chunk by sum of 1/(K + position) across both lists,
   * then return the top-k unique chunks. Robust to the two methods' incomparable score scales. */
  private fuse(lexical: ChunkHit[], semantic: ChunkHit[], k: number): ChunkHit[] {
    const scores = new Map<string, number>();
    const byId = new Map<string, ChunkHit>();

    for (const list of [lexical, semantic]) {
      list.forEach((hit, position) => {
        scores.set(hit.chunkId, (scores.get(hit.chunkId) ?? 0) + 1 / (RRF_K + position + 1));
        if (!byId.has(hit.chunkId)) byId.set(hit.chunkId, hit);
      });
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([chunkId, score]) => ({ ...(byId.get(chunkId) as ChunkHit), rank: score }));
  }
}
