import type { Command } from "commander";

export function registerRead(program: Command): void {
  program
    .command("read")
    .option("--json", "output JSON")
    .option("--with-all-chunks", "append full chunk index (debug); default off to match prompt template")
    .action(async () => {
      console.log("开发中");
    });
}
