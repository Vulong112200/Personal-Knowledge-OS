"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ChatPanel } from "@/components/chat-panel";

export function ChatView() {
  return (
    <>
      <PageHeader
        title="Chat"
        description="Ask across your entire knowledge base. Answers cite the documents they draw from."
      />
      <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
        <Card>
          <CardContent>
            <ChatPanel
              queryKey={["chat", "workspace"]}
              historyUrl="/chat"
              sendUrl="/chat"
              placeholder="Ask anything about your documents..."
              emptyHint="Ask a question and I'll answer from across all your documents."
              renderSources={(sources) =>
                sources.map((s) => (
                  <Link
                    key={s.documentId}
                    href={`/documents/${s.documentId}`}
                    className="truncate text-primary hover:underline"
                  >
                    [#{s.index}] {s.title}
                  </Link>
                ))
              }
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
