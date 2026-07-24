"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NoteEditor } from "@/components/note-editor";

interface DocumentDto {
  id: string;
}

export function NewNoteView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: { title: string; content: string }) =>
      apiFetch("/documents/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as Promise<DocumentDto>,
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${doc.id}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create note."),
  });

  return (
    <>
      <PageHeader
        title="New note"
        description="Write a Markdown note — it's indexed, searchable, and chattable like any document."
      />
      <div className="w-full max-w-2xl p-8">
        <Card>
          <CardContent>
            <NoteEditor
              submitLabel="Create note"
              saving={create.isPending}
              error={error}
              onSave={(title, content) => {
                setError(null);
                create.mutate({ title, content });
              }}
              onCancel={() => router.push("/documents")}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
