import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { ensureApm } from "../src/storage/paths";
import { nowLocal } from "../src/core/time";
import { writeSection } from "../src/services/sections-service";
import { listTodos, writeTodo } from "../src/services/todos-service";
import { listChunks, writeChunk } from "../src/services/chunks-service";

type MemoryRecord = {
  sourcePath: string;
  title: string;
  keywords: string[];
  content: string;
};

function safeChunkName(base: string): string {
  // Keep only [a-z0-9-_], collapse repeats, trim.
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
  // Prefer backticked keywords from lines like: 关键词：`a` `b`
  const line = md.split("\n").find((l) => l.includes("关键词"));
  if (line) {
    const ticks = Array.from(line.matchAll(/`([^`]+)`/g)).map((m) => m[1].trim());
    if (ticks.length) return ticks.slice(0, 10);
    // fallback: comma-separated after colon
    const after = line.split("：")[1] ?? line.split(":")[1];
    if (after) {
      return after
        .split(/[,，\s]+/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
    }
  }
  // Fallback: infer from obvious tokens
  const inferred: string[] = [];
  if (/VFS/i.test(md)) inferred.push("VFS");
  if (/SillyTavern/i.test(md)) inferred.push("SillyTavern");
  if (/CSS/i.test(md)) inferred.push("CSS");
  if (/UI/i.test(md)) inferred.push("UI");
  return inferred.slice(0, 10);
}

function parsePersistenceIndexLinks(indexMd: string): string[] {
  // Capture markdown links to ./<date>/records/<file>.md
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

  // Write chunks
  const now = nowLocal();
  let imported = 0;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const date = (r.sourcePath.match(/\\memory\\persistence\\(\d{8})\\records\\/i) ||
      r.sourcePath.match(/\/memory\/persistence\/(\d{8})\/records\//i))?.[1];
    const base = safeChunkName(`${date ?? "unknown"}-${r.title}`) || `mem-${date ?? "unknown"}-${i + 1}`;
    let name = base;
    let suffix = 2;
    while (existingChunkNames.has(name)) {
      name = `${base}-${suffix++}`;
    }

    const header = [
      `# Imported Memory`,
      `- title: ${r.title}`,
      `- source: ${relative(repoRoot, r.sourcePath)}`,
      r.keywords.length ? `- keywords: ${r.keywords.join(", ")}` : `- keywords: (none)`,
      "",
      r.content
    ].join("\n");

    await writeChunk(repoRoot, {
      name,
      keywords: r.keywords,
      createdAt: now,
      updatedAt: now,
      content: header
    });

    existingChunkNames.add(name);
    imported++;
  }

  // Persist: keep within 300~500 chars-ish; write a concise navigation pointer.
  // Keep this within persist default limit (300~500 chars).
  const persistText =
    `已将 memory/persistence 记录导入到 .apm/chunks（${imported} 条），每条包含来源路径、标题与关键词，便于后续检索与回溯。` +
    `原始索引仍在 memory/persistence/index.md（按日期归档，含关键词/摘要/入口）。` +
    `检索方式：apm chunks search（field=keywords/content/name）。` +
    `维护约定：长期稳定的规则/决策写入 apm persist；阶段任务写入 apm tmp todos；执行进度/阻塞/下一步写入 apm tmp detail；可复用的技术结论沉淀为 apm chunks 并补 keywords。` +
    `目标：清空上下文后，通过 apm read 快速恢复当前工作。`;
  await writeSection(repoRoot, "persist", persistText);

  // Add a todo to review imported memory
  const todos = listTodos(repoRoot);
  const nextIndex = todos.length ? Math.max(...todos.map((t) => t.index)) + 1 : 1;
  const now2 = nowLocal();
  if (!todos.some((t) => t.name === "review-imported-memory")) {
    await writeTodo(repoRoot, {
      name: "review-imported-memory",
      description: `Review imported memory chunks (${imported}) and pin key rules into persist.`,
      index: nextIndex,
      priority: 1,
      completed: false,
      createdAt: now2,
      updatedAt: now2
    });
  }

  // Detail: keep within tmpDetail default limit (500~1000 chars).
  let detailText = [
      `Imported memory/persistence records into apm chunks.`,
      `Imported count: ${imported}`,
      ``,
      `What was done:`,
      `- Parsed memory/persistence/index.md and followed record links.`,
      `- For each record, created a chunk with safe ASCII name, preserved original title/source path, and kept full content for later retrieval.`,
      `- Wrote a concise persist note to explain the relationship between memory/ and .apm/.`,
      ``,
      `Why:`,
      `- After context resets, the agent can resume work via apm read, and retrieve long-form prior decisions via chunks search/read.`,
      `- This reduces reliance on the memory/ folder being manually searched by humans.`,
      ``,
      `Next steps (manual verification):`,
      `1) Run: apm chunks list and spot-check a few imported items.`,
      `2) Run: apm chunks search --q VFS --field content (and keywords) to ensure recall works.`,
      `3) Curate: move truly durable rules into apm persist (keep within its limits).`,
      `4) Convert near-term work into tmp todos and keep tmp detail updated as progress changes.`,
      ``,
      `Notes:`,
      `- Chunk names are sanitized (ASCII only) to satisfy apm safe-name rules; the original Chinese titles remain in chunk body.`,
      `- If a record changes later, re-run this import or update the specific chunk via apm chunks edit.`,
      ``,
      `Suggested curation heuristics:`,
      `- Repeatable rule/decision (mount lifecycle, error format, sanitize policy): summarize into apm persist in 1-3 bullets.`,
      `- Troubleshooting postmortem: keep full details in chunks; persist only root cause + fix signature + quick checklist.`,
      `- Handoff note: persist “doc locations + next steps”; keep the rest in chunks.`,
      ``,
      `Recovery workflow example (after a session reset):`,
      `- Run apm read (or apm read --json) to restore role/persist/todos/detail context.`,
      `- Search chunks by keywords related to the active todo; read the top 1-3 chunks for detailed background.`,
      `- Update tmp detail immediately with the plan and mark progress as you proceed.`,
      ``,
      `Verification checklist (quick):`,
      `- apm chunks list: count looks reasonable and names are unique.`,
      `- apm chunks search: try q=VFS/UI/CSS/SillyTavern and confirm results show up.`,
      `- apm chunks read: open at least one imported chunk and confirm it includes source path + original title.`,
      `- apm persist show: confirm the persist navigation note exists and is within the configured length limits.`,
      ``,
      `If anything looks off:`,
      `- Re-run the importer after adjusting parsing rules (keywords/title/slug).`,
      `- Remove a broken chunk via apm chunks rm and re-import, or patch it via apm chunks edit.`,
      `- Keep persist minimal and move long explanations to chunks; persist should be a compact, durable “operating manual”.`,
      ``,
      `Extra context (why this matters):`,
      `This repo aims to make agent memory explicit and inspectable. The old memory/ folder is useful for humans, but agents tend to work better when the memory is normalized into a consistent schema (role/persist/todos/detail/chunks) and can be retrieved with narrow commands (search/read) rather than scanning directories. This import is intentionally lossless for content (we keep the full markdown) while making it discoverable through keywords and a stable CLI interface.`
    ].join("\n")
    .trim();
  if (detailText.length > 980) {
    detailText = detailText.slice(0, 980);
  }
  while (detailText.length < 520) {
    detailText += "\n(keep this note within 500~1000 chars)";
  }
  await writeSection(repoRoot, "tmpDetail", detailText);

  // Summary to stdout
  // eslint-disable-next-line no-console
  console.log(`Imported ${imported} records into .apm/chunks.`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

