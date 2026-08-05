/**
 * Normalizes source and query text without discarding punctuation, namespace
 * separators, accents, or other meaningful schema vocabulary.
 */
export function normalizeProjectSearchText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}
