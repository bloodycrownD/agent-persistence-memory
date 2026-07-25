import type { Command } from "commander";
import { rebuildKbIndex, searchKb } from "../../services/kb-index-service";

export function registerKb(program: Command): void {
  const kb = program.command("kb");

  kb.command("search").requiredOption("--q <query>", "Search query").action((opts: { q: string }) => {
    const cwd = process.cwd();
    const hits = searchKb(cwd, opts.q, 5);
    if (hits.length === 0) {
      console.log("(no results)");
      return;
    }
    for (const h of hits) {
      console.log(`${h.path}\t${h.title || "(untitled)"}\tscore=${h.score.toFixed(4)}`);
    }
  });

  const index = kb.command("index");
  index.command("rebuild").action(async () => {
    await rebuildKbIndex(process.cwd());
    console.log("OK");
  });
}
