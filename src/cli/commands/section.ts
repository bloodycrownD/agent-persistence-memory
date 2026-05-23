import type { Command } from "commander";
import { ensureWorkspace } from "../../storage/paths";
import { toLineNumbered } from "../../formatters/line-number";
import { readSectionContent, replaceSection, writeSection } from "../../services/sections-service";
import type { Section } from "../../schemas/config";

export function registerSectionCommands(cmd: Command, section: Section): void {
  cmd.command("show").action(() => {
    const cwd = process.cwd();
    ensureWorkspace(cwd);
    console.log(toLineNumbered(readSectionContent(cwd, section)));
  });

  cmd.command("write").requiredOption("--text <text>").action(async (opts: { text: string }) => {
    const cwd = process.cwd();
    ensureWorkspace(cwd);
    await writeSection(cwd, section, opts.text);
    console.log("OK");
  });

  cmd
    .command("replace")
    .description("Replace --old substring in section body (first occurrence by default)")
    .requiredOption("--old <old>", "Exact substring to find")
    .requiredOption("--new <new>", "Replacement text (may be empty)")
    .option("--all", "Replace all occurrences of --old")
    .action(async (opts: { old: string; new: string; all?: boolean }) => {
      const cwd = process.cwd();
      ensureWorkspace(cwd);
      await replaceSection(cwd, section, opts.old, opts.new, Boolean(opts.all));
      console.log("OK");
    });
}
