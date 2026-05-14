import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

function dynamicArchiveBasename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `dynamic-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.md`;
}

/** Copy full `memory/dynamic.md` (including front matter) into `memory/archive/` under a timestamped name. */
export async function archiveMemoryDynamic(cwd: string): Promise<string> {
  const paths = apmPaths(cwd);
  const dest = join(paths.memoryArchiveDir, dynamicArchiveBasename());
  await withGlobalLock(paths.lock, async () => {
    const body = readFileSync(paths.memoryDynamic, "utf8");
    await serialWrite(dest, async () => {
      await atomicWrite(dest, body);
    });
  });
  return dest;
}

/** Reset `memory/dynamic.md` to the same empty section template used at workspace init. */
export async function clearMemoryDynamic(cwd: string): Promise<void> {
  const paths = apmPaths(cwd);
  const now = nowLocal();
  const emptySection = renderFrontMatter({ createdAt: now, updatedAt: now }, "");
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(paths.memoryDynamic, async () => {
      await atomicWrite(paths.memoryDynamic, emptySection);
    });
  });
}

export function countMemoryArchiveFiles(cwd: string): number {
  const dir = apmPaths(cwd).memoryArchiveDir;
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).length;
}
