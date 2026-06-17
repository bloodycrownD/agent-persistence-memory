import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";
import { readSectionContent, writeSection, type SectionWriteOptions, type SectionWriteResult } from "./sections-service";

function dynamicArchiveBasename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `dynamic-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.md`;
}

/** Copy full `memory/dynamic.md` (including front matter) into `kb/archive/` under a timestamped name. */
export async function archiveMemoryDynamic(cwd: string): Promise<string> {
  const paths = apmPaths(cwd);
  const dest = join(paths.kbArchiveDir, dynamicArchiveBasename());
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

/** True when dynamic section body (front matter stripped) has non-whitespace content. */
export function memoryDynamicBodyNonEmpty(cwd: string): boolean {
  return readSectionContent(cwd, "dynamicDetail").trim().length > 0;
}

/**
 * dynamic write：非空时先归档，再清空或覆盖写入；`truncate` 透传至 writeSection。
 * 索引重建由 CLI 层在本函数返回后处理。
 */
export async function writeDynamicSection(
  cwd: string,
  text: string,
  opts?: SectionWriteOptions
): Promise<SectionWriteResult> {
  if (memoryDynamicBodyNonEmpty(cwd)) {
    await archiveMemoryDynamic(cwd);
  }
  if (text.length === 0) {
    await clearMemoryDynamic(cwd);
    return {};
  }
  return writeSection(cwd, "dynamicDetail", text, opts);
}

export function countMemoryArchiveFiles(cwd: string): number {
  const dir = apmPaths(cwd).kbArchiveDir;
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).length;
}
