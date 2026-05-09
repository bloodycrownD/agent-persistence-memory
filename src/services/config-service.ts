import { z } from "zod";
import { apmPaths, ensureApm } from "../storage/paths";
import { readJson } from "../storage/json";
import { CONFIG_SHAPE_HINT, ConfigSchema } from "../schemas/config";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

export function readConfig(cwd: string) {
  ensureApm(cwd);
  return readJson(apmPaths(cwd).config, ConfigSchema, { label: "config file", expectedShapeHint: CONFIG_SHAPE_HINT });
}

export function writeConfig(cwd: string, config: z.infer<typeof ConfigSchema>): Promise<void> {
  const p = apmPaths(cwd);
  return withGlobalLock(p.lock, async () => {
    await serialWrite(p.config, async () => {
      await atomicWrite(p.config, JSON.stringify(config, null, 2));
    });
  });
}

