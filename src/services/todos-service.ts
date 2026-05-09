import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { assertSafeName } from "../core/name-sanitize";
import { formatZodError } from "../core/schema-errors";
import { parseFrontMatter, renderFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { TODO_FRONT_MATTER_HINT, TodoMetaSchema } from "../schemas/todo";
import { withGlobalLock } from "../storage/fs-lock";
import { serialRm, serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

export type TodoDoc = z.infer<typeof TodoMetaSchema> & { description: string };

function todoPath(cwd: string, name: string): string {
  assertSafeName(name);
  return join(apmPaths(cwd).todosDir, `${name}.md`);
}

export function readTodoFile(path: string): TodoDoc {
  const parsed = parseFrontMatter(readFileSync(path, "utf8"));
  try {
    const meta = TodoMetaSchema.parse(parsed.meta);
    return { ...meta, description: parsed.content };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(
        formatZodError({
          filePath: path,
          label: "todo front matter",
          error: e,
          expectedShapeHint: TODO_FRONT_MATTER_HINT
        })
      );
    }
    throw e;
  }
}

export function listTodos(cwd: string): TodoDoc[] {
  const dir = apmPaths(cwd).todosDir;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readTodoFile(join(dir, f)))
    .sort((a, b) => a.index - b.index);
}

export async function writeTodo(cwd: string, todo: TodoDoc): Promise<void> {
  const paths = apmPaths(cwd);
  await withGlobalLock(paths.lock, async () => {
    await writeTodoUnlocked(cwd, todo);
  });
}

async function writeTodoUnlocked(cwd: string, todo: TodoDoc): Promise<void> {
  const file = todoPath(cwd, todo.name);
  const payload = renderFrontMatter(
    {
      name: todo.name,
      index: todo.index,
      priority: todo.priority,
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt
    },
    todo.description
  );
  await serialWrite(file, async () => {
    await atomicWrite(file, payload);
  });
}

export async function rmTodoByName(cwd: string, name: string): Promise<void> {
  const paths = apmPaths(cwd);
  const path = todoPath(cwd, name);
  if (!existsSync(path)) return;
  await withGlobalLock(paths.lock, async () => {
    await serialRm(path);
  });
}

export async function renameTodo(cwd: string, fromName: string, next: TodoDoc): Promise<void> {
  const paths = apmPaths(cwd);
  await withGlobalLock(paths.lock, async () => {
    if (fromName !== next.name) {
      const oldPath = todoPath(cwd, fromName);
      if (existsSync(oldPath)) {
        await serialRm(oldPath);
      }
    }
    await writeTodoUnlocked(cwd, next);
  });
}

export async function clearTodos(cwd: string): Promise<void> {
  const paths = apmPaths(cwd);
  await withGlobalLock(paths.lock, async () => {
    for (const file of readdirSync(paths.todosDir)) {
      if (file.endsWith(".md")) {
        await serialRm(join(paths.todosDir, file));
      }
    }
  });
}

