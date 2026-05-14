import type { Command } from "commander";
import { ensureWorkspace } from "../../storage/paths";

export function registerRead(program: Command): void {
  program
    .command("read")
    .option("--json", "output JSON")
    .action(async () => {
      ensureWorkspace(process.cwd());
      console.log("开发中");
    });
}
