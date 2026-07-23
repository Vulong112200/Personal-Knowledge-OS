import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/generated/prisma/client';
import { SNIPPET_HIGHLIGHT_START, SNIPPET_HIGHLIGHT_END } from '@pkos/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ChunkHit, SearchOptions, SearchPage, SearchPort, SearchResult } from './search.port';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class PostgresSearchAdapter implements SearchPort {
  constructor(private readonly prisma: PrismaService) {}

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
    const documentFilter = documentId
      ? Prisma.sql`AND c.document_id = ${documentId}::uuid`
      : Prisma.empty;

    return this.prisma.$queryRaw<ChunkHit[]>`
      WITH q AS (SELECT plainto_tsquery('simple', f_unaccent(${query})) AS query)
      SELECT
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
      LIMIT ${k}
    `;
  }
}
