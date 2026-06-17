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
    .requiredOption("--max <max>", "记忆段长度上限")
    .action(async (opts: { section: Section; max: string }) => {
      const cwd = process.cwd();
      const cfg = readConfig(cwd);
      const sec = opts.section;
      if (!["role", "persist", "dynamicDetail", "kbDynamicDetail"].includes(sec)) throw new Error(`Invalid section: ${sec}`);
      const max = Number(opts.max);
      const next = { ...cfg, limits: { ...cfg.limits, [sec]: { max } } };
      ConfigSchema.parse(next);
      await writeConfig(cwd, next);
      console.log("OK");
    });
}

