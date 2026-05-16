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
    expect(existsSync(join(dir, ".apm", "kb", "archive"))).toBe(true);
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
    const archDir = join(dir, ".apm", "kb", "archive");
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
    const archDir = join(dir, ".apm", "kb", "archive");
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
    expect(out.out).toContain("docs/alpha-topic.md");
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
    expect(plain.out).toContain("# 角色");
    expect(plain.out).toContain("abcdef");
  });

  it("T-READ-ROBUST: read command handles corrupted section files gracefully", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    // Corrupt the role file by removing front matter
    writeFileSync(join(dir, ".apm", "memory", "role.md"), "corrupted content", "utf8");
    await runCli(["config", "set", "--section", "persist", "--min", "1", "--max", "100"], dir);
    await runCli(["persist", "write", "--text", "good-persist"], dir);
    
    const res = await runCli(["read"], dir);
    // Should warn about role but still show persist
    expect(res.err).toContain('Warning: Failed to read section "角色"');
    expect(res.out).toContain("# 持久记忆");
    expect(res.out).toContain("good-persist");
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

  function assocPercentHeaders(out: string): string[] {
    return out.match(/^\[\d+%\].+$/gm) ?? [];
  }

  function assocPercentValues(out: string): number[] {
    return assocPercentHeaders(out).map((h) => Number(h.match(/\[(\d+)%\]/)?.[1] ?? -1));
  }

  function assocEntryBlocks(out: string): string[] {
    const assoc = out.includes("# 联想区") ? out.slice(out.indexOf("# 联想区") + "# 联想区".length) : out;
    return assoc
      .trim()
      .split(/\n\n+/)
      .filter((b) => /^\[\d+%\]/.test(b));
  }

  async function setupAssocWorkspace(dir: string): Promise<void> {
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "500"], dir);
    await runCli(["config", "set", "--section", "persist", "--min", "1", "--max", "500"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--min", "1", "--max", "500"], dir);
  }

  function removeKbDocsReadme(dir: string): void {
    rmSync(join(dir, ".apm", "kb", "docs", "README.md"), { force: true });
  }

  function neutralizeKbDynamicDetail(dir: string): void {
    writeFileSync(
      join(dir, ".apm", "kb", "dynamic", "detail.md"),
      ['---', 'createdAt: "2020-01-01 00:00:00"', 'updatedAt: "2020-01-01 00:00:00"', "---", ""].join("\n"),
      "utf8"
    );
  }

  function trimKbIndexFixtures(dir: string): void {
    removeKbDocsReadme(dir);
    neutralizeKbDynamicDetail(dir);
  }

  it("T-READ-ASSOC-1: read shows memory sections then association with percent header", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_feat1_shared";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(["persist", "write", "--text", `${kw} persist note`], dir);
    await runCli(["dynamic", "write", "--text", `${kw} dynamic note`], dir);
    await runCli(
      ["kb", "write", "--path", "assoc-topic.md", "--text", `# Assoc\n\n${kw} in knowledge base.\n`],
      dir
    );
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const roleIdx = out.indexOf("# 角色");
    const persistIdx = out.indexOf("# 持久记忆");
    const dynamicIdx = out.indexOf("# 动态记忆");
    const assocIdx = out.indexOf("# 联想区");
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(persistIdx).toBeGreaterThan(roleIdx);
    expect(dynamicIdx).toBeGreaterThan(persistIdx);
    expect(assocIdx).toBeGreaterThan(dynamicIdx);
    expect(assocPercentHeaders(out).length).toBeGreaterThanOrEqual(1);
  });

  it("T-READ-ASSOC-2: detailed tier shows 5 hits sorted by match percent descending", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_many_shared";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 8; i++) {
      await runCli(
        ["kb", "write", "--path", `a${i}.md`, "--text", `# Doc ${i}\n\n${kw} token ${i}.\n`],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const blocks = assocEntryBlocks(out);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    const detailedPercents = blocks.slice(0, 5).map((b) => Number(b.match(/\[(\d+)%\]/)?.[1] ?? -1));
    expect(detailedPercents.length).toBe(5);
    for (let i = 1; i < detailedPercents.length; i++) {
      expect(detailedPercents[i]).toBeLessThanOrEqual(detailedPercents[i - 1]);
    }
  });

  it("T-READ-ASSOC-3: only two hits yields two association headers", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_two_only";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(["kb", "write", "--path", "t0.md", "--text", `# T0\n${kw}\n`], dir);
    await runCli(["kb", "write", "--path", "t1.md", "--text", `# T1\n${kw}\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(assocPercentHeaders(out).length).toBe(2);
  });

  it("T-READ-ASSOC-4: caps at 15 unique paths when many docs match", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_cap20_shared";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 22; i++) {
      await runCli(
        ["kb", "write", "--path", `cap${i}.md`, "--text", `# Cap ${i}\n\n${kw} item ${i}.\n`],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const headers = assocPercentHeaders(out);
    expect(headers.length).toBe(15);
    const paths = headers.map((h) => h.match(/^\[\d+%\]\s+(\S+)/)?.[1] ?? "");
    expect(new Set(paths).size).toBe(15);
  });

  it("T-READ-ASSOC-5: summary tier has no line-number body rows", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_summary_nolines";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 30; i++) {
      await runCli(
        [
          "kb",
          "write",
          "--path",
          `sum${i}.md`,
          "--text",
          `# Sum ${i}\n\n${kw} line-one-${i}\n${kw} line-two-${i}\n${kw} line-three-${i}\n`
        ],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const assoc = out.slice(out.indexOf("# 联想区"));
    const headers = assocPercentHeaders(assoc);
    expect(headers.length).toBe(15);
    for (let i = 5; i < headers.length; i++) {
      const start = assoc.indexOf(headers[i]);
      const end = i + 1 < headers.length ? assoc.indexOf(headers[i + 1]) : assoc.length;
      expect(assoc.slice(start, end)).not.toMatch(/^\d+\|/m);
    }
  });

  it("T-READ-ASSOC-6: archive markdown is searchable outside kb/docs", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_archive_only";
    await runCli(["role", "write", "--text", kw], dir);
    mkdirSync(join(dir, ".apm", "kb", "archive"), { recursive: true });
    writeFileSync(
      join(dir, ".apm", "kb", "archive", "only-here.md"),
      `# Archive only\n\n${kw} lives in archive.\n`,
      "utf8"
    );
    await runCli(["kb", "write", "--path", "other.md", "--text", "# Other\n\nunrelated content.\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("archive/only-here.md");
  });

  it("T-READ-ASSOC-7: association tracks role context changes", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kwA = "zzassoc_only_alpha_token";
    const kwB = "zzassoc_only_bravo_token";
    await runCli(["dynamic", "write", "--text", kwA], dir);
    await runCli(["kb", "write", "--path", "hit-a.md", "--text", `# A\n\n${kwA} only here.\n`], dir);
    await runCli(["kb", "write", "--path", "hit-b.md", "--text", `# B\n\n${kwB} only here.\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const first = await runCli(["read"], dir);
    expect(first.out).toContain("docs/hit-a.md");
    const firstA = first.out.match(/\[(\d+)%\]\s+docs\/hit-a\.md/)?.[1];
    const firstB = first.out.match(/\[(\d+)%\]\s+docs\/hit-b\.md/)?.[1];
    expect(Number(firstA)).toBeGreaterThan(Number(firstB ?? 0));
    await runCli(["role", "write", "--text", kwB], dir);
    await runCli(["dynamic", "clear"], dir);
    const second = await runCli(["read"], dir);
    expect(second.out).toContain("docs/hit-b.md");
    const secondB = second.out.match(/\[(\d+)%\]\s+docs\/hit-b\.md/)?.[1];
    const secondA = second.out.match(/\[(\d+)%\]\s+docs\/hit-a\.md/)?.[1];
    expect(Number(secondB)).toBeGreaterThan(Number(secondA ?? 0));
  });

  it("T-READ-ASSOC-8: match percents are 0-100 with at least one 100", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_percent_range";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(["kb", "write", "--path", "p0.md", "--text", `# P0\n${kw}\n`], dir);
    await runCli(["kb", "write", "--path", "p1.md", "--text", `# P1\n${kw} extra\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const percents = assocPercentValues(out);
    expect(percents.length).toBeGreaterThan(0);
    for (const p of percents) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    expect(percents).toContain(100);
  });

  it("T-READ-ASSOC-9: stopwords are not shown as association keywords", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    await runCli(["role", "write", "--text", "the a uniquekw"], dir);
    await runCli(["kb", "write", "--path", "stop.md", "--text", "# Stop\n\nuniquekw appears here.\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const firstHeader = assocPercentHeaders(out)[0] ?? "";
    expect(firstHeader).toContain("uniquekw");
    expect(firstHeader).not.toMatch(/\bthe\b/i);
    expect(firstHeader).not.toMatch(/\ba\b/i);
  });

  it("T-READ-ASSOC-10: missing index still prints memory and rebuild hint", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    await runCli(["role", "write", "--text", "zzassoc_missing_idx"], dir);
    await runCli(["kb", "write", "--path", "x.md", "--text", "# X\nzzassoc_missing_idx\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    rmSync(join(dir, ".apm", "kb", "index", "search.json.gz"), { force: true });
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("# 角色");
    expect(out).toContain("# 联想区");
    expect(out).toMatch(/kb index rebuild/i);
  });

  it("T-READ-ASSOC-11: no hits omits association section", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    await runCli(["role", "write", "--text", "zzassoc_no_overlap_ctx"], dir);
    await runCli(["kb", "write", "--path", "unrelated.md", "--text", "# U\n\nzzassoc_kb_other_token\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).not.toContain("# 联想区");
  });

  it("T-READ-ASSOC-12: detailed entry shows at most three matching source lines", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_multiline_kw";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(
      [
        "kb",
        "write",
        "--path",
        "multiline.md",
        "--text",
        `# Multi\n\nline1 ${kw}\nline2 ${kw}\nline3 ${kw}\nline4 ${kw}\nline5 ${kw}\n`
      ],
      dir
    );
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("docs/multiline.md");
    const assoc = out.slice(out.indexOf("# 联想区"));
    const entryMatch = assoc.match(
      /\[(\d+)%\]\s+docs\/multiline\.md[^\n]*\n((?:\d+\|[^\n]+\n?){1,3})/
    );
    expect(entryMatch).toBeTruthy();
    const bodyLines = entryMatch![2].match(/^\d+\|/gm) ?? [];
    expect(bodyLines.length).toBeGreaterThan(0);
    expect(bodyLines.length).toBeLessThanOrEqual(3);
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
