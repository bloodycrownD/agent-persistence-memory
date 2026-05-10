/**
 * Scores chunks against inverted-index style query terms for two independent read contexts:
 * persistence (persist-heavy) vs associative memory (detail + current task, lighter persist).
 *
 * Token coverage:
 * - Latin-ish identifiers via ascii tokenizer + stopwords.
 * - CJK via contiguous‑Han bigrams so中文正文可以与 persist/detail 对齐打分。
 *
 * After ranking, chunks with identical trimmed {@link ChunkDoc.content} are deduped so imports / retries
 * do not fill Primary with重复全文。
 */
import type { ChunkDoc } from "./chunks-service";
import type { TodoDoc } from "./todos-service";

export type ReadTierPrimary = {
  name: string;
  keywords: string[];
  score: number;
  content: string;
};

export type ReadTierSecondary = {
  name: string;
  keywords: string[];
  score: number;
};

export type ReadAssociations = {
  persistenceKeywords: string[];
  persistencePrimary: ReadTierPrimary[];
  persistenceSecondary: ReadTierSecondary[];
  associativePrimary: ReadTierPrimary[];
  associativeSecondary: ReadTierSecondary[];
  associativeKeywords: string[];
};

const STOPWORDS = new Set(
  [
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "with",
    "from",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "it",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "we",
    "they",
    "he",
    "she",
    "them",
    "our",
    "your",
    "their",
    "not",
    "no",
    "yes",
    "do",
    "does",
    "did",
    "done",
    "can",
    "could",
    "should",
    "would",
    "may",
    "might",
    "must",
    "apm",
    "cli",
    "read",
    "json",
    "tmp",
    "todo",
    "todos"
  ].map((s) => s.toLowerCase())
);

/** Sliding bigrams over unified Han spans — cheap deterministic recall without an NLP dict. */
function chineseBigrams(text: string): string[] {
  const out: string[] = [];
  for (const seg of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (seg.length < 2) continue;
    for (let i = 0; i < seg.length - 1; i++) {
      out.push(seg.slice(i, i + 2));
    }
  }
  return out;
}

function tokenize(text: string): string[] {
  const asciiTokens = text
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
  return [...asciiTokens, ...chineseBigrams(text)];
}

/** Lower score multiplier vs keyword overlap — avoids正文淹没 curated keywords */
const CONTENT_OVERLAP_WEIGHT = 0.35;

function addWeightedTokens(termScore: Map<string, number>, text: string, weight: number): void {
  if (!text) return;
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [t, c] of tf) {
    const score = weight * Math.log1p(c);
    termScore.set(t, (termScore.get(t) ?? 0) + score);
  }
}

function clampKeywordCount(candidates: string[], opts: { min: number; max: number }): string[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= opts.max) {
    return candidates;
  }
  return candidates.slice(0, opts.max);
}

function scoreChunkAgainstTerms(chunk: ChunkDoc, queryWeight: Map<string, number>): number {
  let score = 0;
  for (const kw of chunk.keywords) {
    const raw = kw.trim();
    const lower = raw.toLowerCase();
    const w = queryWeight.get(raw) ?? queryWeight.get(lower);
    if (w) score += w;
  }
  const seenContentTok = new Set<string>();
  for (const tok of tokenize(chunk.content)) {
    if (seenContentTok.has(tok)) continue;
    seenContentTok.add(tok);
    const w = queryWeight.get(tok);
    if (w) score += w * CONTENT_OVERLAP_WEIGHT;
  }
  return score;
}

