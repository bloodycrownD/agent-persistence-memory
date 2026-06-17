import { readFileSync } from "node:fs";
import { z } from "zod";
import { nowLocal } from "../core/time";
import { applySubstringReplace } from "../core/substring-replace";
import { countChars, truncateToMaxChars } from "../core/validate";
import { formatZodError } from "../core/schema-errors";
import { renderFrontMatter, parseFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";
import { readConfig } from "./config-service";
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

/** 读取记忆段配置的上限字符数。 */
export function getSectionMax(cwd: string, section: Section): number {
  return getSectionLimits(cwd, section).max;
}

/** 生成记忆段超长报错文案（英文，与 CLI 一致）。 */
export function formatLengthError(section: Section, len: number, max: number): string {
  return `${sectionLabel(section)} content length: got ${len}, max ${max}, need ${len - max} fewer chars.`;
}

/** 生成截断警告文案（由 CLI 层输出至 stderr）。 */
export function formatTruncationWarning(section: Section, fromLen: number, max: number): string {
  return `Warning: ${sectionLabel(section)} content truncated from ${fromLen} to ${max} chars (max ${max}).`;
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

/**
 * 准备写入的正文：`truncate` 为 true 且超长时截断；否则超长抛错，否则返回原文。
 */
export function prepareSectionBody(text: string, max: number, truncate: boolean, section: Section): string {
  const len = countChars(text);
  if (truncate && len > max) {
    return truncateToMaxChars(text, max);
  }
  if (len > max) {
    throw new Error(formatLengthError(section, len, max));
  }
  return text;
}

/** 记忆段写入选项。 */
export type SectionWriteOptions = { truncate?: boolean };

/** 记忆段写入结果；发生截断时携带原始长度供调用方输出 stderr 警告。 */
export type SectionWriteResult = { truncatedFrom?: number };

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

/**
 * 写入记忆段正文；可选 `truncate` 在超长时截断至 max（调用方负责 stderr 警告）。
 */
export async function writeSection(
  cwd: string,
  section: Section,
  text: string,
  opts?: SectionWriteOptions
): Promise<SectionWriteResult> {
  const limits = getSectionLimits(cwd, section);
  const originalLen = countChars(text);
  let body: string;
  let truncatedFrom: number | undefined;

  if (opts?.truncate) {
    body = prepareSectionBody(text, limits.max, true, section);
    if (originalLen > limits.max) {
      truncatedFrom = originalLen;
    }
  } else {
    assertWithinMax(cwd, section, text);
    body = text;
  }

  const p = sectionPath(cwd, section);
  const paths = apmPaths(cwd);
  const prev = readSectionFile(p);
  const createdAt = prev.meta?.createdAt ?? nowLocal();
  const payload = renderFrontMatter({ createdAt, updatedAt: nowLocal() }, body);
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(p, async () => {
      await atomicWrite(p, payload);
    });
  });

  return truncatedFrom !== undefined ? { truncatedFrom } : {};
}

/** 在记忆段正文中替换子串后持久化（limits、锁、原子写与 writeSection 一致）。 */
export async function replaceSection(
  cwd: string,
  section: Section,
  oldText: string,
  newText: string,
  replaceAll: boolean,
  opts?: SectionWriteOptions
): Promise<SectionWriteResult> {
  const content = readSectionContent(cwd, section);
  const next = applySubstringReplace(content, oldText, newText, replaceAll);
  return writeSection(cwd, section, next, opts);
}
