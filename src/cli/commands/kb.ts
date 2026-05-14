import type { Command } from "commander";
import { apmPaths, ensureWorkspace } from "../../storage/paths";
import { resolveKbDocPath } from "../../core/kb-path";
import { atomicWrite } from "../../storage/fs-atomic";
import { withGlobalLock } from "../../storage/fs-lock";
import { serialWrite } from "../../storage/serial";
import { importKbMarkdownFromDir } from "../../services/kb-import-service";
import { rebuildKbIndex, searchKb } from "../../services/kb-index-service";
import { registerSectionCommands } from "./section";

export function registerKb(program: Command): void {
  const kb = program.command("kb");

  kb.command("import")
    .requiredOption("--from <dir>", "Source directory of Markdown files to copy into kb/docs")
    .action(async (opts: { from: string }) => {
      const cwd = process.cwd();
      importKbMarkdownFromDir(cwd, opts.from);
      await rebuildKbIndex(cwd);
      console.log("OK");
    });

  kb.command("write")
    .requiredOption("--path <rel>", "Relative path under kb/docs (must end with .md)")
    .requiredOption("--text <text>", "File contents")
    .action(async (opts: { path: string; text: string }) => {
      const cwd = process.cwd();
      ensureWorkspace(cwd);
      const paths = apmPaths(cwd);
      const dest = resolveKbDocPath(paths.kbDocs, opts.path);
      await withGlobalLock(paths.lock, async () => {
        await serialWrite(dest, async () => {
          await atomicWrite(dest, opts.text);
        });
      });
      console.log("OK");
    });

  kb.command("search").requiredOption("--q <query>", "Search query").action((opts: { q: string }) => {
    const cwd = process.cwd();
    const hits = searchKb(cwd, opts.q, 5);
    if (hits.length === 0) {
      console.log("(no results)");
      return;
    }
    for (const h of hits) {
      console.log(`${h.path}\t${h.title || "(untitled)"}\tscore=${h.score.toFixed(4)}`);
    }
  });

  const index = kb.command("index");
  index.command("rebuild").action(async () => {
    await rebuildKbIndex(process.cwd());
    console.log("OK");
  });

  const kbDynamic = kb.command("dynamic");
  registerSectionCommands(kbDynamic, "kbDynamicDetail");
}
