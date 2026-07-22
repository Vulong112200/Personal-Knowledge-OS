import { Injectable } from '@nestjs/common';
import { SNIPPET_HIGHLIGHT_START, SNIPPET_HIGHLIGHT_END } from '@pkos/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { SearchPort, SearchResult } from './search.port';

@Injectable()
export class PostgresSearchAdapter implements SearchPort {
  constructor(private readonly prisma: PrismaService) {}

  async searchFullText(workspaceId: string, query: string): Promise<SearchResult[]> {
    return this.prisma.$queryRaw<SearchResult[]>`
      SELECT
        d.id AS "documentId",
        d.title AS "title",
        -- StartSel/StopSel use control characters (never escaped by ts_headline, unlike
        -- the underlying document text) so the frontend can split on them safely instead
        -- of rendering raw HTML from user-uploaded content via dangerouslySetInnerHTML.
        ts_headline(
          'simple',
          dc.text_content,
          plainto_tsquery('simple', ${query}),
          ${`MaxWords=30, MinWords=15, StartSel=${SNIPPET_HIGHLIGHT_START}, StopSel=${SNIPPET_HIGHLIGHT_END}`}
        ) AS "snippet",
        ts_rank(dc.tsv, plainto_tsquery('simple', ${query}))::float AS "rank"
      FROM document_content dc
      JOIN documents d ON d.id = dc.document_id
      WHERE d.workspace_id = ${workspaceId}::uuid
        AND dc.tsv @@ plainto_tsquery('simple', ${query})
      ORDER BY "rank" DESC
      LIMIT 20
    `;
  }
}
