// Heuristic keyword extraction (not full NLP). Strips common English/Vietnamese function
// words plus document-scaffolding words, then ranks candidate unigrams by frequency AND
// repeated adjacent bigrams (phrases), boosting phrases so multi-syllable Vietnamese concepts
// like "kinh tế" survive as a single tag instead of splitting into "kinh" / "tế". Candidates
// are counted by a diacritics-folded key so accent variants ("chi phí" / "chi phi") collapse to
// one term (the dominant surface spelling is kept for display). A true solution needs Vietnamese
// word segmentation (e.g. a tokenizer library) or LLM extraction — see Phase 5.
const STOP_WORDS = [
  // English function words
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is',
  'are', 'was', 'were', 'be', 'been', 'this', 'that', 'it', 'as', 'by', 'from', 'into', 'not',
  'no', 'so', 'if', 'then', 'than', 'which', 'who', 'whom', 'what', 'when', 'where', 'how',
  'why', 'all', 'can', 'will', 'you', 'your', 'their', 'its', 'has', 'have', 'had',
  // English document-scaffolding words (headings, captions, cross-references)
  'table', 'figure', 'fig', 'page', 'section', 'chapter', 'appendix', 'note', 'notes',
  'ref', 'refs', 'reference', 'references', 'introduction', 'conclusion', 'summary',
  'contents', 'index', 'abstract', 'overview',
  // Vietnamese function words
  'là', 'và', 'của', 'các', 'một', 'những', 'trong', 'cho', 'có', 'được', 'này', 'đó', 'khi',
  'để', 'với', 'như', 'đã', 'sẽ', 'không', 'cũng', 'vì', 'nên', 'mà', 'ở', 'trên', 'dưới',
  'ra', 'vào', 'đến', 'từ', 'về', 'theo', 'nếu', 'nhưng', 'vẫn', 'rất', 'nhiều',
  // Vietnamese document-scaffolding words
  'chương', 'mục', 'bảng', 'hình', 'trang', 'phần', 'biểu', 'đồ', 'chú', 'thích', 'xem',
];

const PHRASE_BOOST = 2.5; // a repeated 2-word phrase is worth 2.5× its frequency vs. a unigram
const MIN_PHRASE_FREQ = 2; // only treat a bigram as a phrase if it recurs (cuts noise)

/** Fold to a diacritics-insensitive key matching Postgres `f_unaccent` (Unicode decomposition
 * + the Vietnamese đ→d that NFD leaves intact). Input is expected already lowercased. */
export function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
}

// Match stop words on their folded form so both "phần" and "phan" (and accent-stripped OCR
// output) are filtered.
const STOP_WORDS_FOLDED = new Set(STOP_WORDS.map((w) => foldDiacritics(w)));

function isCandidate(token: string): boolean {
  return token.length > 2 && !STOP_WORDS_FOLDED.has(foldDiacritics(token)) && !/^\p{N}+$/u.test(token);
}

function bump(map: Map<string, Map<string, number>>, key: string, surface: string): void {
  let inner = map.get(key);
  if (!inner) map.set(key, (inner = new Map()));
  inner.set(surface, (inner.get(surface) ?? 0) + 1);
}

function dominantSurface(map: Map<string, Map<string, number>>, key: string, fallback: string): string {
  const inner = map.get(key);
  if (!inner) return fallback;
  return [...inner.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function extractKeywords(text: string, topN = 5): string[] {
  // Keep the full token stream (including stop words / numbers) so bigram adjacency reflects
  // the real text — a stop word or number between two candidates correctly breaks the phrase.
  const tokens = text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Count by folded key; remember every surface spelling so we can display the dominant one.
  const uniFreq = new Map<string, number>();
  const uniSurface = new Map<string, Map<string, number>>();
  for (const token of tokens) {
    if (!isCandidate(token)) continue;
    const key = foldDiacritics(token);
    uniFreq.set(key, (uniFreq.get(key) ?? 0) + 1);
    bump(uniSurface, key, token);
  }

  const biFreq = new Map<string, number>();
  const biSurface = new Map<string, Map<string, number>>();
  for (let i = 0; i < tokens.length - 1; i++) {
    if (isCandidate(tokens[i]) && isCandidate(tokens[i + 1])) {
      const key = `${foldDiacritics(tokens[i])} ${foldDiacritics(tokens[i + 1])}`;
      biFreq.set(key, (biFreq.get(key) ?? 0) + 1);
      bump(biSurface, key, `${tokens[i]} ${tokens[i + 1]}`);
    }
  }

  const scores = new Map<string, number>();
  for (const [key, freq] of uniFreq) scores.set(key, freq);
  for (const [key, freq] of biFreq) {
    if (freq >= MIN_PHRASE_FREQ) scores.set(key, freq * PHRASE_BOOST);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([term]) => term);

  // Take the top terms, suppressing a unigram once it's already covered by a higher-ranked
  // phrase (avoids returning both "kinh tế" and "kinh"). Coverage is tracked on folded keys.
  const selected: string[] = [];
  const covered = new Set<string>();
  for (const term of ranked) {
    if (selected.length >= topN) break;
    const parts = term.split(' ');
    if (parts.length === 1 && covered.has(term)) continue;
    const display =
      parts.length === 1 ? dominantSurface(uniSurface, term, term) : dominantSurface(biSurface, term, term);
    selected.push(display);
    for (const part of parts) covered.add(part);
  }

  return selected;
}
