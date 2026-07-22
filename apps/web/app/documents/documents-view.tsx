"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface DocumentDto {
  id: string;
  title: string;
  status: "uploaded" | "processing" | "processed" | "failed" | "needs_ocr";
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
}

const STATUS_STYLES: Record<DocumentDto["status"], string> = {
  uploaded: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  processing: "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  processed: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  failed: "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200",
  needs_ocr: "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

export function DocumentsView() {
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery<DocumentDto[]>({
    queryKey: ["documents"],
    queryFn: () => apiFetch("/documents"),
    refetchInterval: 5000,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiFetch("/documents", { method: "POST", body: formData });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
  });

  const onDrop = useCallback(
    (files: File[]) => files.forEach((file) => upload.mutate(file)),
    [upload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/markdown": [".md"],
      "text/plain": [".txt"],
    },
  });

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center text-sm transition-colors ${
          isDragActive
            ? "border-black bg-black/[.03] dark:border-white dark:bg-white/[.05]"
            : "border-black/[.15] dark:border-white/[.2]"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-zinc-600 dark:text-zinc-400">
          Drag & drop a PDF, DOCX, MD, or TXT file here, or click to select one
        </p>
      </div>

      {upload.isError && (
        <p className="text-sm text-red-600">{(upload.error as Error).message}</p>
      )}

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-sm text-zinc-500">Loading...</p>}
        {documents?.length === 0 && (
          <p className="text-sm text-zinc-500">No documents yet.</p>
        )}
        {documents?.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
          >
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="truncate text-sm font-medium text-black dark:text-zinc-50">
                {doc.title}
              </span>
              <span className="text-xs text-zinc-500">
                {Number(doc.sizeBytes).toLocaleString()} bytes
              </span>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[doc.status]}`}
            >
              {doc.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
