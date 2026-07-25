import { describe, expect, it } from "vitest";
import { extractMarkdownBodyRelaxed } from "../src/core/markdown-body";
import { parseFrontMatter } from "../src/storage/markdown";

/** 模拟 kb-index 侧 body 提取（与 extractKbDoc 的 body 路径一致）。 */
function kbIndexBody(raw: string): string {
  return extractMarkdownBodyRelaxed(raw);
}

/** 模拟 sections 宽松读路径。 */
function sectionsRelaxedBody(raw: string): string {
  return extractMarkdownBodyRelaxed(raw);
}

describe("extractMarkdownBodyRelaxed parity", () => {
  const cases: Array<{ name: string; raw: string; expected?: string }> = [
    {
      name: "无 FM",
      raw: "plain body without front matter"
    },
    {
      name: "合法 FM",
      raw: [
        "---",
        'createdAt: "2026-01-01 10:00:00"',
        'updatedAt: "2026-01-01 10:00:00"',
        "---",
        "body after good fm"
      ].join("\n"),
      expected: "body after good fm"
    },
    {
      name: "坏 YAML（未闭合）",
      raw: "---\ncreatedAt: [unterminated\n---\nkeep full"
    },
    {
      name: "坏 meta 时间戳",
      raw: [
        "---",
        'createdAt: "bad-time"',
        'updatedAt: "2026-01-01 10:00:00"',
        "---",
        "body after bad meta"
      ].join("\n"),
      expected: "body after bad meta"
    }
  ];

  for (const c of cases) {
    it(`parity: ${c.name}`, () => {
      const a = sectionsRelaxedBody(c.raw);
      const b = kbIndexBody(c.raw);
      expect(a).toBe(b);
      if (c.expected !== undefined) {
        expect(a).toBe(c.expected);
      }
    });
  }

  it("合法 FM 与 parseFrontMatter.content 一致", () => {
    const raw = [
      "---",
      'createdAt: "2026-01-01 10:00:00"',
      'updatedAt: "2026-01-01 11:00:00"',
      "---",
      "hello"
    ].join("\n");
    expect(extractMarkdownBodyRelaxed(raw)).toBe(parseFrontMatter(raw).content);
  });
});
