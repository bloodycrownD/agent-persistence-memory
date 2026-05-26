import { existsSync, readFileSync } from "node:fs";
import { apmPaths, ensureWorkspace } from "../storage/paths";
import { isKbNoiseToken } from "../core/kb-stopwords";
import type { Section } from "../schemas/config";
import { readSectionContent } from "./sections-service";
import {
  kbTokenize,
  loadKbMiniSearch,
  resolveKbIndexedPath,
  searchKbIndex,
  type KbSearchHitEx
} from "./kb-index-service";

const QUERY_SECTIONS: Section[] = ["role", "persist", "dynamicDetail"];

/** Max keywords on each association header line (PRD UX: 3–4). */
const MAX_ASSOC_KEYWORDS = 4;

/** Max display length for a detail line (`lineNo|text`); overflow gets `...`. */
export const MAX_ASSOC_DETAIL_LINE_LEN = 120;

export type ReadAssociationLine = { lineNo: number; text: string };

export type ReadAssociationEntry = {
  path: string;
  matchPercent: number;
  keywords: string[];
  lines?: ReadAssociationLine[];
};

export type ReadAssociationResult =
  | { status: "missing_index" }
  | { status: "empty_query" }
  | { status: "no_hits" }
  | {
      status: "ok";
      detailed: ReadAssociationEntry[];
      summary: ReadAssociationEntry[];
    };

/**
 * Merge role, persist, and dynamic memory bodies (front matter stripped) for kb search.
 * Failed section reads are skipped, matching `apm read` warn-and-continue behavior.
 */
export function buildReadQueryContext(cwd: string): string {
  const parts: string[] = [];
  for (const id of QUERY_SECTIONS) {
    try {
      const content = readSectionContent(cwd, id).trim();
      if (content.length > 0) parts.push(content);
    } catch {
      /* skip unreadable sections */
    }
  }
  return parts.join("\n\n");
}

/**
 * Prefer longer informative tokens when trimming to the display cap.
 * Query-order is preserved among kept terms.
 */
function keywordInformativeness(term: string): number {
  if (/^[a-z0-9_]{2,}$/i.test(term)) return term.length;
  const cjkRun = term.match(/[\u4e00-\u9fff]+/g);
  if (cjkRun) return Math.max(...cjkRun.map((s) => s.length));
  return term.length;
}

