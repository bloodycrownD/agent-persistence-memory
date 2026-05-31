import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ConfigSchema } from "../schemas/config";
import { apmPaths } from "../storage/paths";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { atomicWrite } from "../storage/fs-atomic";

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

  // Config-wins when both files define a field; status fills gaps only (spec §6 step 3).
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
  // No await: atomicWrite has no internal await, so the write finishes in this tick.
  void atomicWrite(p.config, JSON.stringify(parsed, null, 2));
  rmSync(statusPath, { force: true });
}
