import { existsSync, readFileSync, renameSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import MiniSearch from "minisearch";
import { apmPaths, ensureWorkspace } from "../storage/paths";
import { parseFrontMatter } from "../storage/markdown";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";

export type KbIndexDoc = { path: string; title: string; body: string };

function atomicWriteGzip(path: string, buf: Buffer): void {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, buf);
  renameSync(tempPath, path);
}

/** Tokenize for indexing and search: prefers `Intl.Segmenter`, with ASCII + CJK n-gram fallback. */
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
      /* fall through */
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
  let body = raw.replace(/\r\n/g, "\n");
  if (body.startsWith("---\n")) {
    try {
      body = parseFrontMatter(body).content;
    } catch {
      /* keep full */
    }
  }
  const hm = body.match(/^#\s*(.+)$/m);
  const title = hm ? hm[1].trim() : "";
  return { body, title };
}

/** Recurse all `.md` under `kbRoot`; skip only directories named `index`. */
function walkKbMarkdownUnderKbRoot(kbRoot: string, relDir = ""): string[] {
  const dir = relDir ? join(kbRoot, relDir) : kbRoot;
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && ent.name === "index") continue;
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      out.push(...walkKbMarkdownUnderKbRoot(kbRoot, rel));
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
  return out;
}

/**
 * Resolve a kb-relative path under `kbRoot` (posix `rel`); rejects traversal outside kb.
 */
export function resolveKbIndexedPath(kbRoot: string, rel: string): string {
  const safe = rel.replace(/\\/g, "/");
  if (safe.includes("..") || safe.startsWith("/")) {
    throw new Error(`Invalid kb path: ${rel}`);
  }
  const abs = join(kbRoot, safe);
  const kbNorm = kbRoot.replace(/\\/g, "/");
  const absNorm = abs.replace(/\\/g, "/");
  if (absNorm !== kbNorm && !absNorm.startsWith(`${kbNorm}/`)) {
    throw new Error(`Invalid kb path: ${rel}`);
  }
  return abs;
}

/** Load persisted MiniSearch index; returns null when gzip index is absent. */
export function loadKbMiniSearch(cwd: string): MiniSearch<KbIndexDoc> | null {
  ensureWorkspace(cwd);
  const p = apmPaths(cwd);
  if (!existsSync(p.kbSearchIndexGz)) return null;
  const buf = gunzipSync(readFileSync(p.kbSearchIndexGz));
  return MiniSearch.loadJSON<KbIndexDoc>(buf.toString("utf8"), kbMiniSearchOptions());
}

export type KbSearchHitEx = {
  path: string;
  title: string;
  score: number;
  terms: string[];
  match: Record<string, string[]>;
};

/** Run BM25+ search on a loaded index; results are score-ordered hits with match metadata. */
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

export async function rebuildKbIndex(cwd: string): Promise<void> {
  ensureWorkspace(cwd);
  const p = apmPaths(cwd);
  const rels = walkKbMarkdownUnderKbRoot(p.kbRoot);
  const ms = new MiniSearch<KbIndexDoc>(kbMiniSearchOptions());
  for (const rel of rels) {
    const abs = join(p.kbRoot, rel);
    const raw = readFileSync(abs, "utf8");
    const { title, body } = extractKbDoc(raw);
    ms.add({ path: rel, title, body });
  }
  const json = JSON.stringify(ms);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  await withGlobalLock(p.lock, async () => {
    await serialWrite(p.kbSearchIndexGz, async () => {
      atomicWriteGzip(p.kbSearchIndexGz, gz);
    });
  });
}

export type KbSearchHit = { path: string; title: string; score: number };

/** CLI `kb search`: throws when index file is missing (T7). */
export function searchKb(cwd: string, query: string, limit = 5): KbSearchHit[] {
  ensureWorkspace(cwd);
  const p = apmPaths(cwd);
  if (!existsSync(p.kbSearchIndexGz)) {
    throw new Error("Knowledge index missing. Run `apm kb index rebuild`.");
  }
  const ms = loadKbMiniSearch(cwd)!;
  return searchKbIndex(ms, query, limit).map(({ path, title, score }) => ({ path, title, score }));
}
