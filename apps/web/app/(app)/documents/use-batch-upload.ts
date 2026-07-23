"use client";

import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const CONCURRENCY = 4;

export type FileUploadStatus = "pending" | "uploading" | "success" | "error";

export interface FileUploadState {
  key: string;
  name: string;
  status: FileUploadStatus;
  error?: string;
}

function relativePath(file: File): string {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function fileKey(file: File): string {
  return `${relativePath(file)}:${file.size}`;
}

export function useBatchUpload(onFileSettled?: () => void) {
  const [items, setItems] = useState<FileUploadState[]>([]);
  const runningRef = useRef(false);

  const start = useCallback(
    async (files: File[]) => {
      if (runningRef.current || files.length === 0) return;
      runningRef.current = true;

      setItems(files.map((file) => ({ key: fileKey(file), name: relativePath(file), status: "pending" })));

      const queue = [...files];
      async function worker() {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const key = fileKey(file);
          setItems((prev) => prev.map((it) => (it.key === key ? { ...it, status: "uploading" } : it)));

          try {
            const formData = new FormData();
            formData.append("file", file);
            await apiFetch("/documents", { method: "POST", body: formData });
            setItems((prev) => prev.map((it) => (it.key === key ? { ...it, status: "success" } : it)));
          } catch (err) {
            setItems((prev) =>
              prev.map((it) =>
                it.key === key ? { ...it, status: "error", error: (err as Error).message } : it,
              ),
            );
          }
          onFileSettled?.();
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
      runningRef.current = false;
    },
    [onFileSettled],
  );

  const total = items.length;
  const succeeded = items.filter((it) => it.status === "success").length;
  const failed = items.filter((it) => it.status === "error").length;
  const inFlight = items.some((it) => it.status === "pending" || it.status === "uploading");

  return { items, start, total, succeeded, failed, inFlight, reset: () => setItems([]) };
}
