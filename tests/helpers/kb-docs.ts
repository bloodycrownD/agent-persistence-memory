import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { writeFileSync } from "node:fs";

/** 规范化并校验相对 `kb/docs` 的路径（禁止穿越，必须以 `.md` 结尾）。 */
function assertSafeKbDocRelativePath(rel: string): string {
  const n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n.endsWith(".md")) {
    throw new Error(`kb doc path must end with .md: ${rel}`);
  }
  for (const seg of n.split("/")) {
    if (seg === ".." || seg === "." || seg === "") {
      throw new Error(`Invalid kb doc path: ${rel}`);
    }
  }
  return n;
}

/** 将 `rel` 解析到 `kbDocs` 下，并确保结果仍落在 `kbDocs` 内。 */
function resolveKbDocPath(kbDocs: string, rel: string): string {
  const safe = assertSafeKbDocRelativePath(rel);
  const abs = join(kbDocs, safe);
  const kbNorm = kbDocs.replace(/\\/g, "/");
  const absNorm = abs.replace(/\\/g, "/");
  const relCheck = relative(kbNorm, absNorm).replace(/\\/g, "/");
  if (relCheck.startsWith("..")) {
    throw new Error(`Invalid kb doc path (escapes kb/docs): ${rel}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

/** 直接写入 kb/docs 下的 Markdown（替代已移除的 `apm kb write`）。 */
export function writeKbDoc(dir: string, relPath: string, body: string): void {
  const abs = resolveKbDocPath(join(dir, ".apm", "kb", "docs"), relPath);
  writeFileSync(abs, body, "utf8");
}
