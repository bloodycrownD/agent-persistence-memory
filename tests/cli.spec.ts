import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

describe("apm cli v2 layout", () => {
  it("T1: init creates full v2 tree", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    expect(existsSync(join(dir, ".apm", "memory", "role.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "memory", "persist.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "memory", "dynamic.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "memory", "archive"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "kb", "docs"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "kb", "dynamic", "detail.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "kb", "index"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "kb", "index", "search.json.gz"))).toBe(false);
  });

  it("T2: legacy layout is rejected with guidance", async () => {
    const dir = newTempDir();
    mkdirSync(join(dir, ".apm", "persistence"), { recursive: true });
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toMatch(/Old \.apm layout|old \.apm layout/i);
    expect(message).toMatch(/apm init/i);
  });

  it("T2b: legacy .apm/dynamic tree is rejected", async () => {
    const dir = newTempDir();
    mkdirSync(join(dir, ".apm", "dynamic"), { recursive: true });
    writeFileSync(join(dir, ".apm", "dynamic", "detail.md"), "---\n---\nold\n", "utf8");
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toMatch(/Old \.apm layout|old \.apm layout/i);
    expect(message).toMatch(/\.apm\/dynamic|dynamic/i);
  });

  it("T3: dynamic uses flat show/write/edit (no detail subcommand)", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--min", "10", "--max", "80"], dir);
    const body = "x".repeat(10);
    await runCli(["dynamic", "write", "--text", body], dir);
    const shown = await runCli(["dynamic", "show"], dir);
    expect(shown.out).toContain(`1|${body}`);
    const program = buildProgram();
    const dyn = program.commands.find((c) => c.name() === "dynamic");
    expect(dyn?.commands.find((c) => c.name() === "detail")).toBeUndefined();
  });

  it("T4: dynamic archive writes timestamped copy under memory/archive", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--min", "10", "--max", "200"], dir);
    const body = "y".repeat(12);
    await runCli(["dynamic", "write", "--text", body], dir);
    await runCli(["dynamic", "archive"], dir);
    const archDir = join(dir, ".apm", "memory", "archive");
    const files = readdirSync(archDir).filter((f) => /^dynamic-\d{4}-\d{2}-\d{2}-\d{6}\.md$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(1);
    const archived = readFileSync(join(archDir, files[0]), "utf8");
    expect(archived).toBe(readFileSync(join(dir, ".apm", "memory", "dynamic.md"), "utf8"));
    expect(archived).toContain(body);
  });

  it("T5: dynamic clear resets active file; archive count unchanged", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--min", "10", "--max", "200"], dir);
    await runCli(["dynamic", "write", "--text", "z".repeat(12)], dir);
    await runCli(["dynamic", "archive"], dir);
    const archDir = join(dir, ".apm", "memory", "archive");
    const n = readdirSync(archDir).length;
    await runCli(["dynamic", "clear"], dir);
    expect(readdirSync(archDir).length).toBe(n);
    const cleared = readFileSync(join(dir, ".apm", "memory", "dynamic.md"), "utf8");
    expect(cleared.startsWith("---\n")).toBe(true);
    expect(cleared.split("\n---\n")[1]?.trim() ?? "").toBe("");
  });

  it("T6: kb write, index rebuild, search finds expected doc in top results", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(
      [
        "kb",
        "write",
        "--path",
        "alpha-topic.md",
        "--text",
        "# Alpha\n\nkwfixture_alpha_unique token for search.\n"
      ],
      dir
    );
    await runCli(["kb", "write", "--path", "nested/beta.md", "--text", "# Beta\n\nother content only.\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const out = await runCli(["kb", "search", "--q", "kwfixture_alpha_unique"], dir);
    expect(out.out).toContain("alpha-topic.md");
  });

  it("T7: index file is gzip; missing index yields rebuild hint", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["kb", "write", "--path", "x.md", "--text", "# T\nhello world\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const idx = join(dir, ".apm", "kb", "index", "search.json.gz");
    const head = readFileSync(idx).subarray(0, 2);
    expect(head[0]).toBe(0x1f);
    expect(head[1]).toBe(0x8b);
    rmSync(idx, { force: true });
    const err = await runCliFail(["kb", "search", "--q", "hello"], dir);
    expect(err).toMatch(/rebuild/i);
  });

  it("T8: role/persist/config/read on v2 paths", async () => {
    const dir = newTempDir();
    await runCli(["dynamic", "show"], dir);
    expect(existsSync(join(dir, ".apm", "memory", "dynamic.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "tmp"))).toBe(false);
    expect(existsSync(join(dir, ".apm", "chunks"))).toBe(false);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "10"], dir);
    await runCli(["role", "write", "--text", "abcdef"], dir);
    const shown = await runCli(["role", "show"], dir);
    expect(shown.out).toContain("1|abcdef");
    const roleFile = readFileSync(join(dir, ".apm", "memory", "role.md"), "utf8");
    expect(roleFile.startsWith("---\n")).toBe(true);
    const plain = await runCli(["read"], dir);
    expect(plain.out.trim()).toBe("开发中");
  });

  it("registers init and kb", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("init");
    expect(names).toContain("kb");
    expect(names).toContain("dynamic");
    expect(names).not.toContain("tmp");
    expect(names).not.toContain("chunks");
  });

  it("enforces dynamicDetail limits after flat write", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--min", "10", "--max", "80"], dir);
    const body = "x".repeat(10);
    await runCli(["dynamic", "write", "--text", body], dir);
    const shown = await runCli(["dynamic", "show"], dir);
    expect(shown.out).toContain(`1|${body}`);
  });

  it("kb import copies md tree and supports kb dynamic section", async () => {
    const dir = newTempDir();
    const src = join(dir, "srcmd");
    mkdirSync(join(src, "sub"), { recursive: true });
    writeFileSync(join(src, "a.md"), "# Imp\nimport_kw_xyz\n", "utf8");
    writeFileSync(join(src, "sub", "b.md"), "body\n", "utf8");
    await runCli(["init"], dir);
    await runCli(["kb", "import", "--from", src], dir);
    expect(existsSync(join(dir, ".apm", "kb", "docs", "a.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "kb", "docs", "sub", "b.md"))).toBe(true);
    const out = await runCli(["kb", "search", "--q", "import_kw_xyz"], dir);
    expect(out.out).toContain("a.md");
    await runCli(["config", "set", "--section", "kbDynamicDetail", "--min", "5", "--max", "120"], dir);
    await runCli(["kb", "dynamic", "write", "--text", "kbdyn-----"], dir);
    const kd = await runCli(["kb", "dynamic", "show"], dir);
    expect(kd.out).toContain("kbdyn");
  });

  it("rejects raw section files without mandatory front matter (memory role)", async () => {
    const dir = newTempDir();
    await runCli(["role", "show"], dir);
    writeFileSync(join(dir, ".apm", "memory", "role.md"), "raw text without front matter", "utf8");
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toContain("Invalid section front matter");
    expect(message).toContain("role.md");
  });

  it("validates section front matter schema for required local timestamp format", async () => {
    const dir = newTempDir();
    await runCli(["role", "show"], dir);
    writeFileSync(
      join(dir, ".apm", "memory", "role.md"),
      ['---', 'createdAt: "bad-time"', 'updatedAt: "2026-01-01 10:00:00"', "---", "hello"].join("\n"),
      "utf8"
    );
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toContain("Invalid section front matter");
    expect(message).toContain("createdAt");
    expect(message).toContain("YYYY-MM-DD HH:mm:ss");
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
});
