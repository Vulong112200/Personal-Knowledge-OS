"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Pencil, RefreshCw, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/format";
import { linkifyWikiLinks } from "@/lib/wiki-links";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge, type DocumentStatus } from "@/components/ui/badge";
import { ChatPanel } from "@/components/chat-panel";
import { Markdown } from "@/components/markdown";
import type { DocumentSource, GraphResponseDto, RelatedDocumentDto } from "@pkos/contracts";

const ForceGraphCanvas = dynamic(() => import("../../graph/force-graph-canvas"), { ssr: false });

interface DocumentDto {
  id: string;
  title: string;
  source: DocumentSource;
  originalFilename: string | null;
  status: DocumentStatus;
  mimeType: string | null;
  sizeBytes: string | null;
  createdAt: string;
}

interface ContentResponse {
  textContent: string | null;
}

export function DocumentDetailView({ documentId }: { documentId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const document = useQuery<DocumentDto>({
    queryKey: ["document", documentId],
    queryFn: () => apiFetch(`/documents/${documentId}`),
  });

  const content = useQuery<ContentResponse>({
    queryKey: ["document", documentId, "content"],
    queryFn: () => apiFetch(`/documents/${documentId}/content`),
  });

  const relatedGraph = useQuery<GraphResponseDto>({
    queryKey: ["document", documentId, "related", "graph"],
    queryFn: () => apiFetch(`/documents/${documentId}/related/graph`),
  });

  const backlinks = useQuery<RelatedDocumentDto[]>({
    queryKey: ["document", documentId, "backlinks"],
    queryFn: () => apiFetch(`/documents/${documentId}/backlinks`),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/documents/${documentId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      router.push("/documents");
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to delete document."),
  });

  const reprocess = useMutation({
    mutationFn: () => apiFetch(`/documents/${documentId}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      // Re-fetch status/content/graph as the pipeline re-runs.
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : "Failed to reprocess document."),
  });

  const isNote = document.data?.source === "note";

  async function handleDownload() {
    setActionError(null);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/documents/${documentId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      // Notes download as Markdown; uploads keep their original filename (and extension).
      a.download = isNote
        ? `${document.data?.title ?? "note"}.md`
        : (document.data?.originalFilename ?? document.data?.title ?? "document");
      window.document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so the browser finishes capturing the download first (revoking on the
      // same tick as click() silently cancels larger downloads in some browsers).
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed.");
    }
  }

  function handleDelete() {
    if (window.confirm("Delete this document permanently? This cannot be undone.")) {
      remove.mutate();
    }
  }

  const hasEgoGraph = (relatedGraph.data?.edges.length ?? 0) > 0;

  if (document.isError) {
    return (
      <>
        <PageHeader title="Document" />
        <div className="p-8">
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            Failed to load this document. It may have been deleted, or the API is unreachable.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={document.data?.title ?? "Loading..."}
        description={
          document.data
            ? isNote
              ? "Note"
              : formatBytes(Number(document.data.sizeBytes ?? 0))
            : undefined
        }
        action={
          document.data && (
            <div className="flex items-center gap-2">
              {isNote && <Badge className="bg-primary/10 text-primary">Note</Badge>}
              <StatusBadge status={document.data.status} />
              {isNote && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => router.push(`/documents/${documentId}/edit`)}
                  aria-label="Edit note"
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => reprocess.mutate()}
                disabled={reprocess.isPending}
                aria-label="Reprocess"
                title="Re-run the ingestion pipeline (re-extract, tag, embed, relate)"
              >
                <RefreshCw className={reprocess.isPending ? "size-4 animate-spin" : "size-4"} />
              </Button>
              <Button variant="outline" size="icon" onClick={handleDownload} aria-label="Download">
                <Download className="size-4" />
              </Button>
              <Button
                variant="danger"
                size="icon"
                onClick={handleDelete}
                disabled={remove.isPending}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        }
      />

      <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
        {actionError && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{actionError}</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
          </CardHeader>
          <CardContent>
            {content.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {content.isError && (
              <p className="text-sm text-danger">Failed to load content.</p>
            )}
            {content.data && !content.data.textContent && (
              <p className="text-sm text-muted-foreground">
                No readable text yet (still processing, needs OCR, or empty).
              </p>
            )}
            {content.data?.textContent &&
              (isNote ? (
                <div className="max-h-96 overflow-y-auto">
                  <Markdown>{linkifyWikiLinks(content.data.textContent)}</Markdown>
                </div>
              ) : (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm text-foreground">
                  {content.data.textContent}
                </pre>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Related documents</CardTitle>
          </CardHeader>
          <CardContent>
            {relatedGraph.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {relatedGraph.data && !hasEgoGraph && (
              <p className="text-sm text-muted-foreground">None yet.</p>
            )}
            {hasEgoGraph && (
              <div className="relative h-64 overflow-hidden rounded-xl border border-border">
                <ForceGraphCanvas
                  mode="2d"
                  compact
                  data={{
                    nodes: relatedGraph.data!.nodes,
                    links: relatedGraph.data!.edges.map((e) => ({
                      id: e.id,
                      source: e.sourceNodeId,
                      target: e.targetNodeId,
                      edgeType: e.edgeType,
                      weight: e.weight,
                    })),
                    highlightIds: null,
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linked references</CardTitle>
          </CardHeader>
          <CardContent>
            {backlinks.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {backlinks.data && backlinks.data.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No other documents link here yet. Reference this document from a note with{" "}
                <code className="rounded bg-background-muted px-1 py-0.5 text-xs">[[{document.data?.title}]]</code>.
              </p>
            )}
            {backlinks.data && backlinks.data.length > 0 && (
              <ul className="flex flex-col gap-1">
                {backlinks.data.map((b) => (
                  <li key={b.documentId}>
                    <Link
                      href={`/documents/${b.documentId}`}
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <Link2 className="size-3.5" />
                      <span className="truncate">{b.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat with this document</CardTitle>
          </CardHeader>
          <CardContent>
            <ChatPanel
              queryKey={["document", documentId, "chat"]}
              historyUrl={`/documents/${documentId}/chat`}
              sendUrl={`/documents/${documentId}/chat`}
              placeholder="Ask a question about this document..."
              emptyHint="Ask a question about this document."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
