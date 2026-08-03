import { z } from "zod";
import { nowLocal } from "./time";
import { ConfigSchema } from "../schemas/config";
import { LOCAL_TIMESTAMP_RE } from "../schemas/local-timestamp";

function pickTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && LOCAL_TIMESTAMP_RE.test(value) ? value : fallback;
}

function pickLastReadAt(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === "string" && LOCAL_TIMESTAMP_RE.test(value) ? value : null;
}

/** 将解析后的 JSON 与工作区状态字段合并。 */
export function mergeConfigWithDefaults(raw: unknown): z.input<typeof ConfigSchema> {
  const now = nowLocal();
  const o =
    raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    initializedAt: pickTimestamp(o.initializedAt, now),
    updatedAt: pickTimestamp(o.updatedAt, now),
    lastReadAt: pickLastReadAt(o.lastReadAt)
  };
}
