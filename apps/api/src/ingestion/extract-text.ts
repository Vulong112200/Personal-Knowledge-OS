import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

export interface ExtractResult {
  text: string;
  needsOcr: boolean;
}

export async function extractText(buffer: Buffer, extension: string): Promise<ExtractResult> {
  switch (extension) {
    case '.pdf': {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        const text = result.text.trim();
        // Only PDFs can be a scanned/image-only "no text layer" case → OCR fallback.
        return { text, needsOcr: text.length === 0 };
      } finally {
        await parser.destroy();
      }
    }
    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value.trim(), needsOcr: false };
    }
    case '.xlsx':
      return { text: await extractXlsx(buffer), needsOcr: false };
    case '.html':
    case '.htm':
      return { text: stripHtml(buffer.toString('utf-8')), needsOcr: false };
    default:
      // Everything else allowed (.md/.txt/.csv/.json/.xml/.yaml and source code) is plain
      // UTF-8 text. Upload validation (ALLOWED_DOCUMENT_EXTENSIONS) has already gated the
      // extension, so anything reaching here is safe to read as text.
      return { text: buffer.toString('utf-8').trim(), needsOcr: false };
  }
}

/** Flatten an .xlsx workbook to text: every sheet, row by row, cells tab-joined — enough
 * for full-text indexing and RAG without trying to preserve layout. */
async function extractXlsx(buffer: Buffer): Promise<string> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`# ${sheet.name}`);
    sheet.eachRow((row) => {
      const values = (row.values as unknown[]).slice(1).map((v) => cellToText(v));
      lines.push(values.join('\t'));
    });
  });
  return lines.join('\n').trim();
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const obj = value as { text?: string; result?: unknown; hyperlink?: string };
    if (typeof obj.text === 'string') return obj.text;
    if (obj.result != null) return String(obj.result);
    if (obj.hyperlink) return obj.hyperlink;
    return '';
  }
  return String(value);
}

/** Strip HTML down to readable text for indexing: drop script/style, remove tags, decode a
 * few common entities, collapse whitespace. Not a full parser — good enough for FTS/RAG. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
