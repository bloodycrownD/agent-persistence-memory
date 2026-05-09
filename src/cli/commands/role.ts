import type { Command } from "commander";
import { registerSectionCommands } from "./section";

export function registerRole(program: Command): void {
  const roleCmd = program.command("role");
  registerSectionCommands(roleCmd, "role");
}

