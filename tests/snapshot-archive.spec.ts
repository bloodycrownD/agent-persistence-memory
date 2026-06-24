import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMemorySnapshotArchiveRelPath,
  isMemorySnapshotSection,
  memorySnapshotSectionDir
} from "../src/core/memory-snapshot-path";
import { newTempDir, runCli } from "./helpers/cli-harness";
import {
  countLayeredSnapshots,
  latestLayeredSnapshotAbs,
  listLayeredSnapshotRels,
  readMemorySectionFile
} from "./helpers/snapshot-archive";

describe("memory-snapshot-path 单元", () => {
  it("isMemorySnapshotSection 与 memorySnapshotSectionDir", () => {
    expect(isMemorySnapshotSection("role")).toBe(true);
    expect(isMemorySnapshotSection("persist")).toBe(true);
    expect(isMemorySnapshotSection("dynamicDetail")).toBe(true);
    expect(isMemorySnapshotSection("kbDynamicDetail")).toBe(false);
    expect(memorySnapshotSectionDir("dynamicDetail")).toBe("dynamic");
    expect(memorySnapshotSectionDir("role")).toBe("role");
    expect(memorySnapshotSectionDir("persist")).toBe("persist");
  });

  it("buildMemorySnapshotArchiveRelPath 固定日期生成路径", () => {
    const at = new Date(2026, 5, 18, 14, 30, 52, 127);
    expect(buildMemorySnapshotArchiveRelPath("role", at)).toBe("archive/2026/06/18/role/143052127.md");
    expect(buildMemorySnapshotArchiveRelPath("dynamicDetail", at)).toBe(
      "archive/2026/06/18/dynamic/143052127.md"
    );
  });
});

