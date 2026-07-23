export interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface SearchPage {
  results: SearchResult[];
  total: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

/** A retrieved chunk used to build RAG context for chat. */
export interface ChunkHit {
  documentId: string;
  title: string;
  content: string;
  ordinal: number;
  rank: number;
}

export interface SearchPort {
  searchFullText(workspaceId: string, query: string, opts?: SearchOptions): Promise<SearchPage>;
  /** Top-k most relevant chunks for a query, workspace-wide or scoped to one document. */
  searchChunks(
    workspaceId: string,
    query: string,
    limit: number,
    documentId?: string,
  ): Promise<ChunkHit[]>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
