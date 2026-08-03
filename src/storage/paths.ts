import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "./markdown";
import { DEFAULT_CONFIG } from "../schemas/config";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { ConfigSchema } from "../schemas/config";

/**
 * `.apm/` 规范路径：memory 三段在 `memory/`；archive 在 `archive/`；
 * config（含 `index.gz` 与 `config.json`）在 `config/`。
 * docs 位于项目根 `docs/`（不入 `.apm`，可纳入版本控制）。
 * 调用方应使用本对象而非硬编码布局段。
 */
export function apmPaths(cwd: string) {
  const root = join(cwd, ".apm");
  const configDir = join(root, "config");
  return {
    root,
    configDir,
    config: join(configDir, "config.json"),
    lock: join(root, ".write.lock"),
    memoryRole: join(root, "memory", "role.md"),
    memoryPersist: join(root, "memory", "persist.md"),
    memoryDynamic: join(root, "memory", "dynamic.md"),
    archiveDir: join(root, "archive"),
    docsDir: join(cwd, "docs"),
    searchIndexGz: join(configDir, "index.gz")
  };
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

export function isWorkspaceComplete(cwd: string): boolean {
  const p = apmPaths(cwd);
  if (!existsSync(p.root)) return false;
  return (
    existsSync(p.memoryRole) &&
    existsSync(p.memoryPersist) &&
    existsSync(p.memoryDynamic) &&
    isDir(p.archiveDir) &&
    isDir(p.configDir) &&
    existsSync(p.config)
  );
}

/** 幂等创建工作区目录树与默认记忆段文件；docs 由用户在项目根自行管理。 */
export function createWorkspaceIdempotent(cwd: string): void {
  const p = apmPaths(cwd);
  mkdirSync(p.root, { recursive: true });
  mkdirSync(join(p.root, "memory"), { recursive: true });
  mkdirSync(p.archiveDir, { recursive: true });
  mkdirSync(p.configDir, { recursive: true });

  const now = nowLocal();
  if (!existsSync(p.config)) {
    const cfg = ConfigSchema.parse(
      mergeConfigWithDefaults({
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
}

/** `apm init`：创建或修复工作区目录树，不覆盖已有记忆段正文。 */
export function initApmWorkspace(cwd: string): void {
  createWorkspaceIdempotent(cwd);
}

/** 为普通命令准备 `.apm`：缺失或不完整时创建或修复完整工作区树。 */
export function ensureWorkspace(cwd: string): void {
  const p = apmPaths(cwd);
  if (!existsSync(p.root)) {
    createWorkspaceIdempotent(cwd);
    return;
  }
  if (!isWorkspaceComplete(cwd)) {
    createWorkspaceIdempotent(cwd);
  }
}
