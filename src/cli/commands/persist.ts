import type { Command } from "commander";
import { registerSectionCommands } from "./section";

export function registerPersist(program: Command): void {
  const persistCmd = program.command("persist");
  registerSectionCommands(persistCmd, "persist");
}

