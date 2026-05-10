/**
 * Canonical length/description rules for chunk and todo bodies before disk write.
 * Services call these so every entry path enforces the same limits as the CLI.
 */

import {
  CHUNK_TEXT_LENGTH_ERROR,
  TODO_COMBO_LENGTH_ERROR,
  TODO_DESCRIPTION_REQUIRED_ERROR
} from "./limits-messages";
import { countChars } from "./validate";

export function assertChunkContentWithinLimit(content: string): void {
  if (countChars(content) > 200) {
    throw new Error(CHUNK_TEXT_LENGTH_ERROR);
  }
}

export function assertTodoWritable(todo: { name: string; description: string }): void {
  if (!todo.description.trim()) {
    throw new Error(TODO_DESCRIPTION_REQUIRED_ERROR);
  }
  if (countChars(`${todo.name}${todo.description}`) > 100) {
    throw new Error(TODO_COMBO_LENGTH_ERROR);
  }
}
