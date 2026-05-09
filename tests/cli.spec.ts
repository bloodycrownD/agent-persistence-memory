import { mkdtempSync, rmSync } from "node:fs";
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
  it("enforces role limits via config and renders line numbers", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "10"], dir);
    await runCli(["role", "write", "--text", "abcdef"], dir);
    const shown = await runCli(["role", "show"], dir);
    expect(shown.out).toContain("1|abcdef");
  });

  it("supports tmp todos add/list/complete with uniqueness", async () => {
    const dir = newTempDir();
    await runCli(["tmp", "todos", "add", "--name", "t1", "--description", "hello", "--index", "1"], dir);
    await runCli(
      ["tmp", "todos", "add", "--name", "t2", "--description", "world", "--index", "2", "--priority", "1"],
      dir
    );
    const listed = await runCli(["tmp", "todos", "list"], dir);
    expect(listed.out).toContain("t2");
    expect(listed.out).toContain("t1");
    await runCli(["tmp", "todos", "complete", "--index", "1"], dir);
    const shown = await runCli(["tmp", "todos", "show"], dir);
    expect(shown.out).toContain("[x]");
  });

  it("supports chunks add/list/search/read", async () => {
    const dir = newTempDir();
    await runCli(["chunks", "add", "--name", "c1", "--keywords", "alpha,beta", "--text", "first content"], dir);
    await runCli(["chunks", "add", "--name", "c2", "--keywords", "gamma", "--text", "second content"], dir);
    const listed = await runCli(["chunks", "list", "--sort", "name", "--order", "asc"], dir);
    expect(listed.out).toContain("c1");
    expect(listed.out).toContain("c2");
    const searched = await runCli(["chunks", "search", "--q", "alp", "--field", "keywords", "--match", "prefix"], dir);
    expect(searched.out.trim()).toBe("c1");
    const read = await runCli(["chunks", "read", "--names", "c1,c2"], dir);
    expect(read.out).toContain("## c1");
    expect(read.out).toContain("## c2");
  });

  it("renders read --json with current task", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["config", "set", "--section", "persist", "--min", "1", "--max", "100"], dir);
    await runCli(["config", "set", "--section", "tmpDetail", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "my role"], dir);
    await runCli(["persist", "write", "--text", "my persist"], dir);
    await runCli(["tmp", "detail", "write", "--text", "detail text"], dir);
    await runCli(["tmp", "todos", "add", "--name", "todoA", "--description", "desc", "--index", "1", "--priority", "1"], dir);
    const result = await runCli(["read", "--json"], dir);
    const parsed = JSON.parse(result.out);
    expect(parsed.role).toBe("my role");
    expect(parsed.currentTask).toContain("todoA");
    expect(Array.isArray(parsed.chunks)).toBe(true);
  });
});

