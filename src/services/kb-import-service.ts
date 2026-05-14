import { dirname, isAbsolute, join, relative } from "node:path";
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { apmPaths, ensureWorkspace } from "../storage/paths";

function walkCopyMarkdown(srcRoot: string, dir: string, kbDocs: string): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkCopyMarkdown(srcRoot, abs, kbDocs);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      const rel = relative(srcRoot, abs).replace(/\\/g, "/");
      if (rel.startsWith("..") || rel.includes("/../")) {
        throw new Error(`Unsafe import path: ${rel}`);
      }
      const dest = join(kbDocs, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(abs, dest);
    }
  }
}

/** Copy all `.md` files from a source tree into `.apm/kb/docs`, preserving relative paths. */
export function importKbMarkdownFromDir(cwd: string, fromDir: string): void {
  ensureWorkspace(cwd);
  const resolved = isAbsolute(fromDir) ? fromDir : join(cwd, fromDir);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`kb import --from must be an existing directory (resolved: ${resolved})`);
  }
  walkCopyMarkdown(resolved, resolved, apmPaths(cwd).kbDocs);
}
