import type { Command } from "commander";
import { resolveCliBodyText } from "../../core/cli-body-input";
import { unescapeCliText } from "../../core/cli-text-escape";
import { ensureWorkspace } from "../../storage/paths";
import { toLineNumbered } from "../../formatters/line-number";
import { writeDynamicSection } from "../../services/dynamic-archive-service";
import { rebuildKbIndex } from "../../services/kb-index-service";
import {
  readSectionContent,
  replaceSection,
  validateSectionContent,
  writeSection
} from "../../services/sections-service";
import type { Section } from "../../schemas/config";

const MEMORY_INDEX_SECTIONS: Section[] = ["role", "persist", "dynamicDetail"];

async function afterMemorySectionMutation(cwd: string, section: Section): Promise<void> {
  if (MEMORY_INDEX_SECTIONS.includes(section)) {
    await rebuildKbIndex(cwd);
  }
}

export function registerSectionCommands(cmd: Command, section: Section): void {
  cmd.command("show").action(() => {
    const cwd = process.cwd();
    ensureWorkspace(cwd);
    console.log(toLineNumbered(readSectionContent(cwd, section)));
  });

  cmd
    .command("write")
    .option("--text <text>", "Section body text")
    .option("--stdin", "Read body from stdin")
    .action(async (opts: { text?: string; stdin?: boolean }) => {
      const cwd = process.cwd();
      ensureWorkspace(cwd);
      const text = await resolveCliBodyText(opts);
      if (section === "dynamicDetail") {
        await writeDynamicSection(cwd, text);
      } else {
        await writeSection(cwd, section, text);
      }
      await afterMemorySectionMutation(cwd, section);
      console.log("OK");
    });

  cmd
    .command("validate")
    .description("Validate section body length without writing to disk")
    .option("--text <text>", "Section body text")
    .option("--stdin", "Read body from stdin")
    .action(async (opts: { text?: string; stdin?: boolean }) => {
      const cwd = process.cwd();
      ensureWorkspace(cwd);
      const text = await resolveCliBodyText(opts);
      const { len, max } = validateSectionContent(cwd, section, text);
      console.log(`OK: ${len}/${max}`);
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
      const oldText = unescapeCliText(opts.old);
      const newText = unescapeCliText(opts.new);
      await replaceSection(cwd, section, oldText, newText, Boolean(opts.all));
      await afterMemorySectionMutation(cwd, section);
      console.log("OK");
    });
}
