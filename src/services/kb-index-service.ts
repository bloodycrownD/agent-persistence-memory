import { existsSync, readFileSync, renameSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import MiniSearch from "minisearch";
import { extractMarkdownBodyRelaxed } from "../core/markdown-body";
import { apmPaths, ensureWorkspace } from "../storage/paths";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";

export type KbIndexDoc = { path: string; title: string; body: string };

function atomicWriteGzip(path: string, buf: Buffer): void {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, buf);
  renameSync(tempPath, path);
}

/** 索引与检索分词：优先 `Intl.Segmenter`，回退 ASCII 词与 CJK n-gram。 */
export function kbTokenize(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const out: string[] = [];
  const segCtor = typeof Intl !== "undefined" ? (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter : undefined;
  if (segCtor) {
    try {
      const seg = new segCtor(["zh-Hans", "en"], { granularity: "word" });
      for (const part of seg.segment(normalized) as Iterable<{ segment: string; isWordLike?: boolean }>) {
        const s = part.segment.trim().toLowerCase();
        if (!s) continue;
        if (part.isWordLike) out.push(s);
        else out.push(...s.split(/[\s,.;:!?/()[\]{}'"`~@#$%^&*+=|<>]+/).filter(Boolean));
      }
      if (out.length > 0) return [...new Set(out)];
    } catch {
      /* 回退到下方 ASCII/CJK 分词 */
    }
  }
  const lower = normalized.toLowerCase();
  for (const w of lower.match(/[a-z0-9_]{2,}/g) ?? []) {
    out.push(w);
  }
  const cjk = lower.replace(/[\s\w.,;:!?/()[\]{}'"`~@#$%^&*+=|<>-]/g, "");
  for (const ch of cjk) {
    out.push(ch);
  }
  for (let i = 0; i < cjk.length - 1; i++) {
    out.push(cjk.slice(i, i + 2));
  }
  return [...new Set(out)];
}

function kbMiniSearchOptions(): ConstructorParameters<typeof MiniSearch<KbIndexDoc>>[0] {
  return {
    idField: "path",
    fields: ["title", "body"],
    storeFields: ["title", "path"],
    tokenize: (str: string) => kbTokenize(str),
    processTerm: (term: string) => (term ? term.toLowerCase() : null)
  };
}

function extractKbDoc(raw: string): { body: string; title: string } {
  const body = extractMarkdownBodyRelaxed(raw);
  const hm = body.match(/^#\s*(.+)$/m);
  const title = hm ? hm[1].trim() : "";
  return { body, title };
}

/** 递归收集 `root` 下全部 `.md`（返回相对 `root` 的 posix 路径）。 */
function walkMarkdown(root: string, relDir = ""): string[] {
  const dir = relDir ? join(root, relDir) : root;
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      out.push(...walkMarkdown(root, rel));
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

/**
 * 将索引相对路径（posix `rel`，以 `docs/` 或 `archive/` 开头）解析到对应物理根。
 * `docs/` → 项目根 `docs/`；`archive/` → `.apm/archive/`。拒绝路径穿越。
 */
export function resolveIndexedPath(cwd: string, rel: string): string {
  const safe = rel.replace(/\\/g, "/");
  if (safe.includes("..") || safe.startsWith("/")) {
    throw new Error(`Invalid indexed path: ${rel}`);
  }
  const p = apmPaths(cwd);
  if (safe.startsWith("docs/")) {
    return join(p.docsDir, safe.slice("docs/".length));
  }
  if (safe.startsWith("archive/")) {
    return join(p.archiveDir, safe.slice("archive/".length));
  }
  throw new Error(`Invalid indexed path (must start with docs/ or archive/): ${rel}`);
}

/** 加载已持久化的 MiniSearch 索引；gzip 索引不存在时返回 null。 */
export function loadKbMiniSearch(cwd: string): MiniSearch<KbIndexDoc> | null {
  ensureWorkspace(cwd);
  const p = apmPaths(cwd);
  if (!existsSync(p.searchIndexGz)) return null;
  const buf = gunzipSync(readFileSync(p.searchIndexGz));
  return MiniSearch.loadJSON<KbIndexDoc>(buf.toString("utf8"), kbMiniSearchOptions());
}

export type KbSearchHitEx = {
  path: string;
  title: string;
  score: number;
  terms: string[];
  match: Record<string, string[]>;
};

/** 在已加载索引上执行 BM25+ 检索；结果按得分排序并含命中元数据。 */
export function searchKbIndex(ms: MiniSearch<KbIndexDoc>, query: string, limit: number): KbSearchHitEx[] {
  const raw = ms.search(query, { fuzzy: 0.2, prefix: true }).slice(0, limit);
  return raw.map((r) => {
    const rec = r as {
      id?: unknown;
      path?: unknown;
      title?: unknown;
      score: number;
      terms?: string[];
      match?: Record<string, string[]>;
    };
    return {
      path: String(rec.path ?? rec.id ?? ""),
      title: String(rec.title ?? ""),
      score: rec.score,
      terms: rec.terms ?? [],
      match: rec.match ?? {}
    };
  });
}

/**
 * 重建搜索索引：扫描项目根 `docs/`（前缀 `docs/`）与 `.apm/archive/`（前缀 `archive/`）。
 * 索引写入 `.apm/config/index.gz`。
 */
export async function rebuildKbIndex(cwd: string): Promise<void> {
  ensureWorkspace(cwd);
  const p = apmPaths(cwd);
  const ms = new MiniSearch<KbIndexDoc>(kbMiniSearchOptions());

  for (const rel of walkMarkdown(p.docsDir)) {
    const abs = join(p.docsDir, rel);
    const raw = readFileSync(abs, "utf8");
    const { title, body } = extractKbDoc(raw);
    ms.add({ path: `docs/${rel}`, title, body });
  }
  for (const rel of walkMarkdown(p.archiveDir)) {
    const abs = join(p.archiveDir, rel);
    const raw = readFileSync(abs, "utf8");
    const { title, body } = extractKbDoc(raw);
    ms.add({ path: `archive/${rel}`, title, body });
  }

  const json = JSON.stringify(ms);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  await withGlobalLock(p.lock, async () => {
    await serialWrite(p.searchIndexGz, async () => {
      atomicWriteGzip(p.searchIndexGz, gz);
    });
  });
}
