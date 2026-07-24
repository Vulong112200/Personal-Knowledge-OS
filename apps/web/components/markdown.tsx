"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

// Tailwind v4 here has no typography plugin, so style rendered markdown with arbitrary
// child-variant utilities. Shared by chat bubbles and the note reader/preview.
const MARKDOWN_CLASS =
  "text-sm leading-relaxed break-words " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 " +
  "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_h1]:mt-2 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold " +
  "[&_a]:underline [&_a]:underline-offset-2 " +
  "[&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] dark:[&_code]:bg-white/10 " +
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/10 [&_pre]:p-2 dark:[&_pre]:bg-white/10 [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-current/30 [&_blockquote]:pl-3 [&_blockquote]:opacity-90 " +
  "[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-current/20 [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-current/20 [&_td]:px-2 [&_td]:py-1 " +
  "[&_hr]:my-3 [&_hr]:border-current/15";

// Render markdown safely: react-markdown ignores raw HTML by default (no rehype-raw), so
// model- or user-authored content can't inject markup.
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn(MARKDOWN_CLASS, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
