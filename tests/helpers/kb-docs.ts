import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { resolveKbDocPath } from "../../src/core/kb-path";

/** 直接写入 kb/docs 下的 Markdown（替代已移除的 `apm kb write`）。 */
export function writeKbDoc(dir: string, relPath: string, body: string): void {
  const abs = resolveKbDocPath(join(dir, ".apm", "kb", "docs"), relPath);
  writeFileSync(abs, body, "utf8");
}
