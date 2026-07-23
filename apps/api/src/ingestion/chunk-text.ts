import { countTokens, encode, decode } from 'gpt-tokenizer';

const TARGET_TOKENS = 650;
const MAX_PARAGRAPH_TOKENS = 800;

export interface TextChunk {
  content: string;
  tokenCount: number;
}

export function chunkText(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let buffer = '';
  let bufferTokens = 0;

  for (const paragraph of splitIntoParagraphs(text)) {
    for (const piece of splitIfTooLong(paragraph)) {
      const pieceTokens = countTokens(piece);

      if (buffer && bufferTokens + pieceTokens > TARGET_TOKENS) {
        chunks.push({ content: buffer, tokenCount: bufferTokens });
        buffer = '';
        bufferTokens = 0;
      }

      buffer = buffer ? `${buffer}\n\n${piece}` : piece;
      bufferTokens += pieceTokens;
    }
  }

  if (buffer) chunks.push({ content: buffer, tokenCount: bufferTokens });

  return chunks;
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitIfTooLong(paragraph: string): string[] {
  if (countTokens(paragraph) <= MAX_PARAGRAPH_TOKENS) return [paragraph];

  // Paragraph alone exceeds the target — fall back to sentence-level splitting.
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pieces = sentences.length > 1 ? sentences : [paragraph];

  // Hard ceiling: a single sentence (or a block with no sentence boundaries — common in
  // Vietnamese/CJK text or minified/one-line content) can still exceed the limit. Split it
  // on token boundaries so no chunk is ever unbounded, protecting the RAG/AI context budget.
  return pieces.flatMap((piece) =>
    countTokens(piece) > MAX_PARAGRAPH_TOKENS ? hardSplitByTokens(piece) : [piece],
  );
}

function hardSplitByTokens(text: string): string[] {
  const tokens = encode(text);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += TARGET_TOKENS) {
    out.push(decode(tokens.slice(i, i + TARGET_TOKENS)));
  }
  return out;
}
