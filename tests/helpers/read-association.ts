import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "500"], dir);
  await runCli(["config", "set", "--section", "persist", "--min", "1", "--max", "500"], dir);
  await runCli(["config", "set", "--section", "dynamicDetail", "--min", "1", "--max", "500"], dir);
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

export function writeKbArchiveDoc(dir: string, filename: string, body: string): void {
  mkdirSync(join(dir, ".apm", "kb", "archive"), { recursive: true });
  writeFileSync(join(dir, ".apm", "kb", "archive", filename), body, "utf8");
}
