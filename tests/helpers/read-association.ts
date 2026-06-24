import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderFrontMatter } from "../../src/storage/markdown";
import { runCli } from "./cli-harness";

export function assocPercentHeaders(out: string): string[] {
  return out.match(/^\[\d+%\].+$/gm) ?? [];
}

export function assocPercentValues(out: string): number[] {
  return assocPercentHeaders(out).map((h) => Number(h.match(/\[(\d+)%\]/)?.[1] ?? -1));
}

export function assocEntryBlocks(out: string): string[] {
  const assoc = out.includes("# 联想区") ? out.slice(out.indexOf("# 联想区") + "# 联想区".length) : out;
  return assoc
    .trim()
    .split(/\n\n+/)
    .filter((b) => /^\[\d+%\]/.test(b));
}

export async function setupAssocWorkspace(dir: string): Promise<void> {
  await runCli(["init"], dir);
  await runCli(["config", "set", "--section", "role", "--max", "500"], dir);
  await runCli(["config", "set", "--section", "persist", "--max", "500"], dir);
  await runCli(["config", "set", "--section", "dynamicDetail", "--max", "500"], dir);
}

export function removeKbDocsReadme(dir: string): void {
  rmSync(join(dir, ".apm", "kb", "docs", "README.md"), { force: true });
}

export function neutralizeKbDynamicDetail(dir: string): void {
  writeFileSync(
    join(dir, ".apm", "kb", "dynamic", "detail.md"),
    ['---', 'createdAt: "2020-01-01 00:00:00"', 'updatedAt: "2020-01-01 00:00:00"', "---", ""].join("\n"),
    "utf8"
  );
}

export function trimKbIndexFixtures(dir: string): void {
  removeKbDocsReadme(dir);
  neutralizeKbDynamicDetail(dir);
}

/** 直接写入 memory 段正文（不经过 CLI write，不产生 archive 快照）。 */
export function seedMemorySection(
  dir: string,
  section: "role" | "persist" | "dynamic",
  body: string
): void {
  const file = section === "role" ? "role.md" : section === "persist" ? "persist.md" : "dynamic.md";
  const meta = { createdAt: "2026-01-01 00:00:00", updatedAt: "2026-01-01 00:00:00" };
  writeFileSync(join(dir, ".apm", "memory", file), renderFrontMatter(meta, body), "utf8");
}

export function writeKbArchiveDoc(dir: string, filename: string, body: string): void {
  mkdirSync(join(dir, ".apm", "kb", "archive"), { recursive: true });
  writeFileSync(join(dir, ".apm", "kb", "archive", filename), body, "utf8");
}
