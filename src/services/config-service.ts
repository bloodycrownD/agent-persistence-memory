import { readFileSync } from "node:fs";
import { z } from "zod";
import { apmPaths, ensureWorkspace } from "../storage/paths";
import { formatZodError } from "../core/schema-errors";
import { CONFIG_SHAPE_HINT, ConfigSchema, DEFAULT_CONFIG } from "../schemas/config";
import { withGlobalLock } from "../storage/fs-lock";
import { serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

function mergeConfigWithDefaults(raw: unknown): z.input<typeof ConfigSchema> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { limits: { ...DEFAULT_CONFIG.limits } };
  }
  const o = raw as Record<string, unknown>;
  const lim = o.limits;
  const limitsObj = lim !== null && typeof lim === "object" && !Array.isArray(lim) ? (lim as Record<string, unknown>) : {};
  const pick = (key: keyof typeof DEFAULT_CONFIG.limits) => {
    const cur = limitsObj[key];
    const base = DEFAULT_CONFIG.limits[key];
    if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      const c = cur as Record<string, unknown>;
      return {
        min: typeof c.min === "number" ? c.min : base.min,
        max: typeof c.max === "number" ? c.max : base.max
      };
    }
    return { ...base };
  };
  return {
    limits: {
      role: pick("role"),
      persist: pick("persist"),
      dynamicDetail: pick("dynamicDetail"),
      kbDynamicDetail: pick("kbDynamicDetail")
    }
  };
}

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
