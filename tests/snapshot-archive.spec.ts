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
    expect(memorySnapshotSectionDir("dynamicDetail")).toBe("dynamic");
    expect(memorySnapshotSectionDir("role")).toBe("role");
    expect(memorySnapshotSectionDir("persist")).toBe("persist");
  });

  it("buildMemorySnapshotArchiveRelPath 固定日期生成路径", () => {
    const at = new Date(2026, 5, 18, 14, 30, 52, 127);
    expect(buildMemorySnapshotArchiveRelPath("role", at)).toBe("2026/06/18/role/143052127.md");
    expect(buildMemorySnapshotArchiveRelPath("dynamicDetail", at)).toBe(
      "2026/06/18/dynamic/143052127.md"
    );
  });
});

describe("memory write snapshot archive", () => {
  const archiveDir = (dir: string) => join(dir, ".apm", "archive");

  async function initWithLimits(dir: string): Promise<void> {
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "200"], dir);
    await runCli(["config", "set", "--section", "persist", "--max", "200"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
  }

  it("T-SA-01: role write 写入目标与 role 分层快照且全文一致", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const body = "snapshot_role_A";
    await runCli(["role", "write", "--text", body], dir);
    const target = readMemorySectionFile(dir, "role");
    expect(target).toContain(body);
    const rels = listLayeredSnapshotRels(archiveDir(dir)).filter((r) => r.includes("/role/"));
    expect(rels.length).toBe(1);
    const snapshot = readFileSync(join(archiveDir(dir), rels[0]!), "utf8");
    expect(snapshot).toBe(target);
  });

  it("T-SA-02: persist / dynamic write 分别落在 persist / dynamic 目录", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    await runCli(["persist", "write", "--text", "persist_body_xyz"], dir);
    await runCli(["dynamic", "write", "--text", "dynamic_body_xyz"], dir);
    const rels = listLayeredSnapshotRels(archiveDir(dir));
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
    const nAfterFirst = countLayeredSnapshots(archiveDir(dir), "dynamic");
    await runCli(["dynamic", "write", "--text", bodyC], dir);
    const target = readMemorySectionFile(dir, "dynamic");
    expect(target).toContain(bodyC);
    expect(target).not.toContain(bodyB);
    expect(countLayeredSnapshots(archiveDir(dir), "dynamic")).toBe(nAfterFirst + 1);
    const latest = latestLayeredSnapshotAbs(archiveDir(dir), "dynamic");
    expect(latest).toBeTruthy();
    const latestText = readFileSync(latest!, "utf8");
    expect(latestText).toBe(target);
    expect(latestText).toContain(bodyC);
    expect(latestText).not.toContain(bodyB);
  });

  it("T-SA-04: validate 不新增 archive 快照", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    await runCli(["dynamic", "write", "--text", "seed_for_validate"], dir);
    const n = countLayeredSnapshots(archiveDir(dir));
    await runCli(["dynamic", "validate", "--text", "draft_only"], dir);
    expect(countLayeredSnapshots(archiveDir(dir))).toBe(n);
    await runCli(["role", "write", "--text", "role_seed"], dir);
    const n2 = countLayeredSnapshots(archiveDir(dir));
    await runCli(["role", "validate", "--text", "draft_role"], dir);
    expect(countLayeredSnapshots(archiveDir(dir))).toBe(n2);
  });

  it("T-SA-05: dynamic write 空串仍 +1 快照且与目标空模板一致", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    await runCli(["dynamic", "write", "--text", "z".repeat(12)], dir);
    const n = countLayeredSnapshots(archiveDir(dir), "dynamic");
    await runCli(["dynamic", "write", "--text", ""], dir);
    expect(countLayeredSnapshots(archiveDir(dir), "dynamic")).toBe(n + 1);
    const target = readMemorySectionFile(dir, "dynamic");
    expect(target.startsWith("---\n")).toBe(true);
    expect(target.split("\n---\n")[1]?.trim() ?? "").toBe("");
    const latest = latestLayeredSnapshotAbs(archiveDir(dir), "dynamic");
    expect(readFileSync(latest!, "utf8")).toBe(target);
  });

  it("T-SA-06: init 后首次 write 也产生 archive 快照", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    expect(countLayeredSnapshots(archiveDir(dir), "dynamic")).toBe(0);
    await runCli(["dynamic", "write", "--text", "first_write_body"], dir);
    expect(countLayeredSnapshots(archiveDir(dir), "dynamic")).toBe(1);
  });

  it("T-SA-07: write 含唯一关键词后 read 联想区命中分层 archive 路径", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const keyword = "kw_snapshot_fixture";
    await runCli(["dynamic", "write", "--text", `${keyword} ${"a".repeat(4)}`], dir);
    await runCli(["role", "write", "--text", keyword], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toMatch(/archive\/\d{4}\/\d{2}\/\d{2}\/dynamic\//);
  });

  it("T-SA-08: write 后 apm read 联想区含 archive/ 路径", async () => {
    const dir = newTempDir();
    await initWithLimits(dir);
    const keyword = "kw_snapshot_fixture_read";
    await runCli(["dynamic", "write", "--text", `${keyword} dynamic note`], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("archive/");
  });
});
