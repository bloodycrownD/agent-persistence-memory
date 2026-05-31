import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "./markdown";
import { DEFAULT_CONFIG } from "../schemas/config";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { migrateLegacyStatusIntoConfig } from "../services/workspace-config-migrate";
import { ConfigSchema } from "../schemas/config";

/**
 * Canonical v2 paths under `.apm/`: memory (role/persist/dynamic + archive),
 * kb (docs, dynamic/detail, index/search.json.gz). Callers use this object
 * instead of hard-coding layout segments.
 */
export function apmPaths(cwd: string) {
  const root = join(cwd, ".apm");
  return {
    root,
    config: join(root, "config.json"),
    lock: join(root, ".write.lock"),
    memoryRole: join(root, "memory", "role.md"),
    memoryPersist: join(root, "memory", "persist.md"),
    memoryDynamic: join(root, "memory", "dynamic.md"),
    kbRoot: join(root, "kb"),
    kbArchiveDir: join(root, "kb", "archive"),
    kbDocs: join(root, "kb", "docs"),
    kbDynamicDetail: join(root, "kb", "dynamic", "detail.md"),
    kbIndexDir: join(root, "kb", "index"),
    kbSearchIndexGz: join(root, "kb", "index", "search.json.gz")
  };
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** True if `.apm` uses pre-v2 paths (no auto-migration). */
export function isLegacyApmLayout(cwd: string): boolean {
  const root = join(cwd, ".apm");
  if (!existsSync(root)) return false;
  if (existsSync(join(root, "persistence"))) return true;
  // Pre-v2 task dynamic lived under `.apm/dynamic/` (e.g. detail.md). Any such tree
  // coexisting with a partial v2 upgrade is unsafe; refuse until user removes it.
  if (existsSync(join(root, "dynamic"))) return true;
  const legacyRootRole = existsSync(join(root, "role.md"));
  const v2MemoryRole = existsSync(join(root, "memory", "role.md"));
  if (legacyRootRole && !v2MemoryRole) return true;
  return false;
}

export function assertNotLegacyApmLayout(cwd: string): void {
  if (!isLegacyApmLayout(cwd)) return;
  throw new Error(
    "Old .apm layout detected (e.g. `.apm/persistence`, `.apm/dynamic/`, or `.apm/role.md` without `.apm/memory/role.md`). " +
      "Automatic migration is not supported. Back up your data, remove or replace the old .apm tree, then run `apm init`."
  );
}

export function isV2WorkspaceComplete(cwd: string): boolean {
  const p = apmPaths(cwd);
  if (!existsSync(p.root)) return false;
  return (
    existsSync(p.memoryRole) &&
    existsSync(p.memoryPersist) &&
    existsSync(p.memoryDynamic) &&
    isDir(p.kbArchiveDir) &&
    isDir(p.kbDocs) &&
    existsSync(p.kbDynamicDetail) &&
    isDir(p.kbIndexDir) &&
    existsSync(p.config)
  );
}

/** Idempotent v2 tree + default section files and kb/docs placeholder. */
export function createWorkspaceV2Idempotent(cwd: string): void {
  const p = apmPaths(cwd);
  mkdirSync(p.root, { recursive: true });
  mkdirSync(join(p.root, "memory"), { recursive: true });
  mkdirSync(p.kbArchiveDir, { recursive: true });
  mkdirSync(join(p.root, "kb", "dynamic"), { recursive: true });
  mkdirSync(p.kbDocs, { recursive: true });
  mkdirSync(p.kbIndexDir, { recursive: true });

  const now = nowLocal();
  if (!existsSync(p.config)) {
    const cfg = ConfigSchema.parse(
      mergeConfigWithDefaults({
        limits: DEFAULT_CONFIG.limits,
        initializedAt: now,
        updatedAt: now,
        lastReadAt: null
      })
    );
    writeFileSync(p.config, JSON.stringify(cfg, null, 2), "utf8");
  }
  const emptySection = renderFrontMatter({ createdAt: now, updatedAt: now }, "");
  if (!existsSync(p.memoryRole)) writeFileSync(p.memoryRole, emptySection, "utf8");
  if (!existsSync(p.memoryPersist)) writeFileSync(p.memoryPersist, emptySection, "utf8");
  if (!existsSync(p.memoryDynamic)) writeFileSync(p.memoryDynamic, emptySection, "utf8");
  if (!existsSync(p.kbDynamicDetail)) writeFileSync(p.kbDynamicDetail, emptySection, "utf8");

  const kbReadme = join(p.kbDocs, "README.md");
  if (!existsSync(kbReadme)) {
    writeFileSync(
      kbReadme,
      "# Knowledge base\n\nAdd Markdown (`.md`) files here. Nested directories are allowed.\n",
      "utf8"
    );
  }
}

/**
 * `apm init`: refuse legacy trees, then create or repair the v2 layout without
 * overwriting existing section bodies.
 */
export function initApmWorkspace(cwd: string): void {
  assertNotLegacyApmLayout(cwd);
  createWorkspaceV2Idempotent(cwd);
}

/**
 * Prepare `.apm` for normal commands: reject legacy layout; lazily create a
 * full v2 tree when `.apm` is missing; otherwise require a complete v2 tree
 * (run `apm init` if incomplete).
 */
export function ensureWorkspace(cwd: string): void {
  assertNotLegacyApmLayout(cwd);
  const p = apmPaths(cwd);
  if (!existsSync(p.root)) {
    createWorkspaceV2Idempotent(cwd);
    return;
  }
  migrateLegacyStatusIntoConfig(cwd);
  if (!isV2WorkspaceComplete(cwd)) {
    throw new Error("Incomplete .apm workspace (v2). Run `apm init` to create the full directory layout.");
  }
}
