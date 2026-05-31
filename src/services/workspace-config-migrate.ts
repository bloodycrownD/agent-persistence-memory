import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigSchema } from "../schemas/config";
import { apmPaths } from "../storage/paths";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";

const LEGACY_STATUS_FILE = "status.json";

/**
 * One-time merge of legacy `.apm/status.json` into `config.json`, then delete status file.
 * Idempotent when status.json is already absent. Sync only — safe inside `ensureWorkspace`.
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

  // Prefer legacy status.json fields when both files exist (one-time migration).
  const merged = mergeConfigWithDefaults({
    ...base,
    initializedAt: statusRaw.initializedAt ?? base.initializedAt,
    updatedAt: statusRaw.updatedAt ?? base.updatedAt,
    lastReadAt:
      statusRaw.lastReadAt !== undefined
        ? statusRaw.lastReadAt
        : base.lastReadAt !== undefined
          ? base.lastReadAt
          : null
  });

  const parsed = ConfigSchema.parse(merged);
  writeFileSync(p.config, JSON.stringify(parsed, null, 2), "utf8");
  rmSync(statusPath, { force: true });
}
