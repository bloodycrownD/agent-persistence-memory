import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  buildMemorySnapshotArchiveRelPath,
  isMemorySnapshotSection
} from "../core/memory-snapshot-path";
import { extractMarkdownBodyRelaxed } from "../core/markdown-body";
import { nowLocal } from "../core/time";
import { formatZodError } from "../core/schema-errors";
import { renderFrontMatter, parseFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";
import { LOCAL_TIMESTAMP_MESSAGE, LOCAL_TIMESTAMP_RE } from "../schemas/local-timestamp";
import type { Section } from "../schemas/config";

function sectionPath(cwd: string, section: Section): string {
  const p = apmPaths(cwd);
  if (section === "role") return p.memoryRole;
  if (section === "persist") return p.memoryPersist;
  return p.memoryDynamic;
}

type SectionMeta = { createdAt: string; updatedAt: string };
const SectionMetaSchema = z
  .object({
    createdAt: z.string().regex(LOCAL_TIMESTAMP_RE, LOCAL_TIMESTAMP_MESSAGE),
    updatedAt: z.string().regex(LOCAL_TIMESTAMP_RE, LOCAL_TIMESTAMP_MESSAGE)
  })
  .strict();

function readSectionFile(path: string): { meta: SectionMeta | null; content: string } {
  const raw = readFileSync(path, "utf8");
  let parsed: { meta: unknown; content: string };
  try {
    parsed = parseFrontMatter(raw);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Invalid section front matter: ${path}\n${message}\nExpected shape hint:\n---\ncreatedAt: "YYYY-MM-DD HH:mm:ss"\nupdatedAt: "YYYY-MM-DD HH:mm:ss"\n---\n<content>`
    );
  }
  try {
    const meta = SectionMetaSchema.parse(parsed.meta);
    return { meta: { createdAt: meta.createdAt, updatedAt: meta.updatedAt }, content: parsed.content };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(
        formatZodError({
          filePath: path,
          label: "section front matter",
          error: e,
          expectedShapeHint: `---\ncreatedAt: \"YYYY-MM-DD HH:mm:ss\"\nupdatedAt: \"YYYY-MM-DD HH:mm:ss\"\n---\n<content>`
        })
      );
    }
    throw e;
  }
}

/**
 * 写路径读取：严格 FM 成功则保留 createdAt；损坏/缺失 FM 时用宽松正文策略，createdAt 回退 nowLocal。
 */
function readSectionCreatedAtForWrite(path: string): string {
  try {
    const prev = readSectionFile(path);
    return prev.meta?.createdAt ?? nowLocal();
  } catch {
    return nowLocal();
  }
}

export function readSectionContent(cwd: string, section: Section): string {
  const p = sectionPath(cwd, section);
  return readSectionFile(p).content;
}

/**
 * 宽松读取记忆段正文（不校验 front matter）；`show` 仍应使用 {@link readSectionContent}。
 */
export function readSectionContentRelaxed(cwd: string, section: Section): string {
  const p = sectionPath(cwd, section);
  const raw = readFileSync(p, "utf8");
  return extractMarkdownBodyRelaxed(raw);
}

export type WriteSectionOptions = {
  /** 是否写入 archive 快照；默认 false；仅 CLI write 显式传 true。 */
  snapshot?: boolean;
};

/** 写入记忆段正文；损坏/缺失 front matter 时自愈写出合法 FM。 */
export async function writeSection(
  cwd: string,
  section: Section,
  text: string,
  opts: WriteSectionOptions = {}
): Promise<void> {
  const p = sectionPath(cwd, section);
  const paths = apmPaths(cwd);
  const createdAt = readSectionCreatedAtForWrite(p);
  const payload = renderFrontMatter({ createdAt, updatedAt: nowLocal() }, text);
  const snapshot = opts.snapshot ?? false;
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(p, async () => {
      await atomicWrite(p, payload);
    });
    if (snapshot && isMemorySnapshotSection(section)) {
      const rel = buildMemorySnapshotArchiveRelPath(section);
      const snapshotAbs = join(paths.archiveDir, rel);
      mkdirSync(dirname(snapshotAbs), { recursive: true });
      await serialWrite(snapshotAbs, async () => {
        await atomicWrite(snapshotAbs, payload);
      });
    }
  });
}
