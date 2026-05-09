export function toLineNumbered(text: string): string {
  const lines = text.length === 0 ? [""] : text.split("\n");
  return lines.map((line, idx) => `${idx + 1}|${line}`).join("\n");
}

