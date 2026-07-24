"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { SNIPPET_HIGHLIGHT_START, SNIPPET_HIGHLIGHT_END } from "@pkos/contracts";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
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
        <mark className="rounded bg-indigo-100 px-0.5 font-medium text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-200">
          {highlighted}
        </mark>
        {rest.join(SNIPPET_HIGHLIGHT_END)}
      </span>
    );
  });
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const search = useMutation({
    mutationFn: (q: string) => apiFetch(`/search?q=${encodeURIComponent(q)}`) as Promise<SearchResponse>,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
    search.mutate(q);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search your documents..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={search.isPending}>
          {search.isPending ? "Searching..." : "Search"}
        </Button>
      </form>

      <div className="flex flex-col gap-2">
        {search.isPending && <p className="text-sm text-muted-foreground">Searching...</p>}

        {search.isError && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            Search failed. Please try again.
          </p>
        )}

        {search.isSuccess && (
          <p className="text-xs text-muted-foreground">
            {search.data.total} result{search.data.total === 1 ? "" : "s"} for &ldquo;{submitted}&rdquo;
          </p>
        )}

        {!search.isPending &&
          search.data?.results.map((result) => (
            <Link key={result.documentId} href={`/documents/${result.documentId}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:shadow-glow">
              <CardContent className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{result.title}</span>
                <p className="text-sm text-muted-foreground">{renderSnippet(result.snippet)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
