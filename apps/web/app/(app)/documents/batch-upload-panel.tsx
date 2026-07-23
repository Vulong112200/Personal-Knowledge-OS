"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FileUploadState } from "./use-batch-upload";

export function BatchUploadPanel({
  items,
  total,
  succeeded,
  failed,
  inFlight,
}: {
  items: FileUploadState[];
  total: number;
  succeeded: number;
  failed: number;
  inFlight: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (total === 0) return null;

  const done = succeeded + failed;
  const failedItems = items.filter((it) => it.status === "error");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          {inFlight ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : failed > 0 ? (
            <XCircle className="size-4 text-danger" />
          ) : (
            <CheckCircle2 className="size-4 text-success" />
          )}
          <span>
            {inFlight ? "Uploading" : "Done"} {done}/{total}
            {failed > 0 && <span className="text-danger"> — {failed} failed</span>}
          </span>
        </div>
        {failedItems.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Hide" : "View"} failed
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        )}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-muted">
        <div
          className={cn("h-full rounded-full transition-all", failed > 0 ? "bg-danger" : "bg-primary")}
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </div>

      {expanded && (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
          {failedItems.map((it) => (
            <li key={it.key} className="flex flex-col gap-0.5 rounded-lg bg-background-muted px-2 py-1.5">
              <span className="truncate font-medium text-foreground">{it.name}</span>
              <span className="text-danger">{it.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
