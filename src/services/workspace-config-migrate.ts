import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ConfigSchema } from "../schemas/config";
import { apmPaths } from "../storage/paths";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { atomicWrite } from "../storage/fs-atomic";

const LEGACY_STATUS_FILE = "status.json";

/**
 * 一次性将遗留 `.apm/status.json` 合并进 `config.json`，随后删除 status 文件。
 * status.json 已不存在时幂等。纯同步——可在 `ensureWorkspace` 内安全调用。
 */
export function migrateLegacyStatusIntoConfig(cwd: string): void {
  const p = apmPaths(cwd);
  const statusPath = join(p.root, LEGACY_STATUS_FILE);
  if (!existsSync(statusPath)) return;

  let statusRaw: Record<string, unknown> = {};
  try {
    statusRaw = JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, unknown>;
  } catch {
    statusRaw = {};
  }

  let configRaw: unknown = {};
  if (existsSync(p.config)) {
    try {
      configRaw = JSON.parse(readFileSync(p.config, "utf8"));
    } catch {
      configRaw = {};
    }
  }

  const base =
    configRaw !== null && typeof configRaw === "object" && !Array.isArray(configRaw)
      ? (configRaw as Record<string, unknown>)
      : {};

  // 两文件均定义同一字段时以 config 为准；status 仅补缺（spec §6 步骤 3）。
  const merged = mergeConfigWithDefaults({
    ...base,
    initializedAt: base.initializedAt ?? statusRaw.initializedAt,
    updatedAt: base.updatedAt ?? statusRaw.updatedAt,
    lastReadAt:
      base.lastReadAt !== undefined
        ? base.lastReadAt
        : statusRaw.lastReadAt !== undefined
          ? statusRaw.lastReadAt
          : null
  });

  const parsed = ConfigSchema.parse(merged);
  // 无需 await：atomicWrite 内部无 await，本 tick 内写完。
  void atomicWrite(p.config, JSON.stringify(parsed, null, 2));
  rmSync(statusPath, { force: true });
}
