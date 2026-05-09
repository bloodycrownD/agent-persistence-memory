import { z } from "zod";
import { LocalTimestampSchema } from "./local-timestamp";

export const TodoMetaSchema = z.object({
  name: z.string().min(1),
  index: z.number().int().min(1),
  priority: z.number().int().min(1),
  completed: z.boolean(),
  createdAt: LocalTimestampSchema,
  updatedAt: LocalTimestampSchema
});

export const TODO_FRONT_MATTER_HINT = `---
name: "todo-name"
index: 1
priority: 5
completed: false
createdAt: "YYYY-MM-DD HH:mm:ss"
updatedAt: "YYYY-MM-DD HH:mm:ss"
---
<description>`;

