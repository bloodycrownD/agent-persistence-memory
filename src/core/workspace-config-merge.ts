import { z } from "zod";
import { nowLocal } from "./time";
import { ConfigSchema, DEFAULT_CONFIG } from "../schemas/config";

const LOCAL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function pickTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && LOCAL_TIMESTAMP_RE.test(value) ? value : fallback;
}

function pickLastReadAt(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === "string" && LOCAL_TIMESTAMP_RE.test(value) ? value : null;
}

/** Merge parsed JSON with defaults for limits and workspace status fields. */
export function mergeConfigWithDefaults(raw: unknown): z.input<typeof ConfigSchema> {
  const now = nowLocal();
  const o =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lim = o.limits;
  const limitsObj = lim !== null && typeof lim === "object" && !Array.isArray(lim) ? (lim as Record<string, unknown>) : {};
  const pickLimit = (key: keyof typeof DEFAULT_CONFIG.limits) => {
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
      role: pickLimit("role"),
      persist: pickLimit("persist"),
      dynamicDetail: pickLimit("dynamicDetail"),
      kbDynamicDetail: pickLimit("kbDynamicDetail")
    },
    initializedAt: pickTimestamp(o.initializedAt, now),
    updatedAt: pickTimestamp(o.updatedAt, now),
    lastReadAt: pickLastReadAt(o.lastReadAt)
  };
}
