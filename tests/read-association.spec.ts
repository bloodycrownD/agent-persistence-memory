import { rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_ASSOC_DETAIL_LINE_LEN,
  truncateAssocDisplayLine
} from "../src/services/read-association-service";
import { newTempDir, runCli } from "./helpers/cli-harness";
import {
  assocEntryBlocks,
  assocPercentHeaders,
  assocPercentValues,
  setupAssocWorkspace,
  seedMemorySection,
  trimKbIndexFixtures,
  writeKbArchiveDoc
} from "./helpers/read-association";

describe("apm read association area", () => {
  it("T-READ-ASSOC-1: read shows memory sections then association with percent header", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_feat1_shared";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(["persist", "write", "--text", `${kw} persist note`], dir);
    await runCli(["dynamic", "write", "--text", `${kw} dynamic note`], dir);
    await runCli(
      ["kb", "write", "--path", "assoc-topic.md", "--text", `# Assoc\n\n${kw} in knowledge base.\n`],
      dir
    );
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const roleIdx = out.indexOf("# 角色");
    const persistIdx = out.indexOf("# 持久记忆");
    const dynamicIdx = out.indexOf("# 动态记忆");
    const assocIdx = out.indexOf("# 联想区");
    expect(roleIdx).toBeGreaterThanOrEqual(0);
    expect(persistIdx).toBeGreaterThan(roleIdx);
    expect(dynamicIdx).toBeGreaterThan(persistIdx);
    expect(assocIdx).toBeGreaterThan(dynamicIdx);
    expect(assocPercentHeaders(out).length).toBeGreaterThanOrEqual(1);
  });

  it("T-READ-ASSOC-2: detailed tier shows 5 hits sorted by match percent descending", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_many_shared";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 8; i++) {
      await runCli(
        ["kb", "write", "--path", `a${i}.md`, "--text", `# Doc ${i}\n\n${kw} token ${i}.\n`],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const blocks = assocEntryBlocks(out);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    const detailedPercents = blocks.slice(0, 5).map((b) => Number(b.match(/\[(\d+)%\]/)?.[1] ?? -1));
    expect(detailedPercents.length).toBe(5);
    for (let i = 1; i < detailedPercents.length; i++) {
      expect(detailedPercents[i]).toBeLessThanOrEqual(detailedPercents[i - 1]);
    }
  });

  it("T-READ-ASSOC-3: only two hits yields two association headers", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_two_only";
    seedMemorySection(dir, "role", kw);
    await runCli(["kb", "write", "--path", "t0.md", "--text", `# T0\n${kw}\n`], dir);
    await runCli(["kb", "write", "--path", "t1.md", "--text", `# T1\n${kw}\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(assocPercentHeaders(out).length).toBe(2);
  });

  it("T-READ-ASSOC-4: caps at 15 unique paths when many docs match", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_cap20_shared";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 22; i++) {
      await runCli(
        ["kb", "write", "--path", `cap${i}.md`, "--text", `# Cap ${i}\n\n${kw} item ${i}.\n`],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const headers = assocPercentHeaders(out);
    expect(headers.length).toBe(15);
    const paths = headers.map((h) => h.match(/^\[\d+%\]\s+(\S+)/)?.[1] ?? "");
    expect(new Set(paths).size).toBe(15);
  });

  it("T-READ-ASSOC-5: summary tier has no line-number body rows", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_summary_nolines";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 30; i++) {
      await runCli(
        [
          "kb",
          "write",
          "--path",
          `sum${i}.md`,
          "--text",
          `# Sum ${i}\n\n${kw} line-one-${i}\n${kw} line-two-${i}\n${kw} line-three-${i}\n`
        ],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const assoc = out.slice(out.indexOf("# 联想区"));
    const headers = assocPercentHeaders(assoc);
    expect(headers.length).toBe(15);
    for (let i = 5; i < headers.length; i++) {
      const start = assoc.indexOf(headers[i]);
      const end = i + 1 < headers.length ? assoc.indexOf(headers[i + 1]) : assoc.length;
      expect(assoc.slice(start, end)).not.toMatch(/^\d+\|/m);
    }
  });

  it("T-READ-ASSOC-6: archive markdown is searchable outside kb/docs", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_archive_only";
    await runCli(["role", "write", "--text", kw], dir);
    writeKbArchiveDoc(dir, "only-here.md", `# Archive only\n\n${kw} lives in archive.\n`);
    await runCli(["kb", "write", "--path", "other.md", "--text", "# Other\n\nunrelated content.\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("archive/only-here.md");
  });

  it("T-READ-ASSOC-7: association tracks role context changes", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kwA = "zzassoc_only_alpha_token";
    const kwB = "zzassoc_only_bravo_token";
    await runCli(["dynamic", "write", "--text", kwA], dir);
    await runCli(["kb", "write", "--path", "hit-a.md", "--text", `# A\n\n${kwA} only here.\n`], dir);
    await runCli(["kb", "write", "--path", "hit-b.md", "--text", `# B\n\n${kwB} only here.\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const first = await runCli(["read"], dir);
    expect(first.out).toContain("docs/hit-a.md");
    const firstA = first.out.match(/\[(\d+)%\]\s+docs\/hit-a\.md/)?.[1];
    const firstB = first.out.match(/\[(\d+)%\]\s+docs\/hit-b\.md/)?.[1];
    expect(Number(firstA)).toBeGreaterThan(Number(firstB ?? 0));
    await runCli(["role", "write", "--text", kwB], dir);
    await runCli(["dynamic", "write", "--text", ""], dir);
    const second = await runCli(["read"], dir);
    expect(second.out).toContain("docs/hit-b.md");
    const secondB = second.out.match(/\[(\d+)%\]\s+docs\/hit-b\.md/)?.[1];
    const secondA = second.out.match(/\[(\d+)%\]\s+docs\/hit-a\.md/)?.[1];
    expect(Number(secondB)).toBeGreaterThan(Number(secondA ?? 0));
  });

  it("T-READ-ASSOC-8: match percents are 0-100 with at least one 100", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_percent_range";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(["kb", "write", "--path", "p0.md", "--text", `# P0\n${kw}\n`], dir);
    await runCli(["kb", "write", "--path", "p1.md", "--text", `# P1\n${kw} extra\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const percents = assocPercentValues(out);
    expect(percents.length).toBeGreaterThan(0);
    for (const p of percents) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
    expect(percents).toContain(100);
  });

  it("T-READ-ASSOC-9: stopwords are not shown as association keywords", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    await runCli(["role", "write", "--text", "the a uniquekw"], dir);
    await runCli(["kb", "write", "--path", "stop.md", "--text", "# Stop\n\nuniquekw appears here.\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const firstHeader = assocPercentHeaders(out)[0] ?? "";
    expect(firstHeader).toContain("uniquekw");
    expect(firstHeader).not.toMatch(/\bthe\b/i);
    expect(firstHeader).not.toMatch(/\ba\b/i);
  });

  it("T-READ-ASSOC-9b: caps keywords and filters Chinese particles", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    await runCli(
      ["role", "write", "--text", "的一个多个得之类 zzassoc_kw_cap_test 都是项目结构"],
      dir
    );
    await runCli(
      [
        "kb",
        "write",
        "--path",
        "zh-stop.md",
        "--text",
        "# ZH\n\nzzassoc_kw_cap_test 项目结构 apm read 联想区.\n"
      ],
      dir
    );
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const firstHeader = assocPercentHeaders(out)[0] ?? "";
    expect(firstHeader).toMatch(/ 关键词：/);
    const pathMatch = firstHeader.match(/^\[\d+%\]\s+(\S+)\s+关键词：(.*)$/);
    const kwPart = pathMatch?.[2] ?? "";
    const kws = kwPart.split(/\s+/).filter(Boolean);
    expect(kws.length).toBeLessThanOrEqual(4);
    expect(kws).toContain("zzassoc_kw_cap_test");
    expect(kws).not.toContain("的");
    expect(kws).not.toContain("得");
    expect(kws).not.toContain("一个");
    expect(kws).not.toContain("多个");
  });

  it("T-READ-ASSOC-10: missing index still prints memory and rebuild hint", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    await runCli(["role", "write", "--text", "zzassoc_missing_idx"], dir);
    await runCli(["kb", "write", "--path", "x.md", "--text", "# X\nzzassoc_missing_idx\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    rmSync(join(dir, ".apm", "kb", "index", "search.json.gz"), { force: true });
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("# 角色");
    expect(out).toContain("# 联想区");
    expect(out).toMatch(/kb index rebuild/i);
  });

  it("T-READ-ASSOC-11: no hits omits association section", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    seedMemorySection(dir, "role", "zzassoc_no_overlap_ctx");
    await runCli(["kb", "write", "--path", "unrelated.md", "--text", "# U\n\nzzassoc_kb_other_token\n"], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).not.toContain("# 联想区");
  });

  it("T-READ-ASSOC-12: detailed entry shows at most three matching source lines", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_multiline_kw";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(
      [
        "kb",
        "write",
        "--path",
        "multiline.md",
        "--text",
        `# Multi\n\nline1 ${kw}\nline2 ${kw}\nline3 ${kw}\nline4 ${kw}\nline5 ${kw}\n`
      ],
      dir
    );
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    expect(out).toContain("docs/multiline.md");
    const assoc = out.slice(out.indexOf("# 联想区"));
    const entryMatch = assoc.match(
      /\[(\d+)%\]\s+docs\/multiline\.md[^\n]*\n((?:\d+\|[^\n]+\n?){1,3})/
    );
    expect(entryMatch).toBeTruthy();
    const bodyLines = entryMatch![2].match(/^\d+\|/gm) ?? [];
    expect(bodyLines.length).toBeGreaterThan(0);
    expect(bodyLines.length).toBeLessThanOrEqual(3);
  });

  it("T-READ-ASSOC-13: summary tier headers are compact (single newline between)", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_compact_summary";
    await runCli(["role", "write", "--text", kw], dir);
    for (let i = 0; i < 12; i++) {
      await runCli(
        ["kb", "write", "--path", `compact${i}.md`, "--text", `# C${i}\n\n${kw} item ${i}.\n`],
        dir
      );
    }
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const assoc = out.slice(out.indexOf("# 联想区"));
    const headers = assocPercentHeaders(assoc);
    expect(headers.length).toBeGreaterThanOrEqual(6);
    const h4 = headers[4];
    const h5 = headers[5];
    const betweenTiers = assoc.slice(assoc.indexOf(h4) + h4.length, assoc.indexOf(h5));
    expect(betweenTiers.endsWith("\n\n")).toBe(true);
    for (let i = 5; i < headers.length - 1; i++) {
      const h0 = headers[i];
      const h1 = headers[i + 1];
      const gap = assoc.indexOf(h1) - assoc.indexOf(h0) - h0.length;
      expect(gap).toBe(1);
    }
  });

  it("T-READ-ASSOC-14: association headers include 关键词： label", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_kw_label";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(["kb", "write", "--path", "label.md", "--text", `# Label\n\n${kw} here.\n`], dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const headers = assocPercentHeaders(out);
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      if (h.includes("label.md")) {
        expect(h).toMatch(/ 关键词：/);
        return;
      }
    }
    expect(headers.some((h) => / 关键词：/.test(h))).toBe(true);
  });

  it("T-READ-ASSOC-15: long detail lines are truncated with ...", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_long_line_kw";
    const longBody = "x".repeat(130);
    seedMemorySection(dir, "role", kw);
    await runCli(
      [
        "kb",
        "write",
        "--path",
        "longline.md",
        "--text",
        `# Long\n\n${kw} ${longBody}\n`
      ],
      dir
    );
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const assoc = out.slice(out.indexOf("# 联想区"));
    const detailLine = assoc.split("\n").find((line) => /^\d+\|.*zzassoc_long_line_kw/.test(line));
    expect(detailLine).toBeTruthy();
    expect(detailLine!.endsWith("...")).toBe(true);
    expect(detailLine!.length).toBeLessThanOrEqual(MAX_ASSOC_DETAIL_LINE_LEN + 3);
  });

  it("T-READ-ASSOC-16: short detail lines are not truncated", async () => {
    const dir = newTempDir();
    await setupAssocWorkspace(dir);
    const kw = "zzassoc_short_line_kw";
    await runCli(["role", "write", "--text", kw], dir);
    await runCli(
      ["kb", "write", "--path", "shortline.md", "--text", `# Short\n\nshort ${kw} body.\n`],
      dir
    );
    trimKbIndexFixtures(dir);
    await runCli(["kb", "index", "rebuild"], dir);
    const { out } = await runCli(["read"], dir);
    const assoc = out.slice(out.indexOf("# 联想区"));
    const detailLines = assoc.split("\n").filter((line) => /^\d+\|/.test(line));
    expect(detailLines.length).toBeGreaterThan(0);
    for (const line of detailLines) {
      expect(line.endsWith("...")).toBe(false);
    }
  });
});

describe("truncateAssocDisplayLine", () => {
  it("appends ... when line exceeds maxLen", () => {
    const line = "a".repeat(121);
    const out = truncateAssocDisplayLine(line);
    expect(out.length).toBe(123);
    expect(out.endsWith("...")).toBe(true);
  });

  it("leaves line unchanged at exactly maxLen", () => {
    const line = "a".repeat(120);
    expect(truncateAssocDisplayLine(line)).toBe(line);
    expect(truncateAssocDisplayLine(line).endsWith("...")).toBe(false);
  });

  it("truncates full lineNo|text display line", () => {
    const prefix = "12|";
    const line = prefix + "b".repeat(200);
    const out = truncateAssocDisplayLine(line);
    expect(out.startsWith(prefix)).toBe(true);
    expect(out.length).toBe(MAX_ASSOC_DETAIL_LINE_LEN + 3);
    expect(out.endsWith("...")).toBe(true);
  });
});
