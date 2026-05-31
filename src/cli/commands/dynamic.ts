import type { Command } from "commander";
import { registerSectionCommands } from "./section";

export function registerDynamic(program: Command): void {
  const dynamic = program.command("dynamic");
  registerSectionCommands(dynamic, "dynamicDetail");
}
