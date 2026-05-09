import type { ChunkDoc } from "./chunks-service";
import type { TodoDoc } from "./todos-service";

export type ReadAssociationChunk = {
  name: string;
  keywords: string[];
  score: number;
};

export type ReadAssociations = {
  /**
   * Keywords extracted from persisted + current working context (persist/detail/(optional) todos).
   *
   * Design intent:
   * - Do NOT echo chunk keywords directly; treat chunks as a corpus we can match against.
   * - Use an inverted-index style extraction over the "query text" (persist/detail/todos),
   *   then score chunks by overlap against that query-keyword set.
   */
  persistenceKeywords: string[];
  selectedChunks: ReadAssociationChunk[];
  /**
   * Extra keywords suggested from the selected chunks (excluding persistenceKeywords), ranked by
   * frequency and chunk relevance. These are for "associative jumps" to nearby concepts.
   */
  associativeKeywords: string[];
};

const STOPWORDS = new Set(
  [
    // English
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
    // APM / generic
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

function clampKeywordCount(candidates: string[], opts: { min: number; max: number }): string[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= opts.max) {
    // If we can't reach min, return what we have (caller decides if that's acceptable).
    return candidates;
  }
  return candidates.slice(0, opts.max);
}

export function buildReadAssociations(input: {
  persistText: string;
  detailText: string;
  todos: TodoDoc[];
  chunks: ChunkDoc[];
}): ReadAssociations {
  const { persistText, detailText, todos, chunks } = input;

  // Inverted-index style extraction: build a term -> weighted tf score map from the "query sources".
  // We keep it deterministic and local (no external model calls).
  const termScore = new Map<string, number>();
  function addText(text: string, weight: number): void {
    if (!text) return;
    const tokens = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, c] of tf) {
      const score = weight * Math.log1p(c);
      termScore.set(t, (termScore.get(t) ?? 0) + score);
    }
  }

  addText(persistText, 2.0);
  addText(detailText, 1.5);
  // Optional source: current todos can provide a small hint of "what's active now".
  addText(
    todos
      .filter((t) => !t.completed)
      .map((t) => `${t.name} ${t.description}`)
      .join("\n"),
    1.0
  );

  const persistenceRanked = [...termScore.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  const persistenceKeywords = clampKeywordCount(persistenceRanked, { min: 5, max: 10 }).slice(0, 10);

  const queryWeight = new Map<string, number>();
  for (const [t, s] of termScore) queryWeight.set(t, s);

  function scoreChunk(chunk: ChunkDoc): number {
    let score = 0;
    for (const kw of chunk.keywords) {
      const t = kw.toLowerCase().trim();
      const w = queryWeight.get(t);
      if (w) score += w;
    }
    return score;
  }

  const scoredChunks: ReadAssociationChunk[] = chunks
    .map((c) => ({ name: c.name, keywords: c.keywords, score: scoreChunk(c) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const selectedChunks = scoredChunks.slice(0, 5); // 3~5 max; may be fewer.

  // Associative keywords: derive from selected chunks keywords (excluding persistence keywords),
  // weighted by chunk score (so keywords from the most relevant chunks rank higher).
  const persistenceSet = new Set(persistenceKeywords.map((k) => k.toLowerCase()));
  const assocScore = new Map<string, number>();
  for (const c of selectedChunks) {
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

  // Count constraints:
  // - Prefer 5~10 when possible.
  // - If corpus is too small, allow 3~5 (or fewer if <3 exist).
  const associativeKeywords =
    associativeRanked.length >= 5
      ? clampKeywordCount(associativeRanked, { min: 5, max: 10 }).slice(0, 10)
      : associativeRanked.slice(0, Math.min(5, associativeRanked.length));

  return { persistenceKeywords, selectedChunks, associativeKeywords };
}

