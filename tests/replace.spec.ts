import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/index";
import { newTempDir, resolveCommand, runCli, runCliWithExit } from "./helpers/cli-harness";

describe("apm section replace removed", () => {
  it("T-REP-NEG-01: section help lists show/write/validate without replace", () => {
    const program = buildProgram();
    for (const path of [["role"], ["persist"], ["dynamic"]] as const) {
      const cmd = resolveCommand(program, ...path);
      expect(cmd).toBeDefined();
      const names = cmd!.commands.map((c) => c.name());
      expect(names).toEqual(expect.arrayContaining(["show", "write", "validate"]));
      expect(names).not.toContain("replace");
      expect(names).not.toContain("edit");
      const help = cmd!.helpInformation();
      expect(help).toMatch(/show/);
      expect(help).toMatch(/write/);
      expect(help).not.toMatch(/\breplace\b/);
      expect(help).not.toMatch(/\bedit\b/);
    }
  });

  it("T-REP-NEG-02: role replace exits non-zero", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const { code, stderr } = await runCliWithExit(
      ["role", "replace", "--old", "a", "--new", "b"],
      dir
    );
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/unknown command/i);
  });

  it("T-REP-NEG-03: edit subcommand remains unavailable", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    await runCli(["config", "set", "--section", "role", "--max", "100"], dir);
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
});
