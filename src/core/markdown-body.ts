import { parseFrontMatter } from "../storage/markdown";

/**
 * 宽松提取 Markdown 正文（供 read / 联想区 / kb 索引共用）：
 * - 统一 `\r\n` → `\n`；
 * - 不以 `---\n` 开头 → 返回全文；
 * - `parseFrontMatter` 成功 → 返回剥离后的正文；
 * - parse 失败 → 返回全文。
 */
export function extractMarkdownBodyRelaxed(raw: string): string {
  const body = raw.replace(/\r\n/g, "\n");
  if (!body.startsWith("---\n")) {
    return body;
  }
  try {
    return parseFrontMatter(body).content;
  } catch {
    return body;
  }
}
