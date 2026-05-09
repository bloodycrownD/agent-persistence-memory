import { readFileSync } from "node:fs";
import { z } from "zod";
import { formatZodError } from "../core/schema-errors";

export function readJson<T>(path: string, schema: z.ZodType<T>, opts?: { label?: string; expectedShapeHint?: string }): T {
  const raw = readFileSync(path, "utf8");
  try {
    return schema.parse(JSON.parse(raw));
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(
        formatZodError({
          filePath: path,
          label: opts?.label ?? "json file",
          error: e,
          expectedShapeHint: opts?.expectedShapeHint
        })
      );
    }
    throw e;
  }
}

