import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "./markdown";
import { DEFAULT_CONFIG } from "../schemas/config";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { migrateLegacyStatusIntoConfig } from "../services/workspace-config-migrate";
import { ConfigSchema } from "../schemas/config";

/**
 * `.apm/` 规范路径：memory 三段在 `memory/`；archive 在 `kb/archive`；
 * kb 含 docs、index（及 archive）。调用方应使用本对象而非硬编码布局段。
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
    kbIndexDir: join(root, "kb", "index"),
    kbSearchIndexGz: join(root, "kb", "index", "search.json.gz")
  };
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** 若 `.apm` 为不支持自动迁移的旧布局则返回 true。 */
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

/** 删除已废弃的 dynamic 路径；任务动态记忆位于 `memory/dynamic.md`。 */
function removeDeprecatedDynamicPaths(cwd: string): void {
  const root = join(cwd, ".apm");
  for (const rel of ["dynamic", join("kb", "dynamic")]) {
    const path = join(root, rel);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
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
    isDir(p.kbIndexDir) &&
    existsSync(p.config)
  );
}

/** 幂等创建工作区目录树、默认记忆段文件与 kb/docs 占位。 */
export function createWorkspaceIdempotent(cwd: string): void {
  removeDeprecatedDynamicPaths(cwd);
  const p = apmPaths(cwd);
  mkdirSync(p.root, { recursive: true });
  mkdirSync(join(p.root, "memory"), { recursive: true });
  mkdirSync(p.kbArchiveDir, { recursive: true });
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
 * `apm init`：拒绝旧布局后创建或修复工作区目录树，不覆盖已有记忆段正文。
 */
export function initApmWorkspace(cwd: string): void {
  assertNotLegacyApmLayout(cwd);
  createWorkspaceIdempotent(cwd);
}

/**
 * 为普通命令准备 `.apm`：拒绝旧布局；缺失或不完整时创建或修复完整工作区树。
 */
export function ensureWorkspace(cwd: string): void {
  assertNotLegacyApmLayout(cwd);
  const p = apmPaths(cwd);
  if (!existsSync(p.root)) {
    createWorkspaceIdempotent(cwd);
    return;
  }
  migrateLegacyStatusIntoConfig(cwd);
  removeDeprecatedDynamicPaths(cwd);
  if (!isWorkspaceComplete(cwd)) {
    createWorkspaceIdempotent(cwd);
  }
}
