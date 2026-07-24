"use client";

import { useState } from "react";
import { Eye, Pencil } from "lucide-react";
import { NOTE_TITLE_MAX } from "@pkos/contracts";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";

// Split Markdown editor: title + textarea with a live preview. Reused by the create and edit
// flows. Dependency-light (textarea, not a WYSIWYG) — preview reuses the shared <Markdown/>.
export function NoteEditor({
  initialTitle = "",
  initialContent = "",
  submitLabel,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initialTitle?: string;
  initialContent?: string;
  submitLabel: string;
  saving: boolean;
  error?: string | null;
  onSave: (title: string, content: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [showPreview, setShowPreview] = useState(false);
  const canSave = title.trim().length > 0 && !saving;

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="text"
        placeholder="Note title"
        value={title}
        maxLength={NOTE_TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Note title"
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
            !showPreview ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Pencil className="size-3" /> Write
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
            showPreview ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="size-3" /> Preview
        </button>
        <span className="ml-auto text-xs text-muted-foreground">Markdown supported</span>
      </div>

      {showPreview ? (
        <div className="min-h-64 rounded-xl border border-border bg-card p-4">
          {content.trim() ? (
            <Markdown>{content}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your note in Markdown. Link other documents with [[Their Title]]."
          className="min-h-64 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          aria-label="Note content"
        />
      )}

      {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={() => onSave(title.trim(), content)} disabled={!canSave}>
          {saving ? "Saving..." : submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
