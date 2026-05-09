export function parsePositiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${flag}: ${raw}. Expected a finite positive integer.`);
  }
  return n;
}

export function countChars(text: string): number {
  return Array.from(text).length;
}

export function validateRange(lines: string[], start: number, end: number): void {
  if (start < 1 || end < 1 || start > end) {
    throw new Error("Invalid range: start and end must be >= 1 and start <= end.");
  }
  if (start > lines.length || end > lines.length) {
    throw new Error("Edit range out of bounds.");
  }
}

