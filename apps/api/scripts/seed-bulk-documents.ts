/**
 * Seeds a PERSISTENT test account with ~300 synthetic documents spanning many file types
 * (pdf, docx, xlsx, csv, html, json, source code, md, txt) and content categories — so the
 * ingestion pipeline (extract → chunk → autotag → relate → embed), search, chat RAG, and
 * the graph can be exercised at realistic scale and variety.
 *
 * This account is intentionally NOT deleted by this script and should be KEPT for testing
 * future improvements. Re-running is safe: the user is reused if it already exists (more
 * documents are just added). To wipe it later, log in and use Settings → Delete account.
 *
 * Prerequisites:
 *   - The API server must be running and reachable at API_BASE_URL (default localhost:3001).
 *   - apps/api/.env must have SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-loaded below).
 *
 * Usage (from repo root):
 *   pnpm --filter @pkos/api exec ts-node scripts/seed-bulk-documents.ts
 *
 * Env (optional, defaults shown):
 *   SEED_USER_EMAIL=pkos-test@example.com
 *   SEED_USER_PASSWORD=PkosTest!2026
 *   SEED_DOC_COUNT=300
 *   SEED_CONCURRENCY=6
 *   API_BASE_URL=http://localhost:3001
 */
import 'dotenv/config';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';

const SEED_USER_EMAIL = process.env.SEED_USER_EMAIL ?? 'pkos-test@example.com';
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'PkosTest!2026';
const SEED_DOC_COUNT = Number(process.env.SEED_DOC_COUNT ?? 300);
const SEED_CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 6);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see apps/api/.env).');
  process.exit(1);
}

// Each category has a filename slug, a few strong keywords (so autotag has something to
// latch onto), and sentence fragments. A few categories are in Vietnamese to exercise the
// unaccent full-text config and VI bigram tagging.
interface Category {
  slug: string;
  keywords: string[];
  sentences: string[];
}

const CATEGORIES: Category[] = [
  {
    slug: 'finance',
    keywords: ['budget', 'revenue', 'forecast', 'expenses', 'cashflow'],
    sentences: [
      'The quarterly budget forecast shows revenue growth outpacing expenses.',
      'Cashflow projections were revised after the latest revenue report.',
      'Operating expenses must stay within the approved budget envelope.',
    ],
  },
  {
    slug: 'engineering',
    keywords: ['architecture', 'deployment', 'migration', 'latency', 'refactor'],
    sentences: [
      'The service architecture was refactored to reduce request latency.',
      'A staged deployment plan de-risks the database migration.',
      'Latency dropped after moving the migration off the hot path.',
    ],
  },
  {
    slug: 'hr',
    keywords: ['onboarding', 'hiring', 'retention', 'performance', 'culture'],
    sentences: [
      'The onboarding checklist improves new-hire retention in the first quarter.',
      'Hiring managers reviewed performance and culture feedback this cycle.',
      'Retention rose after the onboarding and performance program launched.',
    ],
  },
  {
    slug: 'science',
    keywords: ['experiment', 'hypothesis', 'dataset', 'analysis', 'results'],
    sentences: [
      'The experiment tested the hypothesis against a held-out dataset.',
      'Analysis of the results confirmed the hypothesis with high confidence.',
      'The dataset was cleaned before the statistical analysis of results.',
    ],
  },
  {
    slug: 'legal',
    keywords: ['contract', 'compliance', 'clause', 'liability', 'agreement'],
    sentences: [
      'The contract clause limits liability under the service agreement.',
      'Compliance review flagged an indemnity clause in the agreement.',
      'Both parties signed the agreement after the liability clause changed.',
    ],
  },
  {
    slug: 'marketing',
    keywords: ['campaign', 'audience', 'conversion', 'branding', 'engagement'],
    sentences: [
      'The campaign targeted a younger audience to lift conversion.',
      'Branding and engagement metrics improved across the campaign.',
      'Conversion rose when the campaign audience was segmented.',
    ],
  },
  {
    slug: 'nau-an',
    keywords: ['pho', 'nguyen lieu', 'nuoc dung', 'gia vi', 'cong thuc'],
    sentences: [
      'Công thức phở bò cần nước dùng ninh xương và gia vị đầy đủ.',
      'Nguyên liệu chính gồm bánh phở, thịt bò và nước dùng trong.',
      'Gia vị nêm nước dùng quyết định hương vị của tô phở.',
    ],
  },
  {
    slug: 'tai-chinh',
    keywords: ['ngan sach', 'doanh thu', 'chi phi', 'loi nhuan', 'dau tu'],
    sentences: [
      'Báo cáo ngân sách cho thấy doanh thu tăng nhanh hơn chi phí.',
      'Lợi nhuận quý này cải thiện nhờ kiểm soát chi phí đầu tư.',
      'Kế hoạch đầu tư dựa trên dự báo doanh thu và ngân sách.',
    ],
  },
  {
    slug: 'suc-khoe',
    keywords: ['dinh duong', 'the duc', 'giac ngu', 'suc khoe', 'thoi quen'],
    sentences: [
      'Thói quen dinh dưỡng và thể dục đều đặn cải thiện sức khỏe.',
      'Giấc ngủ đủ giúp phục hồi sức khỏe và tăng hiệu suất.',
      'Chế độ dinh dưỡng cân bằng hỗ trợ thói quen thể dục.',
    ],
  },
  {
    slug: 'travel',
    keywords: ['itinerary', 'destination', 'booking', 'flight', 'accommodation'],
    sentences: [
      'The itinerary covers three destinations with flight and accommodation booking.',
      'Booking the flight early lowered the accommodation cost per destination.',
      'The destination guide lists accommodation near each itinerary stop.',
    ],
  },
];

