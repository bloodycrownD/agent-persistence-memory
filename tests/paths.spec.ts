import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkspaceIdempotent,
  ensureWorkspace,
  isWorkspaceComplete
} from "../src/storage/paths";
import { newTempDir } from "./helpers/cli-harness";

describe("workspace paths", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("auto-repairs incomplete workspace on ensureWorkspace", () => {
    dir = newTempDir();
    createWorkspaceIdempotent(dir);
    rmSync(join(dir, ".apm", "memory", "persist.md"), { force: true });
    expect(isWorkspaceComplete(dir)).toBe(false);

    ensureWorkspace(dir);

    expect(isWorkspaceComplete(dir)).toBe(true);
    expect(existsSync(join(dir, ".apm", "memory", "persist.md"))).toBe(true);
  });

  it("creates workspace when .apm is missing", () => {
    dir = newTempDir();
    ensureWorkspace(dir);
    expect(isWorkspaceComplete(dir)).toBe(true);
  });
});
