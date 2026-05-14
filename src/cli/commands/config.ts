import type { Command } from "commander";
import { readConfig, writeConfig } from "../../services/config-service";
import { ConfigSchema } from "../../schemas/config";
import type { Section } from "../../schemas/config";

export function registerConfig(program: Command): void {
  const config = program.command("config");

  config.command("show").action(() => {
    const cfg = readConfig(process.cwd());
    console.log(JSON.stringify(cfg, null, 2));
  });

  config
    .command("set")
    .requiredOption("--section <section>", "role|persist|dynamicDetail|kbDynamicDetail")
    .requiredOption("--min <min>")
    .requiredOption("--max <max>")
    .action(async (opts: { section: Section; min: string; max: string }) => {
      const cwd = process.cwd();
      const cfg = readConfig(cwd);
      const sec = opts.section;
      if (!["role", "persist", "dynamicDetail", "kbDynamicDetail"].includes(sec)) throw new Error(`Invalid section: ${sec}`);
      const min = Number(opts.min);
      const max = Number(opts.max);
      if (min > max) throw new Error("min must be <= max.");
      const next = { ...cfg, limits: { ...cfg.limits, [sec]: { min, max } } };
      ConfigSchema.parse(next);
      await writeConfig(cwd, next);
      console.log("OK");
    });
}

