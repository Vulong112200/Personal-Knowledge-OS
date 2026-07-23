"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, type DocumentStatus } from "@/components/ui/badge";
import type { GraphResponseDto } from "@pkos/contracts";

const ForceGraphCanvas = dynamic(() => import("../../graph/force-graph-canvas"), { ssr: false });

interface DocumentDto {
  id: string;
  title: string;
  status: DocumentStatus;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

interface ChatMessageDto {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatHistoryResponse {
  available: boolean;
  messages: ChatMessageDto[];
}

interface ChatSendResponse {
  available: boolean;
  reply?: string;
}

export function DocumentDetailView({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const document = useQuery<DocumentDto>({
    queryKey: ["document", documentId],
    queryFn: () => apiFetch(`/documents/${documentId}`),
  });

  const relatedGraph = useQuery<GraphResponseDto>({
    queryKey: ["document", documentId, "related", "graph"],
    queryFn: () => apiFetch(`/documents/${documentId}/related/graph`),
  });

  const chatHistory = useQuery<ChatHistoryResponse>({
    queryKey: ["document", documentId, "chat"],
    queryFn: () => apiFetch(`/documents/${documentId}/chat`),
  });

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      apiFetch(`/documents/${documentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }) as Promise<ChatSendResponse>,
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["document", documentId, "chat"] });
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (draft.trim()) sendMessage.mutate(draft.trim());
  }

  const hasEgoGraph = (relatedGraph.data?.edges.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title={document.data?.title ?? "Loading..."}
        description={
          document.data
            ? `${Number(document.data.sizeBytes).toLocaleString()} bytes`
            : undefined
        }
        action={document.data && <StatusBadge status={document.data.status} />}
      />

      <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
        <Card>
          <CardHeader>
            <CardTitle>Related documents</CardTitle>
          </CardHeader>
          <CardContent>
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

        <Card className="flex flex-col gap-2">
          <CardHeader>
            <CardTitle>Chat with this document</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {chatHistory.data?.available === false && (
              <p className="rounded-md bg-background-muted px-3 py-2 text-xs text-muted-foreground">
                AI is not enabled for this workspace.
              </p>
            )}

            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {chatHistory.data?.messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "self-end max-w-[80%] rounded-2xl rounded-br-sm gradient-brand px-3 py-2 text-sm text-white"
                      : "self-start max-w-[80%] rounded-2xl rounded-bl-sm bg-background-muted px-3 py-2 text-sm text-foreground"
                  }
                >
                  {m.content}
                </div>
              ))}
            </div>

            <form onSubmit={handleSend} className="flex gap-2">
              <Input
                type="text"
                placeholder="Ask a question about this document..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={chatHistory.data?.available === false}
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={sendMessage.isPending || chatHistory.data?.available === false}
                aria-label="Send"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
