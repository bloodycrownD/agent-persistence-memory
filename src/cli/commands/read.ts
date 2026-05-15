import type { Command } from "commander";
import { ensureWorkspace } from "../../storage/paths";
import { readSectionContent } from "../../services/sections-service";
import type { Section } from "../../schemas/config";

const SECTION_MAP: Array<{ id: Section; label: string }> = [
  { id: "role", label: "角色" },
  { id: "persist", label: "持久记忆" },
  { id: "dynamicDetail", label: "动态记忆" }
];

export function registerRead(program: Command): void {
  program
    .command("read")
    .description("Show a consolidated view of role, persist, and dynamic memory")
    .action(async () => {
      const cwd = process.cwd();
      ensureWorkspace(cwd);

      const parts: string[] = [];

      for (const { id, label } of SECTION_MAP) {
        try {
          const content = readSectionContent(cwd, id).trim();
          if (content.length > 0) {
            parts.push(`# ${label}\n\n${content}`);
          }
        } catch (e) {
          // If a file is missing or corrupted, we skip it for the consolidated view
          // or we could let it throw if it's a critical error. 
          // ensureWorkspace already checks for file existence.
        }
      }

      if (parts.length > 0) {
        console.log(parts.join("\n\n"));
      }
    });
}
