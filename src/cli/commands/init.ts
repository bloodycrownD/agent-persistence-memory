import type { Command } from "commander";
import { initApmWorkspace } from "../../storage/paths";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create the .apm directory layout (idempotent)")
    .action(() => {
      initApmWorkspace(process.cwd());
      console.log("OK");
    });
}
