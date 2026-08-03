import type { Command } from "commander";
import { rebuildKbIndex } from "../../services/kb-index-service";

export function registerIndex(program: Command): void {
  const index = program.command("index");
  index.command("build").action(async () => {
    await rebuildKbIndex(process.cwd());
    console.log("OK");
  });
}
