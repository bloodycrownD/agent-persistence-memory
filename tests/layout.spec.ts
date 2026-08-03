import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/index";
import { newTempDir, runCli, runCliFail, runCliWithExit } from "./helpers/cli-harness";
import { writeKbDoc } from "./helpers/kb-docs";
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
    expect(existsSync(join(dir, ".apm", "archive"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "config"))).toBe(true);
    expect(existsSync(join(dir, ".apm", "config", "index.gz"))).toBe(false);
    const cfg = JSON.parse(readFileSync(join(dir, ".apm", "config", "config.json"), "utf8"));
    expect(cfg.limits).toBeTruthy();
    expect(cfg.initializedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(cfg.lastReadAt).toBeNull();
  });

  it("T2c: incomplete workspace is auto-repaired on first command", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    rmSync(join(dir, ".apm", "memory", "persist.md"), { force: true });
    await runCli(["role", "show"], dir);
    expect(existsSync(join(dir, ".apm", "memory", "persist.md"))).toBe(true);
  });

  it("T3: dynamic uses flat show/write/validate (no detail subcommand)", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "80"], dir);
    const body = "x".repeat(10);
    await runCli(["dynamic", "write", "--text", body], dir);
    const shown = await runCli(["dynamic", "show"], dir);
    expect(shown.out).toContain(`1|${body}`);
    await runCli(["dynamic", "write", "--text", "y".repeat(10)], dir);
    const after = await runCli(["dynamic", "show"], dir);
    expect(after.out).toContain(`1|${"y".repeat(10)}`);
    const program = buildProgram();
    const dyn = program.commands.find((c) => c.name() === "dynamic");
    expect(dyn?.commands.find((c) => c.name() === "detail")).toBeUndefined();
    expect(dyn?.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["show", "write", "validate"])
    );
    expect(dyn?.commands.find((c) => c.name() === "replace")).toBeUndefined();
  });

  it("T4: dynamic write 每次写入新版分层 archive 快照", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    const body1 = "y".repeat(12);
    const body2 = "n".repeat(12);
    await runCli(["dynamic", "write", "--text", body1], dir);
    await runCli(["dynamic", "write", "--text", body2], dir);
    const archiveDir = join(dir, ".apm", "archive");
    const target = readMemorySectionFile(dir, "dynamic");
    expect(target).toContain(body2);
    expect(target).not.toContain(body1);
    const latest = latestLayeredSnapshotAbs(archiveDir, "dynamic");
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
    const archiveDir = join(dir, ".apm", "archive");
    const n = countLayeredSnapshots(archiveDir, "dynamic");
    await runCli(["dynamic", "write", "--text", ""], dir);
    expect(countLayeredSnapshots(archiveDir, "dynamic")).toBe(n + 1);
    const cleared = readMemorySectionFile(dir, "dynamic");
    expect(cleared.startsWith("---\n")).toBe(true);
    expect(cleared.split("\n---\n")[1]?.trim() ?? "").toBe("");
    const latest = latestLayeredSnapshotAbs(archiveDir, "dynamic");
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
    const archiveDir = join(dir, ".apm", "archive");
    expect(countLayeredSnapshots(archiveDir, "dynamic")).toBe(0);
    await runCli(["dynamic", "write", "--text", "x".repeat(12)], dir);
    expect(countLayeredSnapshots(archiveDir, "dynamic")).toBe(1);
  });

  it("T-DYN-ARCH-04: 空 dynamic 上 empty write 仍新增一条快照", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const archiveDir = join(dir, ".apm", "archive");
    const n = countLayeredSnapshots(archiveDir, "dynamic");
    await runCli(["dynamic", "write", "--text", ""], dir);
    expect(countLayeredSnapshots(archiveDir, "dynamic")).toBe(n + 1);
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

  it("T-IDX-01: role write updates index.gz mtime or hash", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    writeKbDoc(dir, "seed.md", "# Seed\nseed for index baseline\n");
    await runCli(["index", "build"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "100"], dir);
    const idx = join(dir, ".apm", "config", "index.gz");
    const beforeMtime = statSync(idx).mtimeMs;
    const beforeHash = createHash("sha256").update(readFileSync(idx)).digest("hex");
    await runCli(["role", "write", "--text", "role triggers rebuild"], dir);
    expect(existsSync(idx)).toBe(true);
    const afterMtime = statSync(idx).mtimeMs;
    const afterHash = createHash("sha256").update(readFileSync(idx)).digest("hex");
    expect(afterMtime >= beforeMtime).toBe(true);
    expect(afterMtime > beforeMtime || afterHash !== beforeHash).toBe(true);
  });

  it("T-IDX-02: dynamic write 分层 archive 快照可被检索", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    const keyword = "kwarchive_idx_fixture_xyz";
    const body1 = `${keyword} ${"a".repeat(4)}`;
    await runCli(["dynamic", "write", "--text", body1], dir);
    await runCli(["dynamic", "write", "--text", "b".repeat(12)], dir);
    await runCli(["role", "write", "--text", keyword], dir);
    const out = await runCli(["read"], dir);
    expect(out.out).toMatch(/archive\/\d{4}\/\d{2}\/\d{2}\/dynamic\//);
    const archiveDir = join(dir, ".apm", "archive");
    const hit = listLayeredSnapshotRels(archiveDir)
      .filter((rel) => rel.includes("/dynamic/"))
      .find((rel) => readFileSync(join(archiveDir, rel), "utf8").includes(keyword));
    expect(hit).toBeTruthy();
  });

  it("T6: docs + index build, read association finds expected doc in top results", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    writeKbDoc(dir, "alpha-topic.md", "# Alpha\n\nkwfixture_alpha_unique token for search.\n");
    writeKbDoc(dir, "nested/beta.md", "# Beta\n\nother content only.\n");
    await runCli(["index", "build"], dir);
    await runCli(["role", "write", "--text", "kwfixture_alpha_unique"], dir);
    const out = await runCli(["read"], dir);
    expect(out.out).toContain("docs/alpha-topic.md");
  });

  it("T7: index file is gzip; missing index yields build hint", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    writeKbDoc(dir, "x.md", "# T\nhello world\n");
    await runCli(["index", "build"], dir);
    const idx = join(dir, ".apm", "config", "index.gz");
    const head = readFileSync(idx).subarray(0, 2);
    expect(head[0]).toBe(0x1f);
    expect(head[1]).toBe(0x8b);
    rmSync(idx, { force: true });
    const rolePath = join(dir, ".apm", "memory", "role.md");
    writeFileSync(
      rolePath,
      ['---', 'createdAt: "2026-01-01 00:00:00"', 'updatedAt: "2026-01-01 00:00:00"', '---', 'hello world'].join("\n"),
      "utf8"
    );
    const { out } = await runCli(["read"], dir);
    expect(out).toMatch(/index build/i);
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
    expect(res.err).not.toContain('Warning: Failed to read section "角色"');
    expect(res.out).toContain("# 角色");
    expect(res.out).toContain("corrupted content");
    expect(res.out).toContain("# 持久记忆");
    expect(res.out).toContain("good-persist");
  });

  it("T-READ-RELAX: read tolerates missing front matter while show stays strict", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const rolePath = join(dir, ".apm", "memory", "role.md");
    writeFileSync(rolePath, "plain body without front matter", "utf8");

    const readRes = await runCli(["read"], dir);
    expect(readRes.out).toContain("# 角色");
    expect(readRes.out).toContain("plain body without front matter");
    expect(readRes.err).not.toMatch(/Warning: Failed to read section "角色"/);

    const showErr = await runCliFail(["role", "show"], dir);
    expect(showErr).toContain("Invalid section front matter");
    expect(showErr).toContain("role.md");
  });

  it("T-READ-RELAX: read tolerates invalid front matter meta while show fails", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const rolePath = join(dir, ".apm", "memory", "role.md");
    writeFileSync(
      rolePath,
      ['---', 'createdAt: "bad-time"', 'updatedAt: "2026-01-01 10:00:00"', "---", "body after bad fm"].join("\n"),
      "utf8"
    );

    const readRes = await runCli(["read"], dir);
    expect(readRes.out).toContain("# 角色");
    expect(readRes.out).toContain("body after bad fm");

    const showErr = await runCliFail(["role", "show"], dir);
    expect(showErr).toContain("Invalid section front matter");
    expect(showErr).toContain("createdAt");
  });

  it("registers init and index commands", () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("init");
    expect(names).toContain("index");
    expect(names).toContain("dynamic");
    expect(names).not.toContain("kb");
    expect(names).not.toContain("tmp");
    expect(names).not.toContain("chunks");
  });

  it("T-KB-NEG-01: unknown kb subcommands exit non-zero", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const writeRes = await runCliWithExit(["kb", "write", "--path", "x.md", "--text", "hi"], dir);
    expect(writeRes.code).not.toBe(0);
    const importRes = await runCliWithExit(["kb", "import", "--from", "somewhere"], dir);
    expect(importRes.code).not.toBe(0);
  });

  it("T-WRITE-HEAL-01: 无 FM 的 role write 自愈后 show 成功", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "100"], dir);
    const rolePath = join(dir, ".apm", "memory", "role.md");
    writeFileSync(rolePath, "plain body without front matter", "utf8");
    const showBefore = await runCliFail(["role", "show"], dir);
    expect(showBefore).toContain("Invalid section front matter");
    await runCli(["role", "write", "--text", "healed body"], dir);
    const shown = await runCli(["role", "show"], dir);
    expect(shown.out).toContain("1|healed body");
    const raw = readFileSync(rolePath, "utf8");
    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toMatch(/createdAt: ['"]\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}['"]/);
    expect(raw).toMatch(/updatedAt: ['"]\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}['"]/);
  });

  it("T-WRITE-HEAL-02: 坏 meta 的 role write 自愈后 show 成功", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "100"], dir);
    const rolePath = join(dir, ".apm", "memory", "role.md");
    writeFileSync(
      rolePath,
      ['---', 'createdAt: "bad-time"', 'updatedAt: "2026-01-01 10:00:00"', "---", "old body"].join("\n"),
      "utf8"
    );
    await runCli(["role", "write", "--text", "healed after bad meta"], dir);
    const shown = await runCli(["role", "show"], dir);
    expect(shown.out).toContain("1|healed after bad meta");
    const raw = readFileSync(rolePath, "utf8");
    expect(raw).toMatch(/createdAt: ['"]\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}['"]/);
    expect(raw).not.toContain("bad-time");
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

  it("direct docs files are searchable after index build", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    writeKbDoc(dir, "a.md", "# Imp\nimport_kw_xyz\n");
    writeKbDoc(dir, "sub/b.md", "body\n");
    await runCli(["index", "build"], dir);
    await runCli(["role", "write", "--text", "import_kw_xyz"], dir);
    const out = await runCli(["read"], dir);
    expect(out.out).toContain("docs/a.md");
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
