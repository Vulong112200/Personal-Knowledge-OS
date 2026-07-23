"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface TagDto {
  id: string;
  name: string;
  color: string | null;
  documentCount: number;
}

export function TagsView() {
  const tags = useQuery<TagDto[]>({ queryKey: ["tags"], queryFn: () => apiFetch("/tags") });

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 p-8">
      {tags.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {tags.isError && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">Failed to load tags.</p>
      )}
      {tags.data?.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}

      <div className="flex flex-wrap gap-2">
        {tags.data?.map((tag) => (
          <Link key={tag.id} href={`/documents?tag=${tag.id}`}>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-all hover:border-primary/50 hover:shadow-glow">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: tag.color ?? "#a1a1aa" }}
              />
              {tag.name}
              <span className="text-xs text-muted-foreground">{tag.documentCount}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
