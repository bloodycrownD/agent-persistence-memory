import { z } from "zod";

const LOCAL_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export const DEFAULT_CONFIG = {
  limits: {
    role: { min: 50, max: 100 },
    persist: { min: 300, max: 500 },
    dynamicDetail: { min: 500, max: 1000 },
    kbDynamicDetail: { min: 500, max: 1000 }
  },
  initializedAt: "2020-01-01 00:00:00",
  updatedAt: "2020-01-01 00:00:00",
  lastReadAt: null as string | null
} as const;

export const ConfigSchema = z.object({
  limits: z.object({
    role: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    persist: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    dynamicDetail: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    kbDynamicDetail: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) })
  }),
  initializedAt: z.string().regex(LOCAL_TIMESTAMP_RE),
  updatedAt: z.string().regex(LOCAL_TIMESTAMP_RE),
  lastReadAt: z.string().regex(LOCAL_TIMESTAMP_RE).nullable()
});

export type Limits = { min: number; max: number };
export type Section = "role" | "persist" | "dynamicDetail" | "kbDynamicDetail";

export const CONFIG_SHAPE_HINT = `{
  "limits": {
    "role": { "min": 50, "max": 100 },
    "persist": { "min": 300, "max": 500 },
    "dynamicDetail": { "min": 500, "max": 1000 },
    "kbDynamicDetail": { "min": 500, "max": 1000 }
  },
  "initializedAt": "YYYY-MM-DD HH:mm:ss",
  "updatedAt": "YYYY-MM-DD HH:mm:ss",
  "lastReadAt": null
}`;
