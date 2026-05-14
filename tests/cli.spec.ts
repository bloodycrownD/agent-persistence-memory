import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "../src/index";

const tempDirs: string[] = [];

async function runCli(args: string[], cwd: string): Promise<{ out: string; err: string }> {
  const prev = process.cwd();
  const out: string[] = [];
  const err: string[] = [];
  const oldLog = console.log;
  const oldErr = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => err.push(a.join(" "));
  process.chdir(cwd);
  try {
    const program = buildProgram();
    await program.parseAsync(["node", "apm", ...args], { from: "node" });
    return { out: out.join("\n"), err: err.join("\n") };
  } finally {
    process.chdir(prev);
    console.log = oldLog;
    console.error = oldErr;
  }
}

async function runCliFail(args: string[], cwd: string): Promise<string> {
  try {
    await runCli(args, cwd);
    throw new Error("Expected command to fail.");
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function newTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apm-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("apm cli spec paths", () => {
  it("registers dynamic but not tmp or chunks", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("dynamic");
    expect(names).not.toContain("tmp");
    expect(names).not.toContain("chunks");
  });

  it("ensureApm creates only dynamic detail path (no tmp/chunks dirs)", async () => {
    const dir = newTempDir();
    await runCli(["dynamic", "show"], dir);
    expect(existsSync(join(dir, ".apm", "dynamic", "detail.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "tmp"))).toBe(false);
    expect(existsSync(join(dir, ".apm", "chunks"))).toBe(false);
  });

  it("enforces role limits via config and renders line numbers", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "10"], dir);
    await runCli(["role", "write", "--text", "abcdef"], dir);
    const shown = await runCli(["role", "show"], dir);
    expect(shown.out).toContain("1|abcdef");
    const roleFile = readFileSync(join(dir, ".apm", "role.md"), "utf8");
    expect(roleFile.startsWith("---\n")).toBe(true);
  });

  it("enforces dynamicDetail limits via config and supports dynamic show/detail", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "dynamicDetail", "--min", "10", "--max", "80"], dir);
    const body = "x".repeat(10);
    await runCli(["dynamic", "detail", "write", "--text", body], dir);
    const shown = await runCli(["dynamic", "detail", "show"], dir);
    expect(shown.out).toContain(`1|${body}`);
    const viaShow = await runCli(["dynamic", "show"], dir);
    expect(viaShow.out).toContain(`1|${body}`);
  });

  it("read command is under development (placeholder)", async () => {
    const dir = newTempDir();
    const plain = await runCli(["read"], dir);
    expect(plain.out.trim()).toBe("开发中");
    const withJson = await runCli(["read", "--json"], dir);
    expect(withJson.out.trim()).toBe("开发中");
  });

  it("validates edit --start/--end numeric inputs with clear errors", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "hello\nworld"], dir);
    expect(await runCliFail(["role", "edit", "--start", "NaN", "--end", "1", "--text", "x"], dir)).toContain(
      "Invalid --start"
    );
    expect(await runCliFail(["role", "edit", "--start", "0", "--end", "1", "--text", "x"], dir)).toContain(
      "Invalid --start"
    );
    expect(await runCliFail(["role", "edit", "--start", "1.2", "--end", "1", "--text", "x"], dir)).toContain(
      "Invalid --start"
    );
    expect(await runCliFail(["role", "edit", "--start", "1", "--end", "Infinity", "--text", "x"], dir)).toContain(
      "Invalid --end"
    );
  });

  it("rejects raw section files without mandatory front matter", async () => {
    const dir = newTempDir();
    await runCli(["role", "show"], dir);
    writeFileSync(join(dir, ".apm", "role.md"), "raw text without front matter", "utf8");
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toContain("Invalid section front matter");
    expect(message).toContain("role.md");
  });

  it("validates section front matter schema for required local timestamp format", async () => {
    const dir = newTempDir();
    await runCli(["role", "show"], dir);
    writeFileSync(
      join(dir, ".apm", "role.md"),
      ['---', 'createdAt: "bad-time"', 'updatedAt: "2026-01-01 10:00:00"', "---", "hello"].join("\n"),
      "utf8"
    );
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toContain("Invalid section front matter");
    expect(message).toContain("createdAt");
    expect(message).toContain("YYYY-MM-DD HH:mm:ss");
  });
});
