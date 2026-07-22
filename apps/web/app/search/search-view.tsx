"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { SNIPPET_HIGHLIGHT_START, SNIPPET_HIGHLIGHT_END } from "@pkos/contracts";
import { apiFetch } from "@/lib/api";

interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

interface SearchResponse {
  results: SearchResult[];
  semanticUnavailable: boolean;
}

// Snippets carry SNIPPET_HIGHLIGHT_START/END control characters (not literal HTML) around
// matched terms, so highlighting can be rendered as React text nodes — never raw HTML from
// user-uploaded document content — even though the query box below accepts arbitrary input.
function renderSnippet(snippet: string): ReactNode {
  return snippet.split(SNIPPET_HIGHLIGHT_START).map((part, i) => {
    if (i === 0) return part;
    const [highlighted, ...rest] = part.split(SNIPPET_HIGHLIGHT_END);
    return (
      <span key={i}>
        <mark className="rounded bg-yellow-200 px-0.5 dark:bg-yellow-900">{highlighted}</mark>
        {rest.join(SNIPPET_HIGHLIGHT_END)}
      </span>
    );
  });
}

export function SearchView() {
  const [query, setQuery] = useState("");

  const search = useMutation({
    mutationFn: (q: string) => apiFetch(`/search?q=${encodeURIComponent(q)}`) as Promise<SearchResponse>,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) search.mutate(query.trim());
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="Search your documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm dark:border-white/[.145]"
        />
        <button
          type="submit"
          disabled={search.isPending}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          Search
        </button>
      </form>

      {search.data?.semanticUnavailable && (
        <p className="text-xs text-zinc-500">
          Semantic search is not enabled for this workspace — showing full-text matches only.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {search.data?.results.length === 0 && (
          <p className="text-sm text-zinc-500">No matches.</p>
        )}
        {search.data?.results.map((result) => (
          <div
            key={result.documentId}
            className="flex flex-col gap-1 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
          >
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              {result.title}
            </span>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {renderSnippet(result.snippet)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
