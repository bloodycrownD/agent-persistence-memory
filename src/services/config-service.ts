import { readFileSync } from "node:fs";
import { z } from "zod";
import { mergeConfigWithDefaults } from "../core/workspace-config-merge";
import { apmPaths, ensureWorkspace } from "../storage/paths";
import { formatZodError } from "../core/schema-errors";
import { CONFIG_SHAPE_HINT, ConfigSchema } from "../schemas/config";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

export { mergeConfigWithDefaults } from "../core/workspace-config-merge";

export function readConfig(cwd: string) {
  ensureWorkspace(cwd);
  const path = apmPaths(cwd).config;
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const merged = mergeConfigWithDefaults(raw);
  try {
    return ConfigSchema.parse(merged);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(
        formatZodError({
          filePath: path,
          label: "config file",
          error: e,
          expectedShapeHint: CONFIG_SHAPE_HINT
        })
      );
    }
    throw e;
  }
}

export function writeConfig(cwd: string, config: z.infer<typeof ConfigSchema>): Promise<void> {
  const p = apmPaths(cwd);
  return withGlobalLock(p.lock, async () => {
    await serialWrite(p.config, async () => {
      await atomicWrite(p.config, JSON.stringify(config, null, 2));
    });
  });
}
