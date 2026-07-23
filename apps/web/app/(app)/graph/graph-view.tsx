"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Share2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import type { GraphResponseDto } from "@pkos/contracts";

const ForceGraphCanvas = dynamic(() => import("./force-graph-canvas"), { ssr: false });

export function GraphView() {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [query, setQuery] = useState("");

  const graph = useQuery<GraphResponseDto>({
    queryKey: ["graph"],
    queryFn: () => apiFetch("/graph"),
  });

  const filteredData = useMemo(() => {
    if (!graph.data) return { nodes: [], links: [], highlightIds: null };
    const q = query.trim().toLowerCase();
    const matchIds = q
      ? new Set(graph.data.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id))
      : null;
    return {
      nodes: graph.data.nodes,
      links: graph.data.edges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        edgeType: e.edgeType,
        weight: e.weight,
      })),
      highlightIds: matchIds,
    };
  }, [graph.data, query]);

  if (graph.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-8 animate-pulse rounded-full gradient-brand" />
      </div>
    );
  }

  if (graph.data && graph.data.nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <Share2 className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Upload a document to start building your knowledge graph.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-border p-4">
        <Input
          placeholder="Filter by label..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-4">
          {graph.data?.truncated && (
            <p className="text-xs text-warning">
              Showing {graph.data.nodes.length} of {graph.data.totalNodeCount} nodes (most recent).
            </p>
          )}
          <div className="flex gap-1 rounded-full border border-border bg-background-muted p-1">
            <button
              onClick={() => setMode("2d")}
              className={
                mode === "2d"
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "px-3 py-1 text-xs font-medium text-muted-foreground"
              }
            >
              2D
            </button>
            <button
              onClick={() => setMode("3d")}
              className={
                mode === "3d"
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                  : "px-3 py-1 text-xs font-medium text-muted-foreground"
              }
            >
              3D
            </button>
          </div>
        </div>
      </div>
      <div className="relative flex-1">
        <ForceGraphCanvas mode={mode} data={filteredData} />
      </div>
    </div>
  );
}
