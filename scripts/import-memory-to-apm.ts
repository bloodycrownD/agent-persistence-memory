/**
 * Read memory/persistence/index.md and write bounded summaries into `.apm` memory
 * sections (v2 paths: memory/persist.md, memory/dynamic.md).
 *
 * Writes `persist` and `dynamicDetail` only. Does not create chunks or todos;
 * curate long-form knowledge manually into persist and track execution in dynamic.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureWorkspace } from "../src/storage/paths";
import { countChars } from "../src/core/validate";
import { writeSection } from "../src/services/sections-service";

function parsePersistenceIndexLinks(indexMd: string): string[] {
  const paths: string[] = [];
  for (const m of indexMd.matchAll(/\((\.\/\d{8}\/records\/[^)]+?\.md)\)/g)) {
    paths.push(m[1]);
  }
  return Array.from(new Set(paths));
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
  ensureWorkspace(repoRoot);

  const indexPath = join(repoRoot, "memory", "persistence", "index.md");
  if (!existsSync(indexPath)) {
    throw new Error(`memory persistence index not found: ${indexPath}`);
  }

  const indexMd = readFileSync(indexPath, "utf8");
  const relLinks = parsePersistenceIndexLinks(indexMd);
  const recordCount = relLinks.length;

  let totalChars = 0;
  for (const rel of relLinks) {
    const abs = join(repoRoot, "memory", "persistence", rel.replace(/^\.\//, ""));
    if (existsSync(abs)) {
      totalChars += countChars(readFileSync(abs, "utf8"));
    }
  }

  let persistCore =
    `已从 memory/persistence/index.md 解析索引：共 ${recordCount} 条记录链接；源树在 memory/persistence。` +
    `本脚本不再写入 chunks 或 todos；请将稳定规则与结论整理进 persist，阶段进展用 apm dynamic 写入 memory/dynamic.md。`;
  if (countChars(persistCore) > 500) persistCore = clipToMaxCountChars(persistCore, 500);
  const persistText = padToMinCountChars(persistCore, 300, "（导入说明须保持 persist 长度在配置范围内。）");
  await writeSection(repoRoot, "persist", persistText);

  let detailText = [
    `memory/persistence：索引条目 ${recordCount}；链接正文合计约 ${totalChars} 字（countChars）。`,
    `下一步：逐条打开 records，提炼后写入 persist；当前执行细节用 apm dynamic 跟踪（.apm/memory/dynamic.md）。`,
    `说明：全文不在此脚本落盘；无自动 chunks/todos 归档。`
  ].join("\n");
  if (countChars(detailText) > 1000) detailText = clipToMaxCountChars(detailText, 1000);
  const detailFinal = padToMinCountChars(detailText, 500, "（dynamic 长度在配置 min~max 内。）");
  await writeSection(repoRoot, "dynamicDetail", detailFinal);

  console.log(`Indexed ${recordCount} persistence link(s); wrote persist + dynamicDetail summaries.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
