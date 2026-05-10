/** Tmp todos remain bounded so open work stays scannable in read snapshots. */
import type { Command } from "commander";
import { ensureApm } from "../../storage/paths";
import { registerSectionCommands } from "./section";
import { toLineNumbered } from "../../formatters/line-number";
import { table } from "../../formatters/table";
import { assertSafeName } from "../../core/name-sanitize";
import { parsePositiveInt } from "../../core/validate";
import { nowLocal } from "../../core/time";
import { readSectionContent } from "../../services/sections-service";
import { clearTodos, listTodos, renameTodo, rmTodoByName, writeTodo } from "../../services/todos-service";

export function registerTmp(program: Command): void {
  const tmp = program.command("tmp");

  const detailCmd = tmp.command("detail");
  registerSectionCommands(detailCmd, "tmpDetail");

  tmp.command("show").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const detail = readSectionContent(cwd, "tmpDetail");
    const todos = listTodos(cwd)
      .map((t) => `- [${t.completed ? "x" : " "}] #${t.index} p${t.priority} ${t.name}: ${t.description}`)
      .join("\n");
    console.log(toLineNumbered(`## Todos\n${todos || "(empty)"}\n\n## Detail\n${detail || "(empty)"}`));
  });

  const todos = tmp.command("todos");

  todos.command("show").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const content = listTodos(cwd)
      .map((t) => `#${t.index} [${t.completed ? "x" : " "}] p${t.priority} ${t.name}: ${t.description}`)
      .join("\n");
    console.log(toLineNumbered(content || "(empty)"));
  });

  todos.command("list").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const items = listTodos(cwd).sort((a, b) => a.priority - b.priority || a.index - b.index);
    console.log(
      table(
        ["index", "priority", "done", "name", "description"],
        items.map((t) => [String(t.index), String(t.priority), t.completed ? "yes" : "no", t.name, t.description])
      )
    );
  });

  todos
    .command("add")
    .requiredOption("--name <name>")
    .requiredOption("--description <description>")
    .requiredOption("--index <index>")
    .option("--priority <priority>", "priority (lower is higher)", "5")
    .action(async (opts: { name: string; description: string; index: string; priority: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      assertSafeName(opts.name);
      const all = listTodos(cwd);
      if (all.length >= 20) {
        throw new Error("Todo limit reached (20). Merge, remove, or archive tasks before adding.");
      }
      const index = parsePositiveInt("--index", opts.index);
      const priority = parsePositiveInt("--priority", opts.priority);
      if (all.some((t) => t.name === opts.name)) throw new Error(`Todo name exists: ${opts.name}`);
      if (all.some((t) => t.index === index)) throw new Error(`Todo index exists: ${index}`);
      const now = nowLocal();
      await writeTodo(cwd, {
        name: opts.name,
        description: opts.description,
        index,
        priority,
        completed: false,
        createdAt: now,
        updatedAt: now
      });
      console.log("OK");
    });

  todos
    .command("rm")
    .requiredOption("--index <index>")
    .action(async (opts: { index: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const index = parsePositiveInt("--index", opts.index);
      const item = listTodos(cwd).find((t) => t.index === index);
      if (!item) throw new Error(`Todo index not found: ${index}`);
      await rmTodoByName(cwd, item.name);
      console.log("OK");
    });

  todos
    .command("edit")
    .requiredOption("--index <index>")
    .option("--name <name>")
    .option("--description <description>")
    .action(async (opts: { index: string; name?: string; description?: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const all = listTodos(cwd);
      const index = parsePositiveInt("--index", opts.index);
      const current = all.find((t) => t.index === index);
      if (!current) throw new Error(`Todo index not found: ${index}`);

      const nextName = opts.name ?? current.name;
      assertSafeName(nextName);
      if (nextName !== current.name && all.some((t) => t.name === nextName)) {
        throw new Error(`Todo name exists: ${nextName}`);
      }
      const nextDescription = opts.description ?? current.description;

      await renameTodo(cwd, current.name, {
        ...current,
        name: nextName,
        description: nextDescription,
        updatedAt: nowLocal()
      });
      console.log("OK");
    });

  todos.command("clear").action(async () => {
    const cwd = process.cwd();
    ensureApm(cwd);
    await clearTodos(cwd);
    console.log("OK");
  });

  todos
    .command("complete")
    .requiredOption("--index <index>")
    .option("--done <done>", "true/false", "true")
    .action(async (opts: { index: string; done: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const all = listTodos(cwd);
      const index = parsePositiveInt("--index", opts.index);
      const current = all.find((t) => t.index === index);
      if (!current) throw new Error(`Todo index not found: ${index}`);
      await writeTodo(cwd, { ...current, completed: opts.done === "true", updatedAt: nowLocal() });
      console.log("OK");
    });

  todos
    .command("priority")
    .requiredOption("--index <index>")
    .requiredOption("--priority <priority>")
    .action(async (opts: { index: string; priority: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const all = listTodos(cwd);
      const index = parsePositiveInt("--index", opts.index);
      const priority = parsePositiveInt("--priority", opts.priority);
      const current = all.find((t) => t.index === index);
      if (!current) throw new Error(`Todo index not found: ${index}`);
      await writeTodo(cwd, { ...current, priority, updatedAt: nowLocal() });
      console.log("OK");
    });
}

