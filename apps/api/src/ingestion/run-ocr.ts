import { PDFParse } from 'pdf-parse';

// Languages passed to Tesseract. Vietnamese + English by default; the traineddata is
// fetched on first use. Override with OCR_LANGS (e.g. "eng", "eng+vie+fra").
const OCR_LANGS = process.env.OCR_LANGS || 'eng+vie';

/**
 * OCR a scanned PDF: pull the embedded page images out of the PDF (a scanned page is
 * typically one full-page image) and run Tesseract over each. tesseract.js is ESM/heavy,
 * so it's imported lazily — only loaded when a document actually needs OCR, never at boot.
 * Returns the recognized text, or '' if there was nothing to OCR.
 */
export async function runOcrOnPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const imageUrls: string[] = [];
  try {
    const result = await parser.getImage();
    for (const page of result.pages) {
      for (const image of page.images) {
        if (image.dataUrl) imageUrls.push(image.dataUrl);
      }
    }
  } finally {
    await parser.destroy();
  }

  if (imageUrls.length === 0) return '';

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(OCR_LANGS.split('+'));
  try {
    const parts: string[] = [];
    for (const dataUrl of imageUrls) {
      const { data } = await worker.recognize(dataUrl);
      const text = data.text.trim();
      if (text) parts.push(text);
    }
    return parts.join('\n\n').trim();
  } finally {
    await worker.terminate();
  }
}
