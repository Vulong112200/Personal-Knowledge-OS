"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface DocumentDto {
  id: string;
  title: string;
  status: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

interface RelatedDocument {
  documentId: string;
  title: string;
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

  const related = useQuery<RelatedDocument[]>({
    queryKey: ["document", documentId, "related"],
    queryFn: () => apiFetch(`/documents/${documentId}/related`),
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

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="truncate text-xl font-semibold text-black dark:text-zinc-50">
        {document.data?.title ?? "Loading..."}
      </h1>

      {document.data && (
        <p className="text-xs text-zinc-500">
          {document.data.status} · {Number(document.data.sizeBytes).toLocaleString()} bytes
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Related documents</h2>
        {related.data?.length === 0 && <p className="text-sm text-zinc-500">None yet.</p>}
        {related.data?.map((doc) => (
          <Link
            key={doc.documentId}
            href={`/documents/${doc.documentId}`}
            className="rounded-md border border-black/[.08] px-3 py-2 text-sm underline dark:border-white/[.145]"
          >
            {doc.title}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Chat with this document</h2>

        {chatHistory.data?.available === false && (
          <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900">
            AI is not enabled for this workspace.
          </p>
        )}

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {chatHistory.data?.messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "self-end rounded-lg bg-foreground px-3 py-2 text-sm text-background"
                  : "self-start rounded-lg bg-zinc-100 px-3 py-2 text-sm text-black dark:bg-zinc-800 dark:text-zinc-50"
              }
            >
              {m.content}
            </div>
          ))}
        </div>

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            placeholder="Ask a question about this document..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={chatHistory.data?.available === false}
            className="flex-1 rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-white/[.145]"
          />
          <button
            type="submit"
            disabled={sendMessage.isPending || chatHistory.data?.available === false}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
