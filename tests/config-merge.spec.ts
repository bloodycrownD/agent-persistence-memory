import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newTempDir, runCli } from "./helpers/cli-harness";

describe("config.json / status.json merge", () => {
  it("T-CONF-02: migrates legacy status.json on first command (config-wins)", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const configBefore = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
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
    expect(cfg.initializedAt).toBe(configBefore.initializedAt);
    expect(cfg.updatedAt).toBe(configBefore.updatedAt);
    expect(cfg.lastReadAt).toBeNull();
  });

  it("T-CONF-02b: status.json fills config fields when config lacks them", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    writeFileSync(
      join(dir, ".apm", "config.json"),
      JSON.stringify({ limits: { role: { min: 1, max: 10 }, persist: { min: 1, max: 10 }, dynamicDetail: { min: 1, max: 10 }, kbDynamicDetail: { min: 1, max: 10 } } }, null, 2),
      "utf8"
    );
    writeFileSync(
      join(dir, ".apm", "status.json"),
      JSON.stringify(
        { initializedAt: "2019-06-01 08:00:00", updatedAt: "2019-06-02 09:00:00", lastReadAt: "2019-06-03 10:00:00" },
        null,
        2
      ),
      "utf8"
    );
    await runCli(["role", "show"], dir);
    const cfg = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(cfg.initializedAt).toBe("2019-06-01 08:00:00");
    expect(cfg.updatedAt).toBe("2019-06-02 09:00:00");
    expect(cfg.lastReadAt).toBe("2019-06-03 10:00:00");
    expect(cfg.limits.role).toEqual({ max: 10 });
    expect(cfg.limits.persist).toEqual({ max: 10 });
    expect(cfg.limits.dynamicDetail).toEqual({ max: 10 });
    expect(cfg.limits.kbDynamicDetail).toEqual({ max: 10 });
    for (const key of ["role", "persist", "dynamicDetail", "kbDynamicDetail"] as const) {
      expect(cfg.limits[key]).not.toHaveProperty("min");
    }
  });

  it("T-CONF-03: config set preserves status fields", async () => {
    const dir = newTempDir();
    await runCli(["init"], dir);
    const before = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    await runCli(["config", "set", "--section", "role", "--max", "50"], dir);
    const after = JSON.parse(readFileSync(join(dir, ".apm", "config.json"), "utf8"));
    expect(after.limits.role).toEqual({ max: 50 });
    expect(after.initializedAt).toBe(before.initializedAt);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(after.lastReadAt).toBe(before.lastReadAt);
  });
});
