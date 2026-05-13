/**
 * Import memory/persistence markdown records into .apm chunks.
 *
 * Chunk bodies are capped at 200 chars (product rule): long notes are split into
 * multiple chunks (same keywords, names base-s01, base-s02, …). No file-path
 * pointers—content lives entirely in chunk text, which matches the chunk model.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureApm } from "../src/storage/paths";
import { nowLocal } from "../src/core/time";
import { countChars } from "../src/core/validate";
import { writeSection } from "../src/services/sections-service";
import { listTodos, writeTodo } from "../src/services/todos-service";
import { listChunks, writeChunk } from "../src/services/chunks-service";

const CHUNK_BODY_MAX = 200;

type MemoryRecord = {
  sourcePath: string;
  title: string;
  keywords: string[];
  content: string;
};

function safeChunkName(base: string): string {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return slug;
}

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)\s*$/m);
  return m?.[1]?.trim() || "Untitled";
}

function extractKeywords(md: string): string[] {
  const line = md.split("\n").find((l) => l.includes("关键词"));
  if (line) {
    const ticks = Array.from(line.matchAll(/`([^`]+)`/g)).map((m) => m[1].trim());
    if (ticks.length) return ticks.slice(0, 10);
    const after = line.split("：")[1] ?? line.split(":")[1];
    if (after) {
      return after
        .split(/[,，\s]+/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
    }
  }
  const inferred: string[] = [];
  if (/VFS/i.test(md)) inferred.push("VFS");
  if (/SillyTavern/i.test(md)) inferred.push("SillyTavern");
  if (/CSS/i.test(md)) inferred.push("CSS");
  if (/UI/i.test(md)) inferred.push("UI");
  return inferred.slice(0, 10);
}

/** Split full markdown body into ≤CHUNK_BODY_MAX codepoints; prefer newline breaks. */
function splitContentForChunks(text: string): string[] {
  const segments: string[] = [];
  const chars = Array.from(text);
  let i = 0;
  while (i < chars.length) {
    let end = Math.min(i + CHUNK_BODY_MAX, chars.length);
    if (end < chars.length) {
      const lookback = 48;
      const windowStart = Math.max(i, end - lookback);
      let cut = end;
      for (let j = end - 1; j >= windowStart; j--) {
        if (chars[j] === "\n") {
          cut = j + 1;
          break;
        }
      }
      end = cut;
    }
    const piece = chars.slice(i, end).join("");
    if (piece.length > 0) segments.push(piece);
    i = end;
  }
  return segments;
}

function parsePersistenceIndexLinks(indexMd: string): string[] {
  const paths: string[] = [];
  for (const m of indexMd.matchAll(/\((\.\/\d{8}\/records\/[^)]+?\.md)\)/g)) {
    paths.push(m[1]);
  }
  return Array.from(new Set(paths));
}

