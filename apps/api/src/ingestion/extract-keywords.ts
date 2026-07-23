// Heuristic keyword extraction (not full NLP). Strips common English/Vietnamese function
// words, then ranks candidate unigrams by frequency AND repeated adjacent bigrams (phrases),
// boosting phrases so multi-syllable Vietnamese concepts like "kinh tế" survive as a single
// tag instead of splitting into "kinh" / "tế". A true solution needs Vietnamese word
// segmentation (e.g. a tokenizer library) or LLM extraction — see Phase 5.
const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is',
  'are', 'was', 'were', 'be', 'been', 'this', 'that', 'it', 'as', 'by', 'from', 'into', 'not',
  'no', 'so', 'if', 'then', 'than', 'which', 'who', 'whom', 'what', 'when', 'where', 'how',
  'why', 'all', 'can', 'will', 'you', 'your', 'their', 'its', 'has', 'have', 'had',
  // Vietnamese
  'là', 'và', 'của', 'các', 'một', 'những', 'trong', 'cho', 'có', 'được', 'này', 'đó', 'khi',
  'để', 'với', 'như', 'đã', 'sẽ', 'không', 'cũng', 'vì', 'nên', 'mà', 'ở', 'trên', 'dưới',
  'ra', 'vào', 'đến', 'từ', 'về', 'theo', 'nếu', 'nhưng', 'vẫn', 'rất', 'nhiều',
]);

const PHRASE_BOOST = 2.5; // a repeated 2-word phrase is worth 2.5× its frequency vs. a unigram
const MIN_PHRASE_FREQ = 2; // only treat a bigram as a phrase if it recurs (cuts noise)

function isCandidate(token: string): boolean {
  return token.length > 2 && !STOP_WORDS.has(token) && !/^\p{N}+$/u.test(token);
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

  const scores = new Map<string, number>();

  // Unigrams by frequency.
  for (const token of tokens) {
    if (isCandidate(token)) scores.set(token, (scores.get(token) ?? 0) + 1);
  }

  // Adjacent candidate bigrams, counted then boosted if they recur.
  const bigramFreq = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    if (isCandidate(tokens[i]) && isCandidate(tokens[i + 1])) {
      const key = `${tokens[i]} ${tokens[i + 1]}`;
      bigramFreq.set(key, (bigramFreq.get(key) ?? 0) + 1);
    }
  }
  for (const [phrase, freq] of bigramFreq) {
    if (freq >= MIN_PHRASE_FREQ) scores.set(phrase, freq * PHRASE_BOOST);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([term]) => term);

  // Take the top terms, suppressing a unigram once it's already covered by a
  // higher-ranked phrase (avoids returning both "kinh tế" and "kinh").
  const selected: string[] = [];
  const covered = new Set<string>();
  for (const term of ranked) {
    if (selected.length >= topN) break;
    const parts = term.split(' ');
    if (parts.length === 1 && covered.has(term)) continue;
    selected.push(term);
    for (const part of parts) covered.add(part);
  }

  return selected;
}
