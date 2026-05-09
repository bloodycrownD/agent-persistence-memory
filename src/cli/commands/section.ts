import type { Command } from "commander";
import { ensureApm } from "../../storage/paths";
import { toLineNumbered } from "../../formatters/line-number";
import { parsePositiveInt } from "../../core/validate";
import { editSection, readSectionContent, writeSection } from "../../services/sections-service";
import type { Section } from "../../schemas/config";

export function registerSectionCommands(cmd: Command, section: Section): void {
  cmd.command("show").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    console.log(toLineNumbered(readSectionContent(cwd, section)));
  });

  cmd.command("write").requiredOption("--text <text>").action(async (opts: { text: string }) => {
    const cwd = process.cwd();
    ensureApm(cwd);
    await writeSection(cwd, section, opts.text);
    console.log("OK");
  });

  cmd
    .command("edit")
    .requiredOption("--start <start>")
    .requiredOption("--end <end>")
    .requiredOption("--text <text>")
    .action(async (opts: { start: string; end: string; text: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const start = parsePositiveInt("--start", opts.start);
      const end = parsePositiveInt("--end", opts.end);
      await editSection(cwd, section, start, end, opts.text);
      console.log("OK");
    });
}

