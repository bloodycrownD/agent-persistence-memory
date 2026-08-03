import type { Command } from "commander";
import { readConfig } from "../../services/config-service";

export function registerConfig(program: Command): void {
  const config = program.command("config");

  config.command("show").action(() => {
    const cfg = readConfig(process.cwd());
    console.log(JSON.stringify(cfg, null, 2));
  });
}
