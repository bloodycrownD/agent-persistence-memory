import { z } from "zod";

export const StatusSchema = z.object({
  initializedAt: z.string(),
  updatedAt: z.string(),
  lastReadAt: z.string().nullable()
});

export const STATUS_SHAPE_HINT = `{
  "initializedAt": "YYYY-MM-DD HH:mm:ss",
  "updatedAt": "YYYY-MM-DD HH:mm:ss",
  "lastReadAt": "YYYY-MM-DD HH:mm:ss | null"
}`;