function capKeywords(keywords: string[]): string[] {
  if (keywords.length <= MAX_ASSOC_KEYWORDS) return keywords;
  const ranked = keywords
    .map((term, index) => ({ term, index, score: keywordInformativeness(term) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const keep = new Set(ranked.slice(0, MAX_ASSOC_KEYWORDS).map((r) => r.index));
  return keywords.filter((_, i) => keep.has(i));
}

/** Query ∩ hit terms (query order), capped; fallback to top hit terms after noise filter. */
function pickKeywords(queryContext: string, hit: KbSearchHitEx): string[] {
  const queryTerms = kbTokenize(queryContext).filter((t) => !isKbNoiseToken(t));
  const hitTerms = new Set([...hit.terms, ...Object.keys(hit.match ?? {})]);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const t of queryTerms) {
    if (keywords.length >= MAX_ASSOC_KEYWORDS) break;
    if (hitTerms.has(t) && !seen.has(t)) {
      seen.add(t);
      keywords.push(t);
    }
  }
  if (keywords.length > 0) return capKeywords(keywords);
  const fromHit = [...hitTerms]
    .filter((t) => !isKbNoiseToken(t))
    .sort((a, b) => keywordInformativeness(b) - keywordInformativeness(a) || a.localeCompare(b))
    .slice(0, MAX_ASSOC_KEYWORDS);
  if (fromHit.length > 0) return fromHit;
  return capKeywords(queryTerms.slice(0, MAX_ASSOC_KEYWORDS));
}

function lineContainsKeyword(line: string, keywords: string[]): boolean {
  for (const kw of keywords) {
    if (/[\u4e00-\u9fff]/.test(kw)) {
      if (line.includes(kw)) return true;
    } else if (line.toLowerCase().includes(kw.toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Up to `maxLines` non-empty source lines (1-based) that contain any keyword.
 * Uses raw file bytes, not stripped index body.
 */
export function collectHitLines(
  kbRoot: string,
  relPath: string,
  keywords: string[],
  maxLines: number
): ReadAssociationLine[] {
  if (keywords.length === 0) return [];
  const abs = resolveKbIndexedPath(kbRoot, relPath);
  if (!existsSync(abs)) return [];
  const fileLines = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").split("\n");
  const out: ReadAssociationLine[] = [];
  for (let i = 0; i < fileLines.length && out.length < maxLines; i++) {
    const text = fileLines[i];
    if (text.trim().length === 0) continue;
    if (lineContainsKeyword(text, keywords)) {
      out.push({ lineNo: i + 1, text });
    }
  }
  return out;
}

/**
 * Run kb search against merged memory context; split detailed (5) and summary (10) tiers.
 */
export function computeReadAssociation(cwd: string): ReadAssociationResult {
  ensureWorkspace(cwd);
  const query = buildReadQueryContext(cwd).trim();
  if (!query) return { status: "empty_query" };

  const ms = loadKbMiniSearch(cwd);
  if (!ms) return { status: "missing_index" };

  const raw = searchKbIndex(ms, query, 15);
  if (raw.length === 0) return { status: "no_hits" };

  const maxScore = Math.max(...raw.map((r) => r.score));
  const p = apmPaths(cwd);
  const seenPaths = new Set<string>();
  const unique: Array<{ hit: KbSearchHitEx; matchPercent: number; keywords: string[] }> = [];

  for (const hit of raw) {
    if (seenPaths.has(hit.path)) continue;
    seenPaths.add(hit.path);
    const matchPercent = maxScore <= 0 ? 0 : Math.round((hit.score / maxScore) * 100);
    unique.push({ hit, matchPercent, keywords: pickKeywords(query, hit) });
  }

  const detailed: ReadAssociationEntry[] = unique.slice(0, 5).map(({ hit, matchPercent, keywords }) => ({
    path: hit.path,
    matchPercent,
    keywords,
    lines: collectHitLines(p.kbRoot, hit.path, keywords, 3)
  }));

  const summary: ReadAssociationEntry[] = unique.slice(5, 15).map(({ hit, matchPercent, keywords }) => ({
    path: hit.path,
    matchPercent,
    keywords
  }));

  return { status: "ok", detailed, summary };
}

/** Truncate full `lineNo|text` display lines for terminal readability. */
export function truncateAssocDisplayLine(
  line: string,
  maxLen = MAX_ASSOC_DETAIL_LINE_LEN
): string {
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen) + "...";
}

/** `[n%] path` with optional `关键词：kw1 kw2` suffix. */
export function formatAssocHeader(entry: ReadAssociationEntry): string {
  const base = `[${entry.matchPercent}%] ${entry.path}`;
  if (entry.keywords.length === 0) return base;
  return `${base} 关键词：${entry.keywords.join(" ")}`;
}

function formatDetailedEntry(entry: ReadAssociationEntry): string {
  const header = formatAssocHeader(entry);
  if (!entry.lines?.length) return header;
  const displayLines = entry.lines.map((l) =>
    truncateAssocDisplayLine(`${l.lineNo}|${l.text}`)
  );
  return [header, ...displayLines].join("\n");
}

/**
 * Render `# 联想区` block for stdout, or null when the section should be omitted.
 */
export function formatAssociationSection(result: ReadAssociationResult): string | null {
  if (result.status === "missing_index") {
    return "# 联想区\n\nKnowledge index missing. Run `apm kb index rebuild`.";
  }
  if (result.status === "empty_query" || result.status === "no_hits") {
    return null;
  }

  const sections: string[] = [];
  if (result.detailed.length > 0) {
    sections.push(result.detailed.map((e) => formatDetailedEntry(e)).join("\n\n"));
  }
  if (result.summary.length > 0) {
    sections.push(result.summary.map((e) => formatAssocHeader(e)).join("\n"));
  }
  const body = sections.length > 0 ? sections.join("\n\n") : "";
  return body ? `# 联想区\n\n${body}` : "# 联想区";
}
