export interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface SearchPort {
  searchFullText(workspaceId: string, query: string): Promise<SearchResult[]>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