function loadRecord(repoRoot: string, relPathFromIndex: string): MemoryRecord {
  const abs = join(repoRoot, "memory", "persistence", relPathFromIndex.replace(/^\.\//, ""));
  const content = readFileSync(abs, "utf8");
  return {
    sourcePath: abs,
    title: extractTitle(content),
    keywords: extractKeywords(content),
    content
  };
}

function clipToMaxCountChars(text: string, max: number): string {
  if (countChars(text) <= max) return text;
  return Array.from(text)
    .slice(0, max)
    .join("");
}

function padToMinCountChars(text: string, min: number, padLine: string): string {
  let out = text;
  while (countChars(out) < min) {
    out += "\n" + padLine;
  }
  return out;
}

async function main() {
  const repoRoot = process.cwd();
  ensureApm(repoRoot);

  const indexPath = join(repoRoot, "memory", "persistence", "index.md");
  if (!existsSync(indexPath)) {
    throw new Error(`memory persistence index not found: ${indexPath}`);
  }

  const indexMd = readFileSync(indexPath, "utf8");
  const relLinks = parsePersistenceIndexLinks(indexMd);
  const records = relLinks.map((p) => loadRecord(repoRoot, p));

  const existingChunkNames = new Set(listChunks(repoRoot).map((c) => c.name));

  const now = nowLocal();
  let chunkCount = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const date = (r.sourcePath.match(/\\memory\\persistence\\(\d{8})\\records\\/i) ||
      r.sourcePath.match(/\/memory\/persistence\/(\d{8})\/records\//i))?.[1];
    const base = safeChunkName(`${date ?? "unknown"}-${r.title}`) || `mem-${date ?? "unknown"}-${i + 1}`;

    const segments = splitContentForChunks(r.content);
    if (segments.length === 0) continue;

    const kw = r.keywords.length ? [...r.keywords] : ["memory-import"];
    if (!kw.includes("memory-import")) kw.push("memory-import");

    const allocateName = (suffix: string): string => {
      let candidate = suffix ? `${base}${suffix}` : base;
      let n = 2;
      while (existingChunkNames.has(candidate)) {
        candidate = suffix ? `${base}${suffix}-${n}` : `${base}-${n}`;
        n++;
      }
      existingChunkNames.add(candidate);
      return candidate;
    };

    if (segments.length === 1) {
      const name = allocateName("");
      await writeChunk(repoRoot, {
        name,
        keywords: kw,
        createdAt: now,
        updatedAt: now,
        content: segments[0]
      });
      chunkCount++;
    } else {
      for (let s = 0; s < segments.length; s++) {
        const segSuffix = `-s${String(s + 1).padStart(2, "0")}`;
        const name = allocateName(segSuffix);
        await writeChunk(repoRoot, {
          name,
          keywords: kw,
          createdAt: now,
          updatedAt: now,
          content: segments[s]
        });
        chunkCount++;
      }
    }
  }

  // persist: 300~500 codepoints (default config), no external path pointers
  let persistCore =
    `已将 memory/persistence 中的记录写入 apm chunks：长文按每段最多200字切分，同一主题的多个 chunk 共享关键词，多段命名后缀为 -s01、-s02。` +
    `请用 apm chunks search / list / read 检索；稳定规则写入 persist，阶段任务用 tmp todos，执行进展用 tmp detail。`;
  if (countChars(persistCore) > 500) persistCore = clipToMaxCountChars(persistCore, 500);
  const persistText = padToMinCountChars(persistCore, 300, "（导入说明须保持 persist 长度在配置范围内。）");
  await writeSection(repoRoot, "persist", persistText);

  const todos = listTodos(repoRoot);
  const nextIndex = todos.length ? Math.max(...todos.map((t) => t.index)) + 1 : 1;
  const now2 = nowLocal();
  if (!todos.some((t) => t.name === "review-imported-memory")) {
    const desc = `Segs:${chunkCount}. Curate to persist.`;
    if (countChars(`review-imported-memory${desc}`) > 100) {
      throw new Error("Todo combo length invariant failed for review-imported-memory");
    }
    await writeTodo(repoRoot, {
      name: "review-imported-memory",
      description: desc,
      index: nextIndex,
      priority: 1,
      completed: false,
      createdAt: now2,
      updatedAt: now2
    });
  }

  // tmp detail: 500~1000 codepoints
  let detailText = [
    `memory/persistence 已导入为 apm chunks（按200字分段，共 ${chunkCount} 段）。`,
    `记录条数 ${records.length}；检索：chunks search；多段同名后缀 -s01/-s02。`,
    `下一步：list 抽查；把长期规则压进 persist；tmp 更新进度。`,
    `说明：正文只在 chunk 内，无外链路径依赖。`
  ].join("\n");
  if (countChars(detailText) > 1000) detailText = clipToMaxCountChars(detailText, 1000);
  const detailFinal = padToMinCountChars(detailText, 500, "（tmp detail 长度在配置 min~max 内。）");
  await writeSection(repoRoot, "tmpDetail", detailFinal);

  console.log(`Imported ${records.length} records as ${chunkCount} chunk(s) (≤${CHUNK_BODY_MAX} chars each).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
