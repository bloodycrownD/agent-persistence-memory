import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  buildMemorySnapshotArchiveRelPath,
  isMemorySnapshotSection
} from "../core/memory-snapshot-path";
import { nowLocal } from "../core/time";
import { applySubstringReplace } from "../core/substring-replace";
import { countChars } from "../core/validate";
import { formatZodError } from "../core/schema-errors";
import { renderFrontMatter, parseFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";
import { readConfig } from "./config-service";
import { resolveKbIndexedPath } from "./kb-index-service";
import type { Limits, Section } from "../schemas/config";

function sectionPath(cwd: string, section: Section): string {
  const p = apmPaths(cwd);
  if (section === "role") return p.memoryRole;
  if (section === "persist") return p.memoryPersist;
  if (section === "dynamicDetail") return p.memoryDynamic;
  return p.kbDynamicDetail;
}

function sectionLabel(section: Section): string {
  if (section === "dynamicDetail") return "dynamic";
  if (section === "kbDynamicDetail") return "kb dynamic";
  return section;
}

function getSectionLimits(cwd: string, section: Section): Limits {
  const cfg = readConfig(cwd);
  if (section === "role") return cfg.limits.role;
  if (section === "persist") return cfg.limits.persist;
  if (section === "dynamicDetail") return cfg.limits.dynamicDetail;
  return cfg.limits.kbDynamicDetail;
}

/** 生成记忆段超长报错文案（英文，与 CLI 一致）。 */
export function formatLengthError(section: Section, len: number, max: number): string {
  return `${sectionLabel(section)} content length: got ${len}, max ${max}, need ${len - max} fewer chars.`;
}

function assertWithinMax(cwd: string, section: Section, text: string): void {
  const limits = getSectionLimits(cwd, section);
  const len = countChars(text);
  if (len > limits.max) {
    throw new Error(formatLengthError(section, len, limits.max));
  }
}

/**
 * 校验记忆段正文长度（仅上限）；通过时返回长度与上限，超长则抛错。
 */
export function validateSectionContent(
  cwd: string,
  section: Section,
  text: string
): { len: number; max: number } {
  const limits = getSectionLimits(cwd, section);
  const len = countChars(text);
  if (len > limits.max) {
    throw new Error(formatLengthError(section, len, limits.max));
  }
  return { len, max: limits.max };
}

type SectionMeta = { createdAt: string; updatedAt: string };
const LOCAL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const SectionMetaSchema = z
  .object({
    createdAt: z.string().regex(LOCAL_TIMESTAMP_RE, "must match YYYY-MM-DD HH:mm:ss (system local timezone)"),
    updatedAt: z.string().regex(LOCAL_TIMESTAMP_RE, "must match YYYY-MM-DD HH:mm:ss (system local timezone)")
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

export function readSectionContent(cwd: string, section: Section): string {
  const p = sectionPath(cwd, section);
  return readSectionFile(p).content;
}

/** 写入记忆段正文；超长时抛错，不落盘。 */
export async function writeSection(cwd: string, section: Section, text: string): Promise<void> {
  assertWithinMax(cwd, section, text);

  const p = sectionPath(cwd, section);
  const paths = apmPaths(cwd);
  const prev = readSectionFile(p);
  const createdAt = prev.meta?.createdAt ?? nowLocal();
  const payload = renderFrontMatter({ createdAt, updatedAt: nowLocal() }, text);
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(p, async () => {
      await atomicWrite(p, payload);
    });
    if (isMemorySnapshotSection(section)) {
      const rel = buildMemorySnapshotArchiveRelPath(section);
      const snapshotAbs = resolveKbIndexedPath(paths.kbRoot, rel);
      mkdirSync(dirname(snapshotAbs), { recursive: true });
      await serialWrite(snapshotAbs, async () => {
        await atomicWrite(snapshotAbs, payload);
      });
    }
  });
}

/** 在记忆段正文中替换子串后持久化（limits、锁、原子写与 writeSection 一致）。 */
export async function replaceSection(
  cwd: string,
  section: Section,
  oldText: string,
  newText: string,
  replaceAll: boolean
): Promise<void> {
  const content = readSectionContent(cwd, section);
  const next = applySubstringReplace(content, oldText, newText, replaceAll);
  await writeSection(cwd, section, next);
}
