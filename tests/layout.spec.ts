import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/index";
import { newTempDir, runCli, runCliFail, runCliWithExit } from "./helpers/cli-harness";
import {
  countLayeredSnapshots,
  latestLayeredSnapshotAbs,
  listLayeredSnapshotRels,
  readMemorySectionFile
} from "./helpers/snapshot-archive";

describe("apm cli workspace layout", () => {
  it("T1: init creates full workspace tree", async () => {
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
    expect(existsSync(join(dir, ".apm", "status.json"))).toBe(false);
    const cfg = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(cfg.limits).toBeTruthy();
    expect(cfg.initializedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(cfg.lastReadAt).toBeNull();
  });

  it("T2: legacy layout is rejected with guidance", async () => {
    const dir = newTempDir();
    mkdirSync(join(dir, ".apm", "persistence"), { recursive: true });
    const message = await runCliFail(["role", "show"], dir);
    expect(message).toMatch(/Old \.apm layout|old \.apm layout/i);
    expect(message).toMatch(/apm init/i);
  });

  it("T2b: legacy .apm/dynamic tree is removed and commands succeed", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    mkdirSync(join(dir, ".apm", "dynamic"), { recursive: true });
    writeFileSync(join(dir, ".apm", "dynamic", "detail.md"), "---\n---\nold\n", "utf8");
    await runCli(["role", "show"], dir);
    expect(existsSync(join(dir, ".apm", "dynamic"))).toBe(false);
  });

  it("T2c: incomplete workspace is auto-repaired on first command", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    rmSync(join(dir, ".apm", "kb", "dynamic", "detail.md"), { force: true });
    await runCli(["role", "show"], dir);
    expect(existsSync(join(dir, ".apm", "kb", "dynamic", "detail.md"))).toBe(true);
  });

  it("T3: dynamic uses flat show/write/replace (no detail subcommand)", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "80"], dir);
    const body = "x".repeat(10);
    await runCli(["dynamic", "write", "--text", body], dir);
    const shown = await runCli(["dynamic", "show"], dir);
    expect(shown.out).toContain(`1|${body}`);
    await runCli(["dynamic", "replace", "--old", "x", "--new", "y", "--all"], dir);
    const after = await runCli(["dynamic", "show"], dir);
    expect(after.out).toContain(`1|${"y".repeat(10)}`);
    const program = buildProgram();
    const dyn = program.commands.find((c) => c.name() === "dynamic");
    expect(dyn?.commands.find((c) => c.name() === "detail")).toBeUndefined();
  });

  it("T4: dynamic write 每次写入新版分层 archive 快照", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    const body1 = "y".repeat(12);
    const body2 = "n".repeat(12);
    await runCli(["dynamic", "write", "--text", body1], dir);
    await runCli(["dynamic", "write", "--text", body2], dir);
    const kbRoot = join(dir, ".apm", "kb");
    const target = readMemorySectionFile(dir, "dynamic");
    expect(target).toContain(body2);
    expect(target).not.toContain(body1);
    const latest = latestLayeredSnapshotAbs(kbRoot, "dynamic");
    expect(latest).toBeTruthy();
    const snapshot = readFileSync(latest!, "utf8");
    expect(snapshot).toBe(target);
    expect(snapshot).toContain(body2);
    expect(snapshot).not.toContain(body1);
  });

  it("T5: dynamic write --text empty 清空正文并新增空模板快照", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    await runCli(["dynamic", "write", "--text", "z".repeat(12)], dir);
    const kbRoot = join(dir, ".apm", "kb");
    const n = countLayeredSnapshots(kbRoot, "dynamic");
    await runCli(["dynamic", "write", "--text", ""], dir);
    expect(countLayeredSnapshots(kbRoot, "dynamic")).toBe(n + 1);
    const cleared = readMemorySectionFile(dir, "dynamic");
    expect(cleared.startsWith("---\n")).toBe(true);
    expect(cleared.split("\n---\n")[1]?.trim() ?? "").toBe("");
    const latest = latestLayeredSnapshotAbs(kbRoot, "dynamic");
    expect(readFileSync(latest!, "utf8")).toBe(cleared);
  });

  it("T-DYN-CMD-01: removed dynamic archive and clear subcommands", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const arch = await runCliWithExit(["dynamic", "archive"], dir);
    expect(arch.code).not.toBe(0);
    const clr = await runCliWithExit(["dynamic", "clear"], dir);
    expect(clr.code).not.toBe(0);
  });

  it("T-DYN-ARCH-02: 首次 dynamic write 也产生分层 archive 快照", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    const kbRoot = join(dir, ".apm", "kb");
    expect(countLayeredSnapshots(kbRoot, "dynamic")).toBe(0);
    await runCli(["dynamic", "write", "--text", "x".repeat(12)], dir);
    expect(countLayeredSnapshots(kbRoot, "dynamic")).toBe(1);
  });

  it("T-DYN-ARCH-04: 空 dynamic 上 empty write 仍新增一条快照", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const kbRoot = join(dir, ".apm", "kb");
    const n = countLayeredSnapshots(kbRoot, "dynamic");
    await runCli(["dynamic", "write", "--text", ""], dir);
    expect(countLayeredSnapshots(kbRoot, "dynamic")).toBe(n + 1);
  });

  it("T-DYN-ESC-01: dynamic write unescapes \\n in --text", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    await runCli(["dynamic", "write", "--text", "line1\\nline2"], dir);
    const shown = await runCli(["dynamic", "show"], dir);
    expect(shown.out).toContain("1|line1");
    expect(shown.out).toContain("2|line2");
  });

  it("T-KB-ESC-01: kb write unescapes \\n in --text", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["kb", "write", "--path", "esc-test.md", "--text", "h1\\nh2"], dir);
    const content = readFileSync(join(dir, ".apm", "kb", "docs", "esc-test.md"), "utf8");
    expect(content).toContain("h1\nh2");
  });

  it("T-IDX-01: role write updates search.json.gz mtime or hash", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["kb", "write", "--path", "seed.md", "--text", "# Seed\nseed for index baseline\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "100"], dir);
    const idx = join(dir, ".apm", "kb", "index", "search.json.gz");
    const beforeMtime = statSync(idx).mtimeMs;
    const beforeHash = createHash("sha256").update(readFileSync(idx)).digest("hex");
    await runCli(["role", "write", "--text", "role triggers rebuild"], dir);
    expect(existsSync(idx)).toBe(true);
    const afterMtime = statSync(idx).mtimeMs;
    const afterHash = createHash("sha256").update(readFileSync(idx)).digest("hex");
    expect(afterMtime >= beforeMtime).toBe(true);
    expect(afterMtime > beforeMtime || afterHash !== beforeHash).toBe(true);
  });

  it("T-IDX-02: dynamic write 分层 archive 快照可被 kb search 检索", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    const keyword = "kwarchive_idx_fixture_xyz";
    const body1 = `${keyword} ${"a".repeat(4)}`;
    await runCli(["dynamic", "write", "--text", body1], dir);
    await runCli(["dynamic", "write", "--text", "b".repeat(12)], dir);
    const out = await runCli(["kb", "search", "--q", keyword], dir);
    expect(out.out).toMatch(/archive\/\d{4}\/\d{2}\/\d{2}\/dynamic\//);
    const kbRoot = join(dir, ".apm", "kb");
    const hit = listLayeredSnapshotRels(kbRoot)
      .filter((rel) => rel.includes("/dynamic/"))
      .find((rel) => readFileSync(join(kbRoot, rel), "utf8").includes(keyword));
    expect(hit).toBeTruthy();
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

  it("T8: role/persist/config/read on canonical paths", async () => {
    const dir = newTempDir();
    await runCli(["dynamic", "show"], dir);
    expect(existsSync(join(dir, ".apm", "memory", "dynamic.md"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "tmp"))).toBe(false);
    expect(existsSync(join(dir, ".apm", "chunks"))).toBe(false);
    await runCli(["config", "set", "--section", "role", "--max", "10"], dir);
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
    writeFileSync(join(dir, ".apm", "memory", "role.md"), "corrupted content", "utf8");
    await runCli(["config", "set", "--section", "persist", "--max", "100"], dir);
    await runCli(["persist", "write", "--text", "good-persist"], dir);

    const res = await runCli(["read"], dir);
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
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "80"], dir);
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
    await runCli(["config", "set", "--section", "kbDynamicDetail", "--max", "120"], dir);
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
});
