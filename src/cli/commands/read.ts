import type { Command } from "commander";

export function registerRead(program: Command): void {
  program
    .command("read")
    .option("--json", "output JSON")
    .action(async () => {
      console.log("开发中");
    });
}