function rankChunks(chunks: ChunkDoc[], queryWeight: Map<string, number>): ChunkDoc[] {
  return chunks
    .map((c) => ({ c, s: scoreChunkAgainstTerms(c, queryWeight) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c);
}

/** Same markdown body should only occupy one tier slot (duplicate imports / renamed copies). */
function dedupeChunksByContent(chunks: ChunkDoc[]): ChunkDoc[] {
  const seen = new Set<string>();
  const out: ChunkDoc[] = [];
  for (const c of chunks) {
    const body = c.content.trim();
    const key = body.length > 0 ? body : `__empty__:${c.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

const TIER_TOP_N = 8;
const PRIMARY_COUNT = 3;

function splitTiers(
  ranked: ChunkDoc[],
  scoreFn: (c: ChunkDoc) => number
): { primary: ReadTierPrimary[]; secondary: ReadTierSecondary[] } {
  const top = ranked.slice(0, TIER_TOP_N);
  const primaryDocs = top.slice(0, PRIMARY_COUNT);
  const secondaryDocs = top.slice(PRIMARY_COUNT);
  return {
    primary: primaryDocs.map((c) => ({
      name: c.name,
      keywords: c.keywords,
      score: scoreFn(c),
      content: c.content
    })),
    secondary: secondaryDocs.map((c) => ({
      name: c.name,
      keywords: c.keywords,
      score: scoreFn(c)
    }))
  };
}

function buildPersistenceKeywords(termScore: Map<string, number>): string[] {
  const persistenceRanked = [...termScore.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
  return clampKeywordCount(persistenceRanked, { min: 5, max: 10 }).slice(0, 10);
}

function buildAssociativeKeywords(
  persistenceKeywords: string[],
  tierChunks: Array<{ keywords: string[]; score: number }>
): string[] {
  const persistenceSet = new Set(persistenceKeywords.map((k) => k.toLowerCase()));
  const assocScore = new Map<string, number>();
  for (const c of tierChunks) {
    const weight = Math.max(1, c.score);
    for (const kw of c.keywords) {
      const t = kw.toLowerCase().trim();
      if (!t) continue;
      if (persistenceSet.has(t)) continue;
      assocScore.set(t, (assocScore.get(t) ?? 0) + weight);
    }
  }
  const associativeRanked = [...assocScore.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  return associativeRanked.length >= 5
    ? clampKeywordCount(associativeRanked, { min: 5, max: 10 }).slice(0, 10)
    : associativeRanked.slice(0, Math.min(5, associativeRanked.length));
}

export function buildReadAssociations(input: {
  persistText: string;
  detailText: string;
  currentTaskText: string;
  todos: TodoDoc[];
  chunks: ChunkDoc[];
}): ReadAssociations {
  const { persistText, detailText, currentTaskText, todos, chunks } = input;

  const persistenceTerms = new Map<string, number>();
  addWeightedTokens(persistenceTerms, persistText, 2.0);
  addWeightedTokens(persistenceTerms, detailText, 1.5);
  addWeightedTokens(
    persistenceTerms,
    todos
      .filter((t) => !t.completed)
      .map((t) => `${t.name} ${t.description}`)
      .join("\n"),
    1.0
  );

  const persistenceKeywords = buildPersistenceKeywords(persistenceTerms);

  const persistenceRanked = dedupeChunksByContent(rankChunks(chunks, persistenceTerms));
  const persistenceScorer = (c: ChunkDoc) => scoreChunkAgainstTerms(c, persistenceTerms);
  const { primary: persistencePrimary, secondary: persistenceSecondary } = splitTiers(
    persistenceRanked,
    persistenceScorer
  );

  /** Associative query: emphasize working memory + task; persist contributes but less than in persistence queue. */
  const associativeTerms = new Map<string, number>();
  addWeightedTokens(associativeTerms, persistText, 1.0);
  addWeightedTokens(associativeTerms, detailText, 2.5);
  addWeightedTokens(associativeTerms, currentTaskText, 2.0);

  const associativeRanked = dedupeChunksByContent(rankChunks(chunks, associativeTerms));
  const associativeScorer = (c: ChunkDoc) => scoreChunkAgainstTerms(c, associativeTerms);
  const { primary: associativePrimary, secondary: associativeSecondary } = splitTiers(
    associativeRanked,
    associativeScorer
  );

  const associativeKeywords = buildAssociativeKeywords(persistenceKeywords, [
    ...associativePrimary,
    ...associativeSecondary
  ]);

  return {
    persistenceKeywords,
    persistencePrimary,
    persistenceSecondary,
    associativePrimary,
    associativeSecondary,
    associativeKeywords
  };
}
