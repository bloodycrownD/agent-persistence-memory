import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "../src/storage/markdown";
import {
  newTempDir,
  runCli,
  runCliFail,
  runCliWithStdin,
  runCliWithStdinFail
} from "./helpers/cli-harness";

function readMemoryBody(dir: string, file: "role.md" | "persist.md" | "dynamic.md"): string {
  return parseFrontMatter(readFileSync(join(dir, ".apm", "memory", file), "utf8")).content;
}

function readKbDynamicBody(dir: string): string {
  return parseFrontMatter(readFileSync(join(dir, ".apm", "kb", "dynamic", "detail.md"), "utf8")).content;
}

describe("write limits / stdin / validate", () => {
  it("T-WL-01: new init config has max-only defaults", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const cfg = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(cfg.limits.role).toEqual({ max: 100 });
    expect(cfg.limits.persist).toEqual({ max: 800 });
    expect(cfg.limits.dynamicDetail).toEqual({ max: 1500 });
    expect(cfg.limits.kbDynamicDetail).toEqual({ max: 1500 });
    for (const key of ["role", "persist", "dynamicDetail", "kbDynamicDetail"] as const) {
      expect(cfg.limits[key]).not.toHaveProperty("min");
    }
  });

  it("T-WL-02: short persist write succeeds without min rejection", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const { out } = await runCli(["persist", "write", "--text", "x"], dir);
    expect(out).toBe("OK");
    expect(readMemoryBody(dir, "persist.md")).toBe("x");
  });

  it("T-WL-02b: empty string write succeeds within max", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const { out } = await runCli(["role", "write", "--text", ""], dir);
    expect(out).toBe("OK");
    expect(readMemoryBody(dir, "role.md")).toBe("");
  });

  it("T-WL-03: write over max fails with got/max/fewer and leaves disk unchanged", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "5"], dir);
    await runCli(["role", "write", "--text", "abcde"], dir);
    const before = readMemoryBody(dir, "role.md");
    const err = await runCliFail(["role", "write", "--text", "abcdef"], dir);
    expect(err).toMatch(/got 6/);
    expect(err).toMatch(/max 5/);
    expect(err).toMatch(/fewer/i);
    expect(readMemoryBody(dir, "role.md")).toBe(before);
  });

  it("T-WL-06: replace over max fails with got and leaves file unchanged", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "5"], dir);
    await runCli(["role", "write", "--text", "abcde"], dir);
    const before = readMemoryBody(dir, "role.md");
    const err = await runCliFail(["role", "replace", "--old", "a", "--new", "ZZZZZ"], dir);
    expect(err).toMatch(/got/i);
    expect(readMemoryBody(dir, "role.md")).toBe(before);
  });

  it("T-WL-07: dynamic write --stdin matches equivalent --text", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], dir);
    const body = "stdin-body-xyz";
    const textDir = newTempDir();
    await runCli(["init"], textDir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "200"], textDir);
    await runCliWithStdin(["dynamic", "write", "--stdin"], dir, body);
    await runCli(["dynamic", "write", "--text", body], textDir);
    expect(readMemoryBody(dir, "dynamic.md")).toBe(body);
    expect(readMemoryBody(textDir, "dynamic.md")).toBe(body);
  });

  it("T-WL-07b: implicit pipe write without --stdin matches --text", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const body = "implicit-pipe-body";
    await runCliWithStdin(["dynamic", "write"], dir, body);
    expect(readMemoryBody(dir, "dynamic.md")).toBe(body);
  });

  it("T-WL-07c: implicit pipe validate without --stdin matches --text validate", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const body = "validate-pipe";
    const explicit = await runCli(["role", "validate", "--text", body], dir);
    const implicit = await runCliWithStdin(["role", "validate"], dir, body);
    expect(implicit.out).toBe(explicit.out);
    expect(implicit.out).toBe(`OK: ${body.length}/100`);
  });

  it("T-WL-08: validate --stdin over max fails without writing", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "5"], dir);
    await runCli(["role", "write", "--text", "hello"], dir);
    const before = readFileSync(join(dir, ".apm", "memory", "role.md"), "utf8");
    const err = await runCliWithStdinFail(["role", "validate", "--stdin"], dir, "x".repeat(6));
    expect(err).toMatch(/got/i);
    expect(readFileSync(join(dir, ".apm", "memory", "role.md"), "utf8")).toBe(before);
  });

  it("T-WL-09: --text and --stdin together are rejected", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const err = await runCliFail(["role", "write", "--text", "hi", "--stdin"], dir);
    expect(err).toMatch(/Cannot use both --text and --stdin/i);
  });

  it("T-WL-10: validate success prints OK: n/max", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "50"], dir);
    const { out } = await runCli(["role", "validate", "--text", "abc"], dir);
    expect(out).toBe("OK: 3/50");
  });

  it("T-WL-11: validate then write with same body succeeds", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const text = "same-body-ok";
    await runCli(["persist", "validate", "--text", text], dir);
    const { out } = await runCli(["persist", "write", "--text", text], dir);
    expect(out).toBe("OK");
    expect(readMemoryBody(dir, "persist.md")).toBe(text);
  });

  it("T-WL-12: validate/write behave consistently across four sections", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const text = "four-section-ok";
    const cases = [
      { cmd: ["role"] as const, section: "role" as const, read: () => readMemoryBody(dir, "role.md") },
      { cmd: ["persist"] as const, section: "persist" as const, read: () => readMemoryBody(dir, "persist.md") },
      { cmd: ["dynamic"] as const, section: "dynamicDetail" as const, read: () => readMemoryBody(dir, "dynamic.md") },
      {
        cmd: ["kb", "dynamic"] as const,
        section: "kbDynamicDetail" as const,
        read: () => readKbDynamicBody(dir)
      }
    ] as const;
    for (const { cmd, section, read } of cases) {
      await runCli(["config", "set", "--section", section, "--max", "100"], dir);
      const validate = await runCli([...cmd, "validate", "--text", text], dir);
      expect(validate.out).toBe(`OK: ${text.length}/100`);
      const write = await runCli([...cmd, "write", "--text", text], dir);
      expect(write.out).toBe("OK");
      expect(read()).toBe(text);
    }
  });

  it("T-WL-13: kb write via stdin has no max limit", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const body = "k".repeat(2500);
    await runCliWithStdin(["kb", "write", "--path", "long.md", "--stdin"], dir, body);
    const written = readFileSync(join(dir, ".apm", "kb", "docs", "long.md"), "utf8");
    expect(written).toBe(body);
    expect(written.length).toBe(2500);
  });

  it("T-WL-14: legacy config with min still allows short write", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const cfgPath = join(dir, ".apm", "config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.limits.role = { min: 50, max: 100 };
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
    const shown = await runCli(["config", "show"], dir);
    expect(shown.out).toMatch(/"role"/);
    expect(shown.out).toMatch(/"max": 100/);
    const { out } = await runCli(["role", "write", "--text", "x"], dir);
    expect(out).toBe("OK");
    expect(readMemoryBody(dir, "role.md")).toBe("x");
  });

  it("T-WL-15: config set persists max only", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "dynamicDetail", "--max", "80"], dir);
    const cfg = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(cfg.limits.dynamicDetail).toEqual({ max: 80 });
    expect(cfg.limits.dynamicDetail).not.toHaveProperty("min");
    expect(existsSync(join(dir, ".apm", "config.json"))).toBe(true);
  });
});
