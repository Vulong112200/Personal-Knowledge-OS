"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatSourceItem {
  index: number;
  documentId: string;
  title: string;
}

interface ChatHistory {
  available: boolean;
  messages: ChatMessageItem[];
}

interface SendResult {
  available: boolean;
  reply?: string;
  sources?: ChatSourceItem[];
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  return (
    <div
      className={
        role === "user"
          ? "self-end max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm gradient-brand px-3 py-2 text-sm text-white"
          : "self-start max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-background-muted px-3 py-2 text-sm text-foreground"
      }
    >
      {content}
    </div>
  );
}

export function ChatPanel({
  queryKey,
  historyUrl,
  sendUrl,
  placeholder = "Ask a question...",
  emptyHint,
  renderSources,
}: {
  queryKey: unknown[];
  historyUrl: string;
  sendUrl: string;
  placeholder?: string;
  emptyHint?: string;
  renderSources?: (sources: ChatSourceItem[]) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastSources, setLastSources] = useState<ChatSourceItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const history = useQuery<ChatHistory>({ queryKey, queryFn: () => apiFetch(historyUrl) });
  const available = history.data?.available;
  // Also disable while the initial history load is in flight: until `available` is known,
  // a send would fire but produce no optimistic bubble (cache is still undefined).
  const disabled = available === false || history.isLoading;

  const send = useMutation({
    mutationFn: (message: string) =>
      apiFetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }) as Promise<SendResult>,
  });

  const messages = history.data?.messages;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, send.isPending]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || send.isPending) return;

    setError(null);
    setDraft("");

    // Optimistically show the user's message immediately; the query cache is the single
    // source of truth, so a later refetch replaces this wholesale (no duplicates).
    // randomUUID (not Date.now) so two fast sends can't collide on the same React key.
    const tempId = `temp-${crypto.randomUUID()}`;
    queryClient.setQueryData<ChatHistory>(queryKey, (old) =>
      old ? { ...old, messages: [...old.messages, { id: tempId, role: "user", content: message }] } : old,
    );

    try {
      const result = await send.mutateAsync(message);
      if (!result.reply) {
        throw new Error("AI is not available for this workspace.");
      }
      setLastSources(result.sources ?? []);
      queryClient.setQueryData<ChatHistory>(queryKey, (old) =>
        old
          ? { ...old, messages: [...old.messages, { id: `${tempId}-a`, role: "assistant", content: result.reply! }] }
          : old,
      );
      // Confirm against the server (persisted messages replace the optimistic ones).
      queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      // Roll back the optimistic user bubble and restore the draft so nothing is lost.
      queryClient.setQueryData<ChatHistory>(queryKey, (old) =>
        old ? { ...old, messages: old.messages.filter((m) => m.id !== tempId) } : old,
      );
      setDraft(message);
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  const hasMessages = (messages?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-3">
      {disabled && (
        <p className="rounded-md bg-background-muted px-3 py-2 text-xs text-muted-foreground">
          AI is not enabled for this workspace.
        </p>
      )}
      {history.isError && (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          Failed to load conversation. Please refresh.
        </p>
      )}

      <div ref={scrollRef} className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {history.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!history.isLoading && !hasMessages && emptyHint && (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        )}
        {messages?.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}
        {send.isPending && (
          <div className="self-start max-w-[85%] rounded-2xl rounded-bl-sm bg-background-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="inline-flex gap-1">
              <span className="animate-pulse">Assistant is thinking</span>
            </span>
          </div>
        )}
        {renderSources && !send.isPending && lastSources.length > 0 && (
          <div className="self-start w-full rounded-md bg-background-muted px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Sources</span>
            <div className="mt-1 flex flex-col gap-1">{renderSources(lastSources)}</div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2">
        <Input
          type="text"
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          className="flex-1"
        />
        <Button type="submit" size="icon" disabled={disabled || send.isPending} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
