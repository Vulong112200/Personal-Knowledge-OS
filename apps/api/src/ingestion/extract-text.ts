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
        return { text, needsOcr: text.length === 0 };
      } finally {
        await parser.destroy();
      }
    }
    case '.docx': {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value.trim(), needsOcr: false };
    }
    case '.md':
    case '.txt':
      return { text: buffer.toString('utf-8').trim(), needsOcr: false };
    default:
      throw new Error(`Unsupported extension for extraction: ${extension}`);
  }
}
