"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FolderOpen, Trash2, X as XIcon } from "lucide-react";
import { ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES } from "@pkos/contracts";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type DocumentStatus } from "@/components/ui/badge";
import { useBatchUpload } from "./use-batch-upload";
import { BatchUploadPanel } from "./batch-upload-panel";

interface DocumentDto {
  id: string;
  title: string;
  status: DocumentStatus;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

interface SkippedFile {
  name: string;
  reason: "unsupported-type" | "too-large";
}

interface PendingSelection {
  accepted: File[];
  skipped: SkippedFile[];
}

function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function partitionFiles(files: File[]): PendingSelection {
  const accepted: File[] = [];
  const skipped: SkippedFile[] = [];

  for (const file of files) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext as (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number])) {
      skipped.push({ name: relativePath(file), reason: "unsupported-type" });
      continue;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      skipped.push({ name: relativePath(file), reason: "too-large" });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, skipped };
}

export function DocumentsView() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const tag = searchParams.get("tag");
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const {
    data: documents,
    isLoading,
    isError,
  } = useQuery<DocumentDto[]>({
    queryKey: ["documents", tag ?? null],
    queryFn: () => apiFetch(tag ? `/documents?tag=${encodeURIComponent(tag)}` : "/documents"),
    // Only poll while something is still being processed; stop once everything settles.
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === "uploaded" || d.status === "processing") ? 5000 : false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  function handleDelete(id: string) {
    if (window.confirm("Delete this document permanently? This cannot be undone.")) {
      remove.mutate(id);
    }
  }

  const batch = useBatchUpload(() => queryClient.invalidateQueries({ queryKey: ["documents"] }));

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setPending(partitionFiles(files));
  }, []);

  const onDrop = useCallback((files: File[]) => handleFilesSelected(files), [handleFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/markdown": [".md"],
      "text/plain": [".txt"],
    },
  });

  function confirmUpload() {
    if (!pending) return;
    batch.start(pending.accepted);
    setPending(null);
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all",
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-background-muted",
        )}
      >
        <input {...getInputProps()} />
        <UploadCloud className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag &amp; drop a PDF, DOCX, MD, or TXT file here, or click to select one
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          handleFilesSelected(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <Button variant="outline" onClick={() => folderInputRef.current?.click()} className="w-full">
        <FolderOpen className="size-4" />
        Select a folder or drive to bulk-upload
      </Button>

      {pending && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-sm text-foreground">
            <strong>{pending.accepted.length}</strong> file{pending.accepted.length === 1 ? "" : "s"} will be
            uploaded
            {pending.skipped.length > 0 && (
              <>
                , <strong>{pending.skipped.length}</strong> skipped (unsupported type or too large)
              </>
            )}
            .
          </p>
          {pending.skipped.length > 0 && (
            <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
              {pending.skipped.slice(0, 20).map((s) => (
                <li key={s.name} className="truncate">
                  {s.name} — {s.reason === "unsupported-type" ? "unsupported type" : "too large"}
                </li>
              ))}
              {pending.skipped.length > 20 && <li>...and {pending.skipped.length - 20} more</li>}
            </ul>
          )}
          <div className="flex gap-2">
            <Button onClick={confirmUpload} disabled={pending.accepted.length === 0}>
              Start upload
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <BatchUploadPanel
        items={batch.items}
        total={batch.total}
        succeeded={batch.succeeded}
        failed={batch.failed}
        inFlight={batch.inFlight}
      />

      {tag && (
        <div className="flex items-center justify-between rounded-md bg-background-muted px-3 py-2 text-xs text-muted-foreground">
          <span>Filtered by tag.</span>
          <Link href="/documents" className="inline-flex items-center gap-1 text-primary hover:underline">
            <XIcon className="size-3" />
            Clear filter
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {isError && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            Failed to load documents. Please refresh or check that the API is running.
          </p>
        )}
        {documents?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {tag ? "No documents with this tag." : "No documents yet."}
          </p>
        )}
        {documents?.map((doc) => (
          <Card key={doc.id} className="flex items-center justify-between gap-4 p-4">
            <Link
              href={`/documents/${doc.id}`}
              className="flex flex-1 flex-col gap-1 overflow-hidden transition-transform hover:translate-x-0.5"
            >
              <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(Number(doc.sizeBytes))}</span>
            </Link>
            <div className="flex items-center gap-2">
              <StatusBadge status={doc.status} />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete document"
                disabled={remove.isPending}
                onClick={() => handleDelete(doc.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
