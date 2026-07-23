// Naive stub, not real NLP: strips common English/Vietnamese function words and picks the
// most frequent remaining words. Good enough to prove the auto-tag/relationship schema —
// a real implementation (TF-IDF, LLM-based extraction, etc.) is a fast-follow.
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

export function extractKeywords(text: string, topN = 5): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const frequency = new Map<string, number>();
  for (const word of words) frequency.set(word, (frequency.get(word) ?? 0) + 1);

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}