describe("memory write snapshot archive", () => {
  const kbRoot = (dir: string) => join(dir, ".apm", "kb");

  async function initWithLimits(dir: string): Promise<void> {
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "200"], dir);
    await runCli(["config", "set", "--section", "persist", "--max", "200"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    await runCli(["config", "set", "--section", "kbDynamicDetail", "--max", "200"], dir);
  }

  it("T-SA-01: role write 写入目标与 role 分层快照且全文一致", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const body = "snapshot_role_A";
    await runCli(["role", "write", "--text", body], dir);
    const target = readMemorySectionFile(dir, "role");
    expect(target).toContain(body);
    const rels = listLayeredSnapshotRels(kbRoot(dir)).filter((r) => r.includes("/role/"));
    expect(rels.length).toBe(1);
    const snapshot = readFileSync(join(kbRoot(dir), rels[0]!), "utf8");
    expect(snapshot).toBe(target);
  });

  it("T-SA-02: persist / dynamic write 分别落在 persist / dynamic 目录", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    await runCli(["persist", "write", "--text", "persist_body_xyz"], dir);
    await runCli(["dynamic", "write", "--text", "dynamic_body_xyz"], dir);
    const rels = listLayeredSnapshotRels(kbRoot(dir));
    expect(rels.some((r) => r.includes("/persist/"))).toBe(true);
    expect(rels.some((r) => r.includes("/dynamic/"))).toBe(true);
    expect(rels.filter((r) => r.includes("/role/")).length).toBe(0);
  });

  it("T-SA-03: dynamic 覆盖写入时新快照为新版 C 而非旧版 B", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const bodyB = "body_B_xxxxxxxx";
    const bodyC = "body_C_yyyyyyyy";
    await runCli(["dynamic", "write", "--text", bodyB], dir);
    const nAfterFirst = countLayeredSnapshots(kbRoot(dir), "dynamic");
    await runCli(["dynamic", "write", "--text", bodyC], dir);
    const target = readMemorySectionFile(dir, "dynamic");
    expect(target).toContain(bodyC);
    expect(target).not.toContain(bodyB);
    expect(countLayeredSnapshots(kbRoot(dir), "dynamic")).toBe(nAfterFirst + 1);
    const latest = latestLayeredSnapshotAbs(kbRoot(dir), "dynamic");
    expect(latest).toBeTruthy();
    const latestText = readFileSync(latest!, "utf8");
    expect(latestText).toBe(target);
    expect(latestText).toContain(bodyC);
    expect(latestText).not.toContain(bodyB);
  });

  it("T-SA-04: replace / validate 不新增 archive 快照", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    await runCli(["dynamic", "write", "--text", "seed_for_replace"], dir);
    const n = countLayeredSnapshots(kbRoot(dir));
    await runCli(["dynamic", "replace", "--old", "seed", "--new", "replaced"], dir);
    expect(countLayeredSnapshots(kbRoot(dir))).toBe(n);
    await runCli(["dynamic", "validate", "--text", "draft_only"], dir);
    expect(countLayeredSnapshots(kbRoot(dir))).toBe(n);
    await runCli(["role", "write", "--text", "role_seed"], dir);
    const n2 = countLayeredSnapshots(kbRoot(dir));
    await runCli(["role", "replace", "--old", "seed", "--new", "done"], dir);
    expect(countLayeredSnapshots(kbRoot(dir))).toBe(n2);
  });

  it("T-SA-05: dynamic write 空串仍 +1 快照且与目标空模板一致", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    await runCli(["dynamic", "write", "--text", "z".repeat(12)], dir);
    const n = countLayeredSnapshots(kbRoot(dir), "dynamic");
    await runCli(["dynamic", "write", "--text", ""], dir);
    expect(countLayeredSnapshots(kbRoot(dir), "dynamic")).toBe(n + 1);
    const target = readMemorySectionFile(dir, "dynamic");
    expect(target.startsWith("---\n")).toBe(true);
    expect(target.split("\n---\n")[1]?.trim() ?? "").toBe("");
    const latest = latestLayeredSnapshotAbs(kbRoot(dir), "dynamic");
    expect(readFileSync(latest!, "utf8")).toBe(target);
  });

  it("T-SA-06: init 后首次 write 也产生 archive 快照", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    expect(countLayeredSnapshots(kbRoot(dir), "dynamic")).toBe(0);
    await runCli(["dynamic", "write", "--text", "first_write_body"], dir);
    expect(countLayeredSnapshots(kbRoot(dir), "dynamic")).toBe(1);
  });

  it("T-SA-07: write 含唯一关键词后 kb search 命中分层 archive 路径", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const keyword = "kw_snapshot_fixture";
    await runCli(["dynamic", "write", "--text", `${keyword} ${"a".repeat(4)}`], dir);
    const out = await runCli(["kb", "search", "--q", keyword], dir);
    expect(out.out).toMatch(/archive\/\d{4}\/\d{2}\/\d{2}\/dynamic\//);
  });

  it("T-SA-08: write 后 apm read 联想区含 archive/ 路径", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const keyword = "kw_snapshot_fixture_read";
    await runCli(["dynamic", "write", "--text", `${keyword} dynamic note`], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("archive/");
  });

  it("T-SA-09: 旧扁平 dynamic-*.md 与新分层快照共存且均可检索", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const legacyName = "dynamic-2020-01-01-120000.md";
    const legacyKw = "kw_legacy_flat_dynamic";
    const archDir = join(kbRoot(dir), "archive");
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, legacyName), `# Legacy\n\n${legacyKw} flat archive.\n`, "utf8");
    await runCli(["kb", "index", "rebuild"], dir);
    await runCli(["dynamic", "write", "--text", "new layered snapshot"], dir);
    expect(countLayeredSnapshots(kbRoot(dir), "dynamic")).toBe(1);
    expect(existsSync(join(archDir, legacyName))).toBe(true);
    const searchLegacy = await runCli(["kb", "search", "--q", legacyKw], dir);
    expect(searchLegacy.out).toContain(legacyName);
    const searchNew = await runCli(["kb", "search", "--q", "layered snapshot"], dir);
    expect(searchNew.out).toMatch(/archive\/\d{4}\/\d{2}\/\d{2}\/dynamic\//);
  });

  it("T-SA-11: kb dynamic write 不新增 archive 分层快照", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const nBefore = countLayeredSnapshots(kbRoot(dir));
    await runCli(["kb", "dynamic", "write", "--text", "kb_dyn_only_body"], dir);
    expect(countLayeredSnapshots(kbRoot(dir))).toBe(nBefore);
  });
});
