import type { Command } from "commander";
import { ensureApm } from "../../storage/paths";
import { registerSectionCommands } from "./section";
import { toLineNumbered } from "../../formatters/line-number";
import { readSectionContent } from "../../services/sections-service";

export function registerDynamic(program: Command): void {
  const dynamic = program.command("dynamic");

  const detailCmd = dynamic.command("detail");
  registerSectionCommands(detailCmd, "dynamicDetail");

  dynamic.command("show").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const detail = readSectionContent(cwd, "dynamicDetail");
    console.log(toLineNumbered(detail || "(empty)"));
  });
}
