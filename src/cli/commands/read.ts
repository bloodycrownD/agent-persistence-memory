/**
 * @module read
 * Provides a consolidated view of all core memory sections (role, persist, dynamic).
 * This is the primary command used by Agents to initialize their context.
 */

import type { Command } from "commander";
import { ensureWorkspace } from "../../storage/paths";
import { readSectionContent } from "../../services/sections-service";
import {
  computeReadAssociation,
  formatAssociationSection
} from "../../services/read-association-service";
import type { Section } from "../../schemas/config";

/**
 * Defines the order and display labels for the consolidated memory view.
 */
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
          // Only include sections that have meaningful content to keep the Agent's context clean.
          if (content.length > 0) {
            parts.push(`# ${label}\n\n${content}`);
          }
        } catch (e) {
          // Report errors (like YAML corruption) instead of silently skipping,
          // so the user knows why a section is missing from the output.
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`Warning: Failed to read section "${label}": ${msg}`);
        }
      }

      const assocText = formatAssociationSection(computeReadAssociation(cwd));
      if (assocText) parts.push(assocText);

      if (parts.length > 0) {
        console.log(parts.join("\n\n"));
      }
    });
}
