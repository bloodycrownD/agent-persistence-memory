import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/index";
import { parseFrontMatter } from "../src/storage/markdown";
import { newTempDir, resolveCommand, runCli, runCliFail, runCliWithExit } from "./helpers/cli-harness";

describe("apm section replace", () => {
  it("T-REP-01: section help lists show/write/replace without edit", async () => {
    const program = buildProgram();
    for (const path of [["role"], ["persist"], ["dynamic"], ["kb", "dynamic"]] as const) {
      const cmd = resolveCommand(program, ...path);
      expect(cmd).toBeDefined();
      const names = cmd!.commands.map((c) => c.name());
      expect(names).toEqual(expect.arrayContaining(["show", "write", "replace"]));
      expect(names).not.toContain("edit");
      const help = cmd!.helpInformation();
      expect(help).toMatch(/show/);
      expect(help).toMatch(/write/);
      expect(help).toMatch(/replace/);
      expect(help).not.toMatch(/\bedit\b/);
    }
  });

  it("T-REP-02: edit subcommand is unavailable", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "unchanged"], dir);
    const { code, stderr } = await runCliWithExit(
      ["role", "edit", "--start", "1", "--end", "1", "--text", "x"],
      dir
    );
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/unknown command/i);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|unchanged");
  });

  it("T-REP-03: replace substitutes first occurrence only", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "alpha beta alpha"], dir);
    await runCli(["role", "replace", "--old", "alpha", "--new", "X"], dir);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|X beta alpha");
  });

  it("T-REP-04: replace fails when --old not found", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "hello"], dir);
    const err = await runCliFail(["role", "replace", "--old", "missing", "--new", "Y"], dir);
    expect(err).toContain("not found");
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|hello");
  });

  it("T-REP-05: replace without --all changes only first match", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "aa"], dir);
    await runCli(["role", "replace", "--old", "a", "--new", "b"], dir);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|ba");
  });

  it("T-REP-06: replace --all substitutes every occurrence", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "a|a|a"], dir);
    await runCli(["role", "replace", "--old", "a", "--new", "b", "--all"], dir);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|b|b|b");
  });

  it("T-REP-07: replace --all still fails when --old not found", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "hello"], dir);
    const err = await runCliFail(["role", "replace", "--old", "missing", "--new", "Y", "--all"], dir);
    expect(err).toContain("not found");
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|hello");
  });

  it("T-REP-08: replace rejects empty --old", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "hello"], dir);
    const err = await runCliFail(["role", "replace", "--old", "", "--new", "x"], dir);
    expect(err).toContain("must not be empty");
  });

  it("T-REP-09: replace respects section limits and leaves file unchanged on failure", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "5"], dir);
    await runCli(["role", "write", "--text", "abcde"], dir);
    const err = await runCliFail(["role", "replace", "--old", "a", "--new", "ZZZZZ"], dir);
    expect(err).toMatch(/length must be|chars/i);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|abcde");
  });

  it("T-REP-09b: replace rejects result below section min and leaves file unchanged", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "3", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "abcde"], dir);
    const err = await runCliFail(["role", "replace", "--old", "abcd", "--new", ""], dir);
    expect(err).toMatch(/length must be|chars/i);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|abcde");
  });

  it("T-REP-10: successful replace updates updatedAt but not createdAt", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "alpha beta alpha"], dir);
    const rolePath = join(dir, ".apm", "memory", "role.md");
    const staleUpdatedAt = "2020-01-01 00:00:00";
    const raw = readFileSync(rolePath, "utf8");
    writeFileSync(rolePath, raw.replace(/updatedAt: "[^"]+"/, `updatedAt: "${staleUpdatedAt}"`), "utf8");
    const before = parseFrontMatter(readFileSync(rolePath, "utf8"));
    await runCli(["role", "replace", "--old", "alpha", "--new", "X"], dir);
    const after = parseFrontMatter(readFileSync(rolePath, "utf8"));
    expect(after.meta).toMatchObject({ createdAt: (before.meta as { createdAt: string }).createdAt });
    expect((after.meta as { updatedAt: string }).updatedAt).not.toBe(staleUpdatedAt);
  });

  it("T-REP-ESC-01: role replace unescapes \\n in --new", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "100"], dir);
    await runCli(["role", "write", "--text", "foo bar"], dir);
    await runCli(["role", "replace", "--old", "foo", "--new", "a\\nb"], dir);
    const { out } = await runCli(["role", "show"], dir);
    expect(out).toContain("1|a");
    expect(out).toContain("2|b");
  });

  it("T-REP-11: replace behaves consistently across all four sections", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const cases = [
      { cmd: ["role"] as const, section: "role", path: join(dir, ".apm", "memory", "role.md") },
      { cmd: ["persist"] as const, section: "persist", path: join(dir, ".apm", "memory", "persist.md") },
      { cmd: ["dynamic"] as const, section: "dynamicDetail", path: join(dir, ".apm", "memory", "dynamic.md") },
      { cmd: ["kb", "dynamic"] as const, section: "kbDynamicDetail", path: join(dir, ".apm", "kb", "dynamic", "detail.md") }
    ] as const;
    for (const { cmd, section, path } of cases) {
      await runCli(["config", "set", "--section", section, "--min", "1", "--max", "100"], dir);
      await runCli([...cmd, "write", "--text", "alpha beta alpha"], dir);
      await runCli([...cmd, "replace", "--old", "alpha", "--new", "X"], dir);
      const { out } = await runCli([...cmd, "show"], dir);
      expect(out).toContain("1|X beta alpha");
      expect(parseFrontMatter(readFileSync(path, "utf8")).content).toBe("X beta alpha");
    }
  });
});
