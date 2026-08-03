import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { writeFileSync } from "node:fs";

/** 规范化并校验相对 `docs/` 的路径（禁止穿越，必须以 `.md` 结尾）。 */
function assertSafeDocRelativePath(rel: string): string {
  const n = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!n.endsWith(".md")) {
    throw new Error(`doc path must end with .md: ${rel}`);
  }
  for (const seg of n.split("/")) {
    if (seg === ".." || seg === "." || seg === "") {
      throw new Error(`Invalid doc path: ${rel}`);
    }
  }
  return n;
}

/** 将 `rel` 解析到项目根 `docs/` 下，并确保结果仍落在 `docs/` 内。 */
function resolveDocPath(docsDir: string, rel: string): string {
  const safe = assertSafeDocRelativePath(rel);
  const abs = join(docsDir, safe);
  const docsNorm = docsDir.replace(/\\/g, "/");
  const absNorm = abs.replace(/\\/g, "/");
  const relCheck = relative(docsNorm, absNorm).replace(/\\/g, "/");
  if (relCheck.startsWith("..")) {
    throw new Error(`Invalid doc path (escapes docs): ${rel}`);
  }
  mkdirSync(dirname(abs), { recursive: true });
  return abs;
}

/** 直接写入项目根 `docs/` 下的 Markdown。 */
export function writeKbDoc(dir: string, relPath: string, body: string): void {
  const abs = resolveDocPath(join(dir, "docs"), relPath);
  writeFileSync(abs, body, "utf8");
}
