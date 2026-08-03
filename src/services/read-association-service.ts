import { existsSync, readFileSync } from "node:fs";
import { ensureWorkspace } from "../storage/paths";
import { isKbNoiseToken } from "../core/kb-stopwords";
import type { Section } from "../schemas/config";
import { readSectionContentRelaxed } from "./sections-service";
import {
  kbTokenize,
  loadKbMiniSearch,
  resolveIndexedPath,
  searchKbIndex,
  type KbSearchHitEx
} from "./kb-index-service";

const QUERY_SECTIONS: Section[] = ["role", "persist", "dynamicDetail"];

/** 联想区每条标题行最多展示的关键词数（PRD UX：3–4）。 */
const MAX_ASSOC_KEYWORDS = 4;

/** 详情行（`lineNo|text`）最大展示长度；超出追加 `...`。 */
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
 * 合并 role、persist、dynamic 正文（宽松剥离 front matter）供 kb 检索；
 * 与 `apm read` 使用相同的宽松读法；I/O 失败段跳过。
 */
export function buildReadQueryContext(cwd: string): string {
  const parts: string[] = [];
  for (const id of QUERY_SECTIONS) {
    try {
      const content = readSectionContentRelaxed(cwd, id).trim();
      if (content.length > 0) parts.push(content);
    } catch {
      /* 跳过无法读取的段 */
    }
  }
  return parts.join("\n\n");
}

/**
 * 截断至展示上限时优先保留更长、更有信息量的 token；
 * 保留项仍按查询词序排列。
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

/** 查询词 ∩ 命中词（按查询序）并封顶；无交集时回退噪声过滤后的命中词。 */
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
 * 最多取 `maxLines` 条含任一关键词的非空源文件行（行号从 1 起）。
 * 使用原始文件内容，而非索引剥离后的正文。
 */
export function collectHitLines(
  cwd: string,
  relPath: string,
  keywords: string[],
  maxLines: number
): ReadAssociationLine[] {
  if (keywords.length === 0) return [];
  const abs = resolveIndexedPath(cwd, relPath);
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
 * 以合并后的记忆上下文检索 kb；拆分为详细层（5）与摘要层（10）。
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
    lines: collectHitLines(cwd, hit.path, keywords, 3)
  }));

  const summary: ReadAssociationEntry[] = unique.slice(5, 15).map(({ hit, matchPercent, keywords }) => ({
    path: hit.path,
    matchPercent,
    keywords
  }));

  return { status: "ok", detailed, summary };
}

/** 截断完整 `lineNo|text` 展示行，便于终端阅读。 */
export function truncateAssocDisplayLine(
  line: string,
  maxLen = MAX_ASSOC_DETAIL_LINE_LEN
): string {
  if (line.length <= maxLen) return line;
  return line.slice(0, maxLen) + "...";
}

/** 格式为 `[n%] path`，可选后缀 `关键词：kw1 kw2`。 */
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
 * 渲染 stdout 用的 `# 联想区` 块；应省略该区时返回 null。
 */
export function formatAssociationSection(result: ReadAssociationResult): string | null {
  if (result.status === "missing_index") {
    return "# 联想区\n\nKnowledge index missing. Run `apm index build`.";
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
