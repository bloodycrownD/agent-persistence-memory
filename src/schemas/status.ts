import { z } from "zod";
import { LocalTimestampSchema } from "./local-timestamp";

export const StatusSchema = z.object({
  initializedAt: LocalTimestampSchema,
  updatedAt: LocalTimestampSchema,
  lastReadAt: LocalTimestampSchema.nullable()
});

export const STATUS_SHAPE_HINT = `{
  "initializedAt": "YYYY-MM-DD HH:mm:ss",
  "updatedAt": "YYYY-MM-DD HH:mm:ss",
  "lastReadAt": "YYYY-MM-DD HH:mm:ss | null"
}`;

