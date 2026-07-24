"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { NoteEditor } from "@/components/note-editor";

interface DocumentDto {
  id: string;
  title: string;
  source: "upload" | "note";
}

interface ContentResponse {
  textContent: string | null;
}

export function EditNoteView({ documentId }: { documentId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const document = useQuery<DocumentDto>({
    queryKey: ["document", documentId],
    queryFn: () => apiFetch(`/documents/${documentId}`),
  });
  const content = useQuery<ContentResponse>({
    queryKey: ["document", documentId, "content"],
    queryFn: () => apiFetch(`/documents/${documentId}/content`),
  });

  const save = useMutation({
    mutationFn: (body: { title: string; content: string }) =>
      apiFetch(`/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      router.push(`/documents/${documentId}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to save note."),
  });

  const notEditable = document.data && document.data.source !== "note";
  const ready = document.data && !content.isLoading;

  return (
    <>
      <PageHeader title="Edit note" />
      <div className="w-full max-w-2xl p-8">
        <Card>
          <CardContent>
            {document.isError && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                Failed to load this note.
              </p>
            )}
            {notEditable && (
              <p className="text-sm text-muted-foreground">
                Only notes can be edited — uploaded files are read-only.
              </p>
            )}
            {!document.isError && !notEditable &&
              (!ready ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <NoteEditor
                  initialTitle={document.data!.title}
                  initialContent={content.data?.textContent ?? ""}
                  submitLabel="Save changes"
                  saving={save.isPending}
                  error={error}
                  onSave={(title, body) => {
                    setError(null);
                    save.mutate({ title, content: body });
                  }}
                  onCancel={() => router.push(`/documents/${documentId}`)}
                />
              ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
