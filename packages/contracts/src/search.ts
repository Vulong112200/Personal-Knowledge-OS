// Matches the StartSel/StopSel control characters used by ts_headline() in
// postgres-search.adapter.ts — kept here so the API and web app agree on the format
// without the frontend needing to render raw HTML from user-uploaded content.
export const SNIPPET_HIGHLIGHT_START = "\x01";
export const SNIPPET_HIGHLIGHT_END = "\x02";
