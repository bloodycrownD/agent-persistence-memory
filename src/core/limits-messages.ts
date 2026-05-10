/**
 * Shared error strings for chunk/todo write limits so CLI and services stay aligned.
 */

export const CHUNK_TEXT_LENGTH_ERROR = "Chunk text must be <= 200 characters (countChars).";

export const TODO_COMBO_LENGTH_ERROR = "Todo name + description must be <= 100 chars.";

export const TODO_DESCRIPTION_REQUIRED_ERROR = "Todo description is required.";

/** renameChunk is only for file renames; same-name updates must go through writeChunk. */
export const RENAME_CHUNK_REQUIRES_DISTINCT_NAMES =
  "renameChunk requires a distinct target name; when fromName equals next.name, use writeChunk instead.";