// File type → how many-ish of each we get. Round-robin over this list guarantees spread.
const FILE_TYPES = [
  'txt', 'md', 'csv', 'json', 'html', 'py', 'js', 'ts', 'sql', 'xlsx', 'pdf', 'docx',
] as const;
type FileType = (typeof FILE_TYPES)[number];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function bodyText(cat: Category): string {
  const keywordLine = cat.keywords.join(', ');
  const paras = Array.from({ length: 4 }, () => pick(cat.sentences));
  return `Topic keywords: ${keywordLine}.\n\n${paras.join(' ')}\n\n${paras.join(' ')}`;
}

function csvContent(cat: Category): string {
  const header = 'id,category,keyword,value,note';
  const rows = cat.keywords.map(
    (kw, i) => `${i + 1},${cat.slug},${kw},${100 + i * 7},${pick(cat.sentences).replace(/,/g, ';')}`,
  );
  return [header, ...rows].join('\n');
}

function jsonContent(cat: Category, title: string): string {
  return JSON.stringify(
    { title, category: cat.slug, keywords: cat.keywords, notes: cat.sentences, generatedBy: 'pkos-seed' },
    null,
    2,
  );
}

function htmlContent(cat: Category, title: string): string {
  const items = cat.keywords.map((k) => `    <li>${k}</li>`).join('\n');
  const paras = cat.sentences.map((s) => `  <p>${s}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <h2>Category: ${cat.slug}</h2>
  <ul>
${items}
  </ul>
${paras}
</body>
</html>`;
}

function codeContent(cat: Category, type: FileType, title: string): string {
  const kw = cat.keywords[0].replace(/[^a-z0-9]/gi, '_');
  const note = pick(cat.sentences);
  switch (type) {
    case 'py':
      return `# ${title}\n# Category: ${cat.slug}\n# Keywords: ${cat.keywords.join(', ')}\n\ndef ${kw}_report():\n    """${note}"""\n    keywords = ${JSON.stringify(cat.keywords)}\n    return {"category": "${cat.slug}", "keywords": keywords}\n\n\nif __name__ == "__main__":\n    print(${kw}_report())\n`;
    case 'sql':
      return `-- ${title}\n-- Category: ${cat.slug} | Keywords: ${cat.keywords.join(', ')}\n-- ${note}\nSELECT category, keyword, value\nFROM ${cat.slug}_metrics\nWHERE category = '${cat.slug}'\nORDER BY value DESC;\n`;
    case 'ts':
      return `// ${title}\n// Category: ${cat.slug}\n// ${note}\nexport interface ${cap(cat.slug)}Record {\n  category: string;\n  keywords: string[];\n}\n\nexport const ${kw}: ${cap(cat.slug)}Record = {\n  category: "${cat.slug}",\n  keywords: ${JSON.stringify(cat.keywords)},\n};\n`;
    default: // js
      return `// ${title}\n// Category: ${cat.slug}\n// ${note}\nconst ${kw} = {\n  category: "${cat.slug}",\n  keywords: ${JSON.stringify(cat.keywords)},\n};\nmodule.exports = ${kw};\n`;
  }
}

function cap(s: string): string {
  return s.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

async function pdfBuffer(cat: Category, title: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const lines = wrap(`${title}\n\nCategory: ${cat.slug}\nKeywords: ${cat.keywords.join(', ')}\n\n${bodyText(cat)}`, 90);
  let y = height - 50;
  for (const line of lines) {
    if (y < 50) break;
    page.drawText(line, { x: 50, y, size: 11, font, maxWidth: width - 100 });
    y -= 16;
  }
  return Buffer.from(await doc.save());
}

function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= cols) {
      out.push(raw);
      continue;
    }
    let line = '';
    for (const word of raw.split(' ')) {
      if ((line + word).length > cols) {
        out.push(line.trimEnd());
        line = '';
      }
      line += word + ' ';
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
}

async function docxBuffer(cat: Category, title: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: `Category: ${cat.slug}` }),
          new Paragraph({ children: [new TextRun({ text: `Keywords: ${cat.keywords.join(', ')}`, bold: true })] }),
          ...cat.sentences.map((s) => new Paragraph({ text: s })),
          ...cat.sentences.map((s) => new Paragraph({ text: s })),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

