import type { TodoDoc } from "./todos-service";
import type { ChunkDoc } from "./chunks-service";
import type { ReadAssociations } from "./read-associations";

export function currentTask(todos: TodoDoc[]): TodoDoc | null {
  const open = todos.filter((t) => !t.completed);
  if (open.length === 0) return null;
  return open.sort((a, b) => a.priority - b.priority || a.index - b.index)[0];
}

export function renderReadText(payload: {
  lastTime: string | null;
  now: string;
  role: string;
  persist: string;
  associations: ReadAssociations;
  currentTask: string;
  todos: TodoDoc[];
  detail: string;
  chunks: ChunkDoc[];
}): string {
  const { lastTime, now, role, persist, associations, currentTask, todos, detail, chunks } = payload;
  return [
    "# APM Memory Read",
    `Last Time: ${lastTime ?? "N/A"}`,
    `Current Time: ${now}`,
    "",
    "## Role",
    role || "(empty)",
    "",
    "## Persist",
    persist || "(empty)",
    "",
    "## 持久化关联",
    associations.persistenceKeywords.length === 0
      ? "(empty)"
      : [
          `Keywords: ${associations.persistenceKeywords.join(", ")}`,
          "",
          associations.selectedChunks.length === 0
            ? "Chunks: (empty)"
            : ["Chunks:", ...associations.selectedChunks.map((c) => `- ${c.name} (${c.keywords.join(", ")})`)].join("\n")
        ].join("\n"),
    "",
    "## 联想关键词",
    associations.associativeKeywords.length === 0 ? "(empty)" : associations.associativeKeywords.join(", "),
    "",
    "## Current Task",
    currentTask || "(none)",
    "",
    "## Todos",
    todos.length === 0
      ? "(empty)"
      : todos
          .slice()
          .sort((a, b) => a.priority - b.priority || a.index - b.index)
          .map((t) => `- [${t.completed ? "x" : " "}] #${t.index} p${t.priority} ${t.name}: ${t.description}`)
          .join("\n"),
    "",
    "## Detail",
    detail || "(empty)",
    "",
    "## Chunks",
    chunks.length === 0 ? "(empty)" : chunks.map((c) => `- ${c.name} (${c.keywords.join(", ")})`).join("\n")
  ].join("\n");
}

