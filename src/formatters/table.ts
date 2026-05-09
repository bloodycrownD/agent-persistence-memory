export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const render = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i], " ")).join(" | ");
  return [render(headers), widths.map((w) => "-".repeat(w)).join("-|-"), ...rows.map(render)].join("\n");
}

