import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newTempDir, runCli } from "./helpers/cli-harness";

describe("config.json / status.json merge", () => {
  it("T-CONF-02: migrates legacy status.json on first command", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    writeFileSync(
      join(dir, ".apm", "status.json"),
      JSON.stringify(
        { initializedAt: "2020-01-01 00:00:00", updatedAt: "2020-01-02 00:00:00", lastReadAt: null },
        null,
        2
      ),
      "utf8"
    );
    await runCli(["role", "show"], dir);
    expect(existsSync(join(dir, ".apm", "status.json"))).toBe(false);
    const cfg = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(cfg.initializedAt).toBe("2020-01-01 00:00:00");
    expect(cfg.updatedAt).toBe("2020-01-02 00:00:00");
    expect(cfg.lastReadAt).toBeNull();
  });

  it("T-CONF-03: config set preserves status fields", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const before = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    await runCli(["config", "set", "--section", "role", "--min", "1", "--max", "50"], dir);
    const after = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(after.limits.role).toEqual({ min: 1, max: 50 });
    expect(after.initializedAt).toBe(before.initializedAt);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.lastReadAt).toBe(before.lastReadAt);
  });
});
