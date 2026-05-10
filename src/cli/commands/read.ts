/** `read --json` mirrors `renderReadText` tiers for scripted agents (stable field names per iteration docs). */
import type { Command } from "commander";
import { ensureApm } from "../../storage/paths";
import { nowLocal } from "../../core/time";
import { readSectionContent } from "../../services/sections-service";
import { listTodos } from "../../services/todos-service";
import { listChunks } from "../../services/chunks-service";
import { currentTask, renderReadText } from "../../services/read-service";
import { readStatus, updateStatus } from "../../services/status-service";
import { buildReadAssociations } from "../../services/read-associations";

export function registerRead(program: Command): void {
  program
    .command("read")
    .option("--json", "output JSON")
    .action(async (opts: { json?: boolean }) => {
      const cwd = process.cwd();
      ensureApm(cwd);

      const role = readSectionContent(cwd, "role");
      const persist = readSectionContent(cwd, "persist");
      const detail = readSectionContent(cwd, "tmpDetail");
      const todos = listTodos(cwd);
      const chunks = listChunks(cwd);
      const task = currentTask(todos);
      const currentTaskText = task ? `${task.name}: ${task.description}` : "";
      const associations = buildReadAssociations({
        persistText: persist,
        detailText: detail,
        currentTaskText,
        todos,
        chunks
      });

      const payload = {
        lastTime: readStatus(cwd).lastReadAt,
        now: nowLocal(),
        role,
        persist,
        persistenceLinks: {
          keywords: associations.persistenceKeywords,
          primary: associations.persistencePrimary.map((c) => ({
            name: c.name,
            keywords: c.keywords,
            score: c.score,
            content: c.content
          })),
          secondary: associations.persistenceSecondary.map((c) => ({
            name: c.name,
            keywords: c.keywords,
            score: c.score
          }))
        },
        associativeMemory: {
          primary: associations.associativePrimary.map((c) => ({
            name: c.name,
            keywords: c.keywords,
            score: c.score,
            content: c.content
          })),
          secondary: associations.associativeSecondary.map((c) => ({
            name: c.name,
            keywords: c.keywords,
            score: c.score
          }))
        },
        associative: {
          keywords: associations.associativeKeywords
        },
        currentTask: task ? `${task.name}: ${task.description}` : "",
        todos: todos.map((t) => ({
          name: t.name,
          index: t.index,
          priority: t.priority,
          completed: t.completed,
          description: t.description
        })),
        detail,
        chunks: chunks.map((c) => ({ name: c.name, keywords: c.keywords, content: c.content }))
      };

      await updateStatus(cwd, { lastReadAt: payload.now });

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(
        renderReadText({
          lastTime: payload.lastTime,
          now: payload.now,
          role,
          persist,
          associations,
          currentTask: payload.currentTask,
          todos,
          detail,
          chunks
        })
      );
    });
}

