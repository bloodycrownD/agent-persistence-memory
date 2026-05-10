/**
 * Scores chunks against inverted-index style query terms for two independent read contexts:
 * persistence (persist-heavy) vs associative memory (detail + current task, lighter persist).
 * Keeps ranking deterministic without NLP dependencies.
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
}

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
    const t = kw.toLowerCase().trim();
    const w = queryWeight.get(t);
    if (w) score += w;
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

  const persistenceRanked = rankChunks(chunks, persistenceTerms);
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

  const associativeRanked = rankChunks(chunks, associativeTerms);
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
