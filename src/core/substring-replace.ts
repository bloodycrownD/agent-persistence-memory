/**
 * Apply an exact substring replacement in section body text (in memory, before write).
 */
export function applySubstringReplace(
  content: string,
  oldText: string,
  newText: string,
  replaceAll: boolean
): string {
  // Empty --old would make split("") degenerate into per-code-unit replacement.
  if (oldText.length === 0) {
    throw new Error("--old must not be empty.");
  }
  if (!content.includes(oldText)) {
    throw new Error("--old text not found in section content.");
  }
  // split/join replaces every occurrence; includes() above guarantees at least one hit.
  if (replaceAll) {
    return content.split(oldText).join(newText);
  }
  // String.replace with a string pattern replaces only the first match.
  return content.replace(oldText, newText);
}
