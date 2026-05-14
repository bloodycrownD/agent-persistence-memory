import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** Normalize and validate a path relative to `kb/docs` (no traversal, must end with `.md`). */
export function assertSafeKbDocRelativePath(rel: string): string {
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

/** Resolve `rel` under `kbDocs` and ensure the result stays inside `kbDocs`. */
export function resolveKbDocPath(kbDocs: string, rel: string): string {
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
