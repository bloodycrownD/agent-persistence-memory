/**
 * Prevent path traversal and unstable file names in user-provided keys.
 */
export function assertSafeName(name: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Invalid name: ${name}. Allowed characters: letters, numbers, -, _.`);
  }
}

