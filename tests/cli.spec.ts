import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  it("enforces role limits via config and renders line numbers", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "10"], dir);
    await runCli(["role", "write", "--text", "abcdef"], dir);
    const shown = await runCli(["role", "show"], dir);
    expect(shown.out).toContain("1|abcdef");
    const roleFile = readFileSync(join(dir, ".apm", "role.md"), "utf8");
    expect(roleFile.startsWith("---\n")).toBe(true);
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

  it("validates todo numeric inputs (index/priority) with clear errors", async () => {
    const dir = newTempDir();
    expect(await runCliFail(["tmp", "todos", "add", "--name", "t1", "--description", "x", "--index", "0"], dir)).toContain(
      "Invalid --index"
    );
    expect(
      await runCliFail(
        ["tmp", "todos", "add", "--name", "t1", "--description", "x", "--index", "1", "--priority", "NaN"],
        dir
      )
    ).toContain("Invalid --priority");
    await runCli(["tmp", "todos", "add", "--name", "t1", "--description", "x", "--index", "1", "--priority", "2"], dir);
    expect(await runCliFail(["tmp", "todos", "priority", "--index", "1", "--priority", "1.5"], dir)).toContain(
      "Invalid --priority"
    );
    expect(await runCliFail(["tmp", "todos", "complete", "--index", "-1"], dir)).toContain("Invalid --index");
    expect(await runCliFail(["tmp", "todos", "rm", "--index", "abc"], dir)).toContain("Invalid --index");
    expect(await runCliFail(["tmp", "todos", "edit", "--index", "Infinity", "--description", "y"], dir)).toContain(
      "Invalid --index"
    );
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

  it("validates chunks list numeric args (size/page)", async () => {
    const dir = newTempDir();
    await runCli(["chunks", "add", "--name", "c1", "--keywords", "k", "--text", "x"], dir);
    expect(await runCliFail(["chunks", "list", "--size", "0"], dir)).toContain("Invalid --size");
    expect(await runCliFail(["chunks", "list", "--page", "-2"], dir)).toContain("Invalid --page");
    expect(await runCliFail(["chunks", "list", "--page", "1.2"], dir)).toContain("Invalid --page");
    expect(await runCliFail(["chunks", "list", "--order", "nope"], dir)).toContain("Invalid --order");
  });

  it("supports chunks edit rename with safe-name + uniqueness", async () => {
    const dir = newTempDir();
    await runCli(["chunks", "add", "--name", "c1", "--keywords", "alpha", "--text", "first"], dir);
    await runCli(["chunks", "add", "--name", "c2", "--keywords", "beta", "--text", "second"], dir);
    expect(await runCliFail(["chunks", "edit", "--name", "c1", "--new-name", "c2"], dir)).toContain("Chunk name exists");
    expect(await runCliFail(["chunks", "edit", "--name", "c1", "--new-name", "../bad"], dir)).toContain("Invalid name");
    await runCli(["chunks", "edit", "--name", "c1", "--new-name", "c1_renamed", "--text", "updated"], dir);
    const listed = await runCli(["chunks", "list"], dir);
    expect(listed.out).toContain("c1_renamed");
    expect(await runCliFail(["chunks", "read", "--names", "c1"], dir)).toContain("Chunk not found");
    const read = await runCli(["chunks", "read", "--names", "c1_renamed"], dir);
    expect(read.out).toContain("updated");
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
    expect(Array.isArray(parsed.persistenceLinks?.keywords)).toBe(true);
    expect(Array.isArray(parsed.persistenceLinks?.chunks)).toBe(true);
    expect(Array.isArray(parsed.associative?.keywords)).toBe(true);
  });

  it("derives read keywords from persist/detail and selects up to 5 chunks", async () => {
    const dir = newTempDir();
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "1000"], dir);
    await runCli(["config", "set", "--section", "persist", "--min", "1", "--max", "1000"], dir);
    await runCli(["config", "set", "--section", "tmpDetail", "--min", "1", "--max", "1000"], dir);

    await runCli(
      [
        "persist",
        "write",
        "--text",
        "vitest vitest vitest snapshot assertions inverted index extraction scoring persistence links associative keywords chunks selection atomic locks windows"
      ],
      dir
    );
    await runCli(
      ["tmp", "detail", "write", "--text", "fix apm read json output include selected chunks and associative keywords via inverted index"],
      dir
    );

    await runCli(["chunks", "add", "--name", "rel1", "--keywords", "vitest,keywords,selection,snapshot,assertions", "--text", "x"], dir);
    await runCli(["chunks", "add", "--name", "rel2", "--keywords", "atomic,locks,windows,fs,rename", "--text", "y"], dir);
    await runCli(["chunks", "add", "--name", "noise", "--keywords", "unrelated,banana,orange", "--text", "z"], dir);

    const result = await runCli(["read", "--json"], dir);
    const parsed = JSON.parse(result.out);

    // Persistence keywords: 5~10 preferred, derived from persist/detail/todos (not chunk echoing).
    expect(parsed.persistenceLinks.keywords.length).toBeGreaterThanOrEqual(5);
    expect(parsed.persistenceLinks.keywords.length).toBeLessThanOrEqual(10);
    expect(parsed.persistenceLinks.keywords).toContain("vitest");

    // Selected chunks: max 5, ranked by overlap with extracted keywords.
    expect(parsed.persistenceLinks.chunks.length).toBeLessThanOrEqual(5);
    const selectedNames = parsed.persistenceLinks.chunks.map((c: { name: string }) => c.name);
    expect(selectedNames).toContain("rel1");
    expect(selectedNames).toContain("rel2");
    expect(selectedNames).not.toContain("noise");

    // Associative keywords: suggested from selected chunks; 5~10 when possible, else 3~5.
    expect(parsed.associative.keywords.length).toBeGreaterThanOrEqual(3);
    expect(parsed.associative.keywords.length).toBeLessThanOrEqual(10);
    expect(parsed.associative.keywords).toContain("snapshot");
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

  it("validates status schema timestamp format with actionable field error", async () => {
    const dir = newTempDir();
    await runCli(["read"], dir);
    writeFileSync(
      join(dir, ".apm", "status.json"),
      JSON.stringify(
        {
          initializedAt: "2026-01-01T10:00:00",
          updatedAt: "2026-01-01 10:00:00",
          lastReadAt: null
        },
        null,
        2
      ),
      "utf8"
    );
    const message = await runCliFail(["read"], dir);
    expect(message).toContain("Invalid status file");
    expect(message).toContain("initializedAt");
    expect(message).toContain("YYYY-MM-DD HH:mm:ss");
  });

  it("validates todo front matter timestamp format with actionable field error", async () => {
    const dir = newTempDir();
    await runCli(["tmp", "todos", "add", "--name", "t1", "--description", "hello", "--index", "1"], dir);
    writeFileSync(
      join(dir, ".apm", "tmp", "todos", "t1.md"),
      [
        "---",
        'name: "t1"',
        "index: 1",
        "priority: 5",
        "completed: false",
        'createdAt: "2026/01/01 10:00:00"',
        'updatedAt: "2026-01-01 10:00:00"',
        "---",
        "hello"
      ].join("\n"),
      "utf8"
    );
    const message = await runCliFail(["tmp", "todos", "show"], dir);
    expect(message).toContain("Invalid todo front matter");
    expect(message).toContain("createdAt");
    expect(message).toContain("YYYY-MM-DD HH:mm:ss");
  });

  it("validates chunk front matter timestamp format with actionable field error", async () => {
    const dir = newTempDir();
    await runCli(["chunks", "add", "--name", "c1", "--keywords", "alpha", "--text", "hello"], dir);
    writeFileSync(
      join(dir, ".apm", "chunks", "c1.md"),
      [
        "---",
        'name: "c1"',
        'keywords: ["alpha"]',
        'createdAt: "2026-01-01 10:00"',
        'updatedAt: "2026-01-01 10:00:00"',
        "---",
        "hello"
      ].join("\n"),
      "utf8"
    );
    const message = await runCliFail(["chunks", "list"], dir);
    expect(message).toContain("Invalid chunk front matter");
    expect(message).toContain("createdAt");
    expect(message).toContain("YYYY-MM-DD HH:mm:ss");
  });
});

