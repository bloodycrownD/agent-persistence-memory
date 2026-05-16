/** English stopwords filtered from association keyword display (lowercase match). */
const EN_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "but",
  "as",
  "by",
  "with",
  "from",
  "it",
  "this",
  "that"
]);

/** Tokens containing `@` are treated as email-like noise. */
const EMAIL_LIKE = /@/;

/** Letters, digits, or CJK — used to detect punctuation-only tokens. */
const ALNUM_OR_CJK = /[a-z0-9\u4e00-\u9fff]/i;

/**
 * Whether a token should be excluded from read-association keyword display.
 * Indexing still uses full tokenization; this only affects surfaced keywords.
 */
export function isKbNoiseToken(term: string): boolean {
  if (!term || !term.trim()) return true;
  if (EMAIL_LIKE.test(term)) return true;
  if (!ALNUM_OR_CJK.test(term)) return true;
  if (EN_STOPWORDS.has(term.toLowerCase())) return true;
  return false;
}
