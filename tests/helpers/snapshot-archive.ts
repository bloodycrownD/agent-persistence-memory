import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** 分层 archive 快照路径：archive/yyyy/MM/dd/{role|persist|dynamic}/HHmmssSSS.md */
export const LAYERED_SNAPSHOT_REL_RE =
  /^archive\/\d{4}\/\d{2}\/\d{2}\/(role|persist|dynamic)\/\d{9}\.md$/;

/** 递归收集目录下全部 .md 绝对路径。 */
export function collectMdFilesRecursive(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMdFilesRecursive(full));
    } else if (entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** 列出 kb/archive 下符合分层路径规则的快照（相对 kb/）。 */
export function listLayeredSnapshotRels(kbRoot: string): string[] {
  const archiveRoot = join(kbRoot, "archive");
  return collectMdFilesRecursive(archiveRoot)
    .map((abs) => relative(kbRoot, abs).replace(/\\/g, "/"))
    .filter((rel) => LAYERED_SNAPSHOT_REL_RE.test(rel))
    .sort();
}

/** 按 mtime 返回最新的分层快照绝对路径。 */
export function latestLayeredSnapshotAbs(kbRoot: string, sectionDir?: "role" | "persist" | "dynamic"): string | undefined {
  const archiveRoot = join(kbRoot, "archive");
  const files = collectMdFilesRecursive(archiveRoot)
    .map((abs) => ({
      abs,
      rel: relative(kbRoot, abs).replace(/\\/g, "/"),
      mtime: statSync(abs).mtimeMs
    }))
    .filter(({ rel }) => LAYERED_SNAPSHOT_REL_RE.test(rel))
    .filter(({ rel }) => !sectionDir || rel.includes(`/${sectionDir}/`));
  if (files.length === 0) return undefined;
  files.sort((a, b) => b.mtime - a.mtime);
  return files[0]!.abs;
}

/** 统计分层 archive 快照数量，可按段目录过滤。 */
export function countLayeredSnapshots(kbRoot: string, sectionDir?: "role" | "persist" | "dynamic"): number {
  return listLayeredSnapshotRels(kbRoot).filter((rel) => !sectionDir || rel.includes(`/${sectionDir}/`)).length;
}

/** 读取 memory 段目标文件全文。 */
export function readMemorySectionFile(dir: string, section: "role" | "persist" | "dynamic"): string {
  const name = section === "dynamic" ? "dynamic.md" : `${section}.md`;
  return readFileSync(join(dir, ".apm", "memory", name), "utf8");
}
