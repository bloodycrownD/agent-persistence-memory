import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "./markdown";
import { DEFAULT_CONFIG } from "../schemas/config";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { migrateLegacyStatusIntoConfig } from "../services/workspace-config-migrate";
import { ConfigSchema } from "../schemas/config";

/**
 * Canonical paths under `.apm/`: memory (role/persist/dynamic + archive),
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

/** True if `.apm` uses an unsupported pre-migration layout (no auto-migration). */
export function isLegacyApmLayout(cwd: string): boolean {
  const root = join(cwd, ".apm");
  if (!existsSync(root)) return false;
  if (existsSync(join(root, "persistence"))) return true;
  const legacyRootRole = existsSync(join(root, "role.md"));
  const memoryRole = existsSync(join(root, "memory", "role.md"));
  if (legacyRootRole && !memoryRole) return true;
  return false;
}

export function assertNotLegacyApmLayout(cwd: string): void {
  if (!isLegacyApmLayout(cwd)) return;
  throw new Error(
    "Old .apm layout detected (e.g. `.apm/persistence` or `.apm/role.md` without `.apm/memory/role.md`). " +
      "Automatic migration is not supported. Back up your data, remove or replace the old .apm tree, then run `apm init`."
  );
}

/** Remove deprecated `.apm/dynamic/` tree; task dynamic now lives in `memory/dynamic.md`. */
function removeLegacyDynamicDir(cwd: string): void {
  const legacy = join(cwd, ".apm", "dynamic");
  if (existsSync(legacy)) rmSync(legacy, { recursive: true, force: true });
}

export function isWorkspaceComplete(cwd: string): boolean {
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

/** Idempotent workspace tree + default section files and kb/docs placeholder. */
export function createWorkspaceIdempotent(cwd: string): void {
  removeLegacyDynamicDir(cwd);
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
 * `apm init`: refuse legacy trees, then create or repair the workspace layout
 * without overwriting existing section bodies.
 */
export function initApmWorkspace(cwd: string): void {
  assertNotLegacyApmLayout(cwd);
  createWorkspaceIdempotent(cwd);
}

/**
 * Prepare `.apm` for normal commands: reject legacy layout; create or repair
 * the full workspace tree when `.apm` is missing or incomplete.
 */
export function ensureWorkspace(cwd: string): void {
  assertNotLegacyApmLayout(cwd);
  const p = apmPaths(cwd);
  if (!existsSync(p.root)) {
    createWorkspaceIdempotent(cwd);
    return;
  }
  migrateLegacyStatusIntoConfig(cwd);
  removeLegacyDynamicDir(cwd);
  if (!isWorkspaceComplete(cwd)) {
    createWorkspaceIdempotent(cwd);
  }
}

/** @deprecated Use {@link isWorkspaceComplete}. */
export const isV2WorkspaceComplete = isWorkspaceComplete;

/** @deprecated Use {@link createWorkspaceIdempotent}. */
export const createWorkspaceV2Idempotent = createWorkspaceIdempotent;