async function xlsxBuffer(cat: Category, title: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(cat.slug);
  sheet.addRow(['id', 'category', 'keyword', 'value', 'note']);
  cat.keywords.forEach((kw, i) => sheet.addRow([i + 1, cat.slug, kw, 100 + i * 7, pick(cat.sentences)]));
  sheet.addRow([]);
  sheet.addRow(['title', title]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

interface GeneratedFile {
  filename: string;
  body: Buffer;
  mime: string;
}

async function buildFile(index: number): Promise<GeneratedFile> {
  const type = FILE_TYPES[index % FILE_TYPES.length];
  const cat = CATEGORIES[index % CATEGORIES.length];
  const stem = `${cat.slug}-${String(index).padStart(4, '0')}`;
  const title = `${cap(cat.slug)} note ${index}`;

  const textFile = (ext: string, content: string, mime: string): GeneratedFile => ({
    filename: `${stem}.${ext}`,
    body: Buffer.from(content, 'utf-8'),
    mime,
  });

  switch (type) {
    case 'txt':
      return textFile('txt', bodyText(cat), 'text/plain');
    case 'md':
      return textFile('md', `# ${title}\n\n${bodyText(cat)}`, 'text/markdown');
    case 'csv':
      return textFile('csv', csvContent(cat), 'text/csv');
    case 'json':
      return textFile('json', jsonContent(cat, title), 'application/json');
    case 'html':
      return textFile('html', htmlContent(cat, title), 'text/html');
    case 'py':
      return textFile('py', codeContent(cat, 'py', title), 'text/x-python');
    case 'js':
      return textFile('js', codeContent(cat, 'js', title), 'text/javascript');
    case 'ts':
      return textFile('ts', codeContent(cat, 'ts', title), 'text/typescript');
    case 'sql':
      return textFile('sql', codeContent(cat, 'sql', title), 'application/sql');
    case 'xlsx':
      return {
        filename: `${stem}.xlsx`,
        body: await xlsxBuffer(cat, title),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    case 'pdf':
      return { filename: `${stem}.pdf`, body: await pdfBuffer(cat, title), mime: 'application/pdf' };
    case 'docx':
      return {
        filename: `${stem}.docx`,
        body: await docxBuffer(cat, title),
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
  }
}

async function ensureTestUser(): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD, email_confirm: true }),
  });
  if (res.ok) {
    console.log(`Created persistent test user ${SEED_USER_EMAIL}`);
    return;
  }
  const body = await res.text();
  if (res.status === 422 || body.includes('already been registered')) {
    console.log(`Test user ${SEED_USER_EMAIL} already exists — reusing it (not deleting).`);
    return;
  }
  throw new Error(`Failed to create test user: ${res.status} ${body}`);
}

async function signIn(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY },
    body: JSON.stringify({ email: SEED_USER_EMAIL, password: SEED_USER_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

async function uploadDocument(token: string, index: number): Promise<void> {
  const file = await buildFile(index);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(file.body)], { type: file.mime }), file.filename);

  const res = await fetch(`${API_BASE_URL}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed for ${file.filename}: ${res.status} ${await res.text()}`);
}

async function runPool(total: number, concurrency: number, task: (index: number) => Promise<void>) {
  let next = 0;
  let succeeded = 0;
  let failed = 0;

  async function worker() {
    while (next < total) {
      const index = next++;
      try {
        await task(index);
        succeeded++;
      } catch (err) {
        failed++;
        console.error((err as Error).message);
      }
      if ((succeeded + failed) % 25 === 0) {
        console.log(`Progress: ${succeeded + failed}/${total} (${failed} failed)`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { succeeded, failed };
}

async function main() {
  await ensureTestUser();
  const token = await signIn();
  console.log(`Signed in as ${SEED_USER_EMAIL}. Uploading ${SEED_DOC_COUNT} documents across ${FILE_TYPES.length} file types...`);

  const { succeeded, failed } = await runPool(SEED_DOC_COUNT, SEED_CONCURRENCY, (i) => uploadDocument(token, i));

  console.log('\n──────────────────────────────────────────────');
  console.log(`Done. ${succeeded} uploaded, ${failed} failed.`);
  console.log(`Persistent test account (KEEP THIS — do not delete):`);
  console.log(`  email:    ${SEED_USER_EMAIL}`);
  console.log(`  password: ${SEED_USER_PASSWORD}`);
  console.log('Log in to inspect /documents, /search, /tags, /graph, and /chat.');
  console.log('The pipeline processes documents asynchronously — watch the status badges settle.');
  console.log('──────────────────────────────────────────────');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
