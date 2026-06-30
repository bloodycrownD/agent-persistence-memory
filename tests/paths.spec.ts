import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNotLegacyApmLayout,
  createWorkspaceIdempotent,
  ensureWorkspace,
  isLegacyApmLayout,
  isWorkspaceComplete
} from "../src/storage/paths";
import { newTempDir } from "./helpers/cli-harness";

describe("workspace paths", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("removes deprecated .apm/dynamic on ensureWorkspace", () => {
    dir = newTempDir();
    createWorkspaceIdempotent(dir);
    mkdirSync(join(dir, ".apm", "dynamic"), { recursive: true });
    writeFileSync(join(dir, ".apm", "dynamic", "detail.md"), "old", "utf8");

    ensureWorkspace(dir);

    expect(existsSync(join(dir, ".apm", "dynamic"))).toBe(false);
    expect(isWorkspaceComplete(dir)).toBe(true);
  });

  it("auto-repairs incomplete workspace on ensureWorkspace", () => {
    dir = newTempDir();
    createWorkspaceIdempotent(dir);
    rmSync(join(dir, ".apm", "kb", "dynamic", "detail.md"), { force: true });
    expect(isWorkspaceComplete(dir)).toBe(false);

    ensureWorkspace(dir);

    expect(isWorkspaceComplete(dir)).toBe(true);
    expect(existsSync(join(dir, ".apm", "kb", "dynamic", "detail.md"))).toBe(true);
  });

  it("creates workspace when .apm is missing", () => {
    dir = newTempDir();
    ensureWorkspace(dir);
    expect(isWorkspaceComplete(dir)).toBe(true);
  });

  it("still rejects unsupported legacy persistence layout", () => {
    dir = newTempDir();
    mkdirSync(join(dir, ".apm", "persistence"), { recursive: true });
    expect(isLegacyApmLayout(dir)).toBe(true);
    expect(() => assertNotLegacyApmLayout(dir)).toThrow(/Old \.apm layout/i);
    expect(() => ensureWorkspace(dir)).toThrow(/Old \.apm layout/i);
  });

  it("still rejects legacy root role.md without memory/role.md", () => {
    dir = newTempDir();
    mkdirSync(join(dir, ".apm"), { recursive: true });
    writeFileSync(join(dir, ".apm", "role.md"), "legacy", "utf8");
    expect(isLegacyApmLayout(dir)).toBe(true);
  });

  it("does not treat .apm/dynamic alone as legacy layout", () => {
    dir = newTempDir();
    mkdirSync(join(dir, ".apm", "dynamic"), { recursive: true });
    expect(isLegacyApmLayout(dir)).toBe(false);
  });
});
