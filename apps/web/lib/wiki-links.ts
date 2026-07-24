// Turn [[Title]] / [[Title|alias]] wiki-links in note Markdown into clickable links. The client
// can't resolve a title to a document id without a lookup, so links point at a title search —
// which lands on the target when it exists. The backend separately materializes real
// document→document graph edges from the same syntax (see GraphService.relateByLinks).
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function linkifyWikiLinks(markdown: string): string {
  return markdown.replace(WIKI_LINK_RE, (_match, target: string, alias?: string) => {
    const label = (alias ?? target).trim();
    const query = encodeURIComponent(target.trim());
    return `[${label}](/search?q=${query})`;
  });
}
