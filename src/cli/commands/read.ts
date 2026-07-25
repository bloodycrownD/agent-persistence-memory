/**
 * @module read
 * 汇总输出核心记忆段（role / persist / dynamic），供 Agent 初始化上下文。
 */

import type { Command } from "commander";
import { ensureWorkspace } from "../../storage/paths";
import { readSectionContentRelaxed } from "../../services/sections-service";
import {
  computeReadAssociation,
  formatAssociationSection
} from "../../services/read-association-service";
import type { Section } from "../../schemas/config";

/** 汇总视图中各记忆段的展示顺序与标题。 */
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
          const content = readSectionContentRelaxed(cwd, id).trim();
          // 仅输出有实质内容的段，保持 Agent 上下文简洁。
          if (content.length > 0) {
            parts.push(`# ${label}\n\n${content}`);
          }
        } catch (e) {
          // 文件缺失等 I/O 错误仍告警，避免段静默消失。
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
