import { Clock, Loader2, CheckCircle2, XCircle, ScanText, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", className)}
      {...props}
    />
  );
}

export type DocumentStatus = "uploaded" | "processing" | "processed" | "failed" | "needs_ocr";

const STATUS_META: Record<DocumentStatus, { label: string; className: string; icon: LucideIcon }> = {
  uploaded: { label: "Uploaded", className: "bg-background-muted text-muted-foreground", icon: Clock },
  processing: {
    label: "Processing",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    icon: Loader2,
  },
  processed: {
    label: "Processed",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    icon: XCircle,
  },
  needs_ocr: {
    label: "Needs OCR",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    icon: ScanText,
  },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge className={meta.className}>
      <Icon className={cn("size-3", status === "processing" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
