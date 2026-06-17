/** 按 Unicode 码点计数字符串长度。 */
export function countChars(text: string): number {
  return Array.from(text).length;
}

/**
 * 按 Unicode 码点将文本截断至不超过 `max` 个字符。
 * 若原文长度 ≤ max，则原样返回。
 */
export function truncateToMaxChars(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}
