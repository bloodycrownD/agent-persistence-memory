import { z } from "zod";
import { LOCAL_TIMESTAMP_RE } from "./local-timestamp";

export const DEFAULT_CONFIG = {
  initializedAt: "2020-01-01 00:00:00",
  updatedAt: "2020-01-01 00:00:00",
  lastReadAt: null as string | null
} as const;

export const ConfigSchema = z.object({
  initializedAt: z.string().regex(LOCAL_TIMESTAMP_RE),
  updatedAt: z.string().regex(LOCAL_TIMESTAMP_RE),
  lastReadAt: z.string().regex(LOCAL_TIMESTAMP_RE).nullable()
});

export type Section = "role" | "persist" | "dynamicDetail";

export const CONFIG_SHAPE_HINT = `{
  "initializedAt": "YYYY-MM-DD HH:mm:ss",
  "updatedAt": "YYYY-MM-DD HH:mm:ss",
  "lastReadAt": null
}`;
