import { z } from "zod";

export function formatZodError(args: {
  filePath: string;
  label: string;
  error: z.ZodError;
  expectedShapeHint?: string;
}): string {
  const { filePath, label, error, expectedShapeHint } = args;

  const fields = error.issues
    .map((i) => {
      const path = i.path.length ? i.path.join(".") : "(root)";
      return `- ${path}: ${i.message}`;
    })
    .join("\n");

  const hint = expectedShapeHint ? `\nExpected shape hint:\n${expectedShapeHint}` : "";
  return `Invalid ${label}: ${filePath}\nFailing field(s):\n${fields}${hint}`;
}

