/**
 * Human-readable read snapshot: mirrors JSON tiers so agents see the same primary/secondary split as `--json`.
 */
import type { TodoDoc } from "./todos-service";
import type { ChunkDoc } from "./chunks-service";
import type { ReadAssociations } from "./read-associations";

export function currentTask(todos: TodoDoc[]): TodoDoc | null {
  const open = todos.filter((t) => !t.completed);
  if (open.length === 0) return null;
  return open.sort((a, b) => a.priority - b.priority || a.index - b.index)[0];
}

function renderTierSections(associations: ReadAssociations): string[] {
  const lines: string[] = [];

  lines.push(
    "## 持久化关联",
    associations.persistenceKeywords.length === 0
      ? "(empty)"
      : [
          `Keywords: ${associations.persistenceKeywords.join(", ")}`,
          "",
          "### Primary",
          associations.persistencePrimary.length === 0
            ? "(empty)"
            : associations.persistencePrimary
                .map((c) =>
                  [
                    `#### ${c.name}`,
                    `keywords: ${c.keywords.join(", ")}`,
                    `score: ${c.score}`,
                    "",
                    c.content
                  ].join("\n")
                )
                .join("\n\n"),
          "",
          "### Secondary",
          associations.persistenceSecondary.length === 0
            ? "(empty)"
            : associations.persistenceSecondary
                .map((c) => `- ${c.name} (${c.keywords.join(", ")}) — score: ${c.score}`)
                .join("\n")
        ].join("\n")
  );

  lines.push(
    "",
    "## 联想记忆",
    associations.associativePrimary.length === 0 && associations.associativeSecondary.length === 0
      ? "(empty)"
      : [
          "### Primary",
          associations.associativePrimary.length === 0
            ? "(empty)"
            : associations.associativePrimary
                .map((c) =>
                  [
                    `#### ${c.name}`,
                    `keywords: ${c.keywords.join(", ")}`,
                    `score: ${c.score}`,
                    "",
                    c.content
                  ].join("\n")
                )
                .join("\n\n"),
          "",
          "### Secondary",
          associations.associativeSecondary.length === 0
            ? "(empty)"
            : associations.associativeSecondary
                .map((c) => `- ${c.name} (${c.keywords.join(", ")}) — score: ${c.score}`)
                .join("\n")
        ].join("\n")
  );

  lines.push("", "## 联想关键词", associations.associativeKeywords.length === 0 ? "(empty)" : associations.associativeKeywords.join(", "));

  return lines;
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
    ...renderTierSections(associations),
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
    "## Chunks（附录）",
    chunks.length === 0 ? "(empty)" : chunks.map((c) => `- ${c.name} (${c.keywords.join(", ")})`).join("\n")
  ].join("\n");
}
