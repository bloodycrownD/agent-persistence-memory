import { z } from "zod";

const LOCAL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export const DEFAULT_CONFIG = {
  limits: {
    role: { max: 100 },
    persist: { max: 800 },
    dynamicDetail: { max: 1500 },
    kbDynamicDetail: { max: 1500 }
  },
  initializedAt: "2020-01-01 00:00:00",
  updatedAt: "2020-01-01 00:00:00",
  lastReadAt: null as string | null
} as const;

export const ConfigSchema = z.object({
  limits: z.object({
    role: z.object({ max: z.number().int().min(1) }),
    persist: z.object({ max: z.number().int().min(1) }),
    dynamicDetail: z.object({ max: z.number().int().min(1) }),
    kbDynamicDetail: z.object({ max: z.number().int().min(1) })
  }),
  initializedAt: z.string().regex(LOCAL_TIMESTAMP_RE),
  updatedAt: z.string().regex(LOCAL_TIMESTAMP_RE),
  lastReadAt: z.string().regex(LOCAL_TIMESTAMP_RE).nullable()
});

/** 记忆段长度上限配置（仅 max，无下限）。 */
export type Limits = { max: number };
export type Section = "role" | "persist" | "dynamicDetail" | "kbDynamicDetail";

export const CONFIG_SHAPE_HINT = `{
  "limits": {
    "role": { "max": 100 },
    "persist": { "max": 800 },
    "dynamicDetail": { "max": 1500 },
    "kbDynamicDetail": { "max": 1500 }
  },
  "initializedAt": "YYYY-MM-DD HH:mm:ss",
  "updatedAt": "YYYY-MM-DD HH:mm:ss",
  "lastReadAt": null
}`;
