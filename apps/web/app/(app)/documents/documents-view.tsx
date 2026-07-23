"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadCloud, FolderOpen } from "lucide-react";
import { ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_SIZE_BYTES } from "@pkos/contracts";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
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
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const { data: documents, isLoading } = useQuery<DocumentDto[]>({
    queryKey: ["documents"],
    queryFn: () => apiFetch("/documents"),
    refetchInterval: 5000,
  });

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

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {documents?.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        {documents?.map((doc) => (
          <Link key={doc.id} href={`/documents/${doc.id}`}>
            <Card className="flex items-center justify-between gap-4 p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow">
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="truncate text-sm font-medium text-foreground">{doc.title}</span>
                <span className="text-xs text-muted-foreground">
                  {Number(doc.sizeBytes).toLocaleString()} bytes
                </span>
              </div>
              <StatusBadge status={doc.status} />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
