import type { Command } from "commander";
import { ensureWorkspace } from "../../storage/paths";
import { registerSectionCommands } from "./section";
import { archiveMemoryDynamic, clearMemoryDynamic } from "../../services/dynamic-archive-service";

export function registerDynamic(program: Command): void {
  const dynamic = program.command("dynamic");
  registerSectionCommands(dynamic, "dynamicDetail");

  dynamic.command("archive").description("Copy memory/dynamic.md into kb/archive/ with a timestamped filename").action(async () => {
    const cwd = process.cwd();
    ensureWorkspace(cwd);
    await archiveMemoryDynamic(cwd);
    console.log("OK");
  });

  dynamic.command("clear").description("Reset memory/dynamic.md to an empty section template").action(async () => {
    const cwd = process.cwd();
    ensureWorkspace(cwd);
    await clearMemoryDynamic(cwd);
    console.log("OK");
  });
}
