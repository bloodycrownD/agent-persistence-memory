import { z } from "zod";

export const DEFAULT_CONFIG = {
  limits: {
    role: { min: 50, max: 100 },
    persist: { min: 300, max: 500 },
    dynamicDetail: { min: 500, max: 1000 }
  }
} as const;

export const ConfigSchema = z.object({
  limits: z.object({
    role: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    persist: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    dynamicDetail: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) })
  })
});

export type Limits = { min: number; max: number };
export type Section = "role" | "persist" | "dynamicDetail";

export const CONFIG_SHAPE_HINT = `{
  "limits": {
    "role": { "min": 50, "max": 100 },
    "persist": { "min": 300, "max": 500 },
    "dynamicDetail": { "min": 500, "max": 1000 }
  }
}`;
