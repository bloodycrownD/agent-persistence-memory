import { readFileSync } from "node:fs";
import { z } from "zod";
import { nowLocal } from "../core/time";
import { countChars, validateRange } from "../core/validate";
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

function enforceLimits(cwd: string, section: Section, text: string): void {
  const cfg = readConfig(cwd);
  const limits: Limits =
    section === "role"
      ? cfg.limits.role
      : section === "persist"
        ? cfg.limits.persist
        : section === "dynamicDetail"
          ? cfg.limits.dynamicDetail
          : cfg.limits.kbDynamicDetail;
  const len = countChars(text);
  if (len < limits.min || len > limits.max) {
    throw new Error(`${sectionLabel(section)} content length must be ${limits.min}~${limits.max} chars.`);
  }
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

export async function writeSection(cwd: string, section: Section, text: string): Promise<void> {
  enforceLimits(cwd, section, text);
  const p = sectionPath(cwd, section);
  const paths = apmPaths(cwd);
  const prev = readSectionFile(p);
  const createdAt = prev.meta?.createdAt ?? nowLocal();
  const payload = renderFrontMatter({ createdAt, updatedAt: nowLocal() }, text);
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(p, async () => {
      await atomicWrite(p, payload);
    });
  });
}

export async function editSection(cwd: string, section: Section, start: number, end: number, text: string): Promise<void> {
  const p = sectionPath(cwd, section);
  const lines = readSectionFile(p).content.split("\n");
  validateRange(lines, start, end);
  lines.splice(start - 1, end - start + 1, ...text.split("\n"));
  await writeSection(cwd, section, lines.join("\n"));
}
