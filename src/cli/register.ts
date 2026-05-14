import { Command } from "commander";
import { registerRead } from "./commands/read";
import { registerRole } from "./commands/role";
import { registerPersist } from "./commands/persist";
import { registerDynamic } from "./commands/dynamic";
import { registerConfig } from "./commands/config";

export function buildProgram(): Command {
  const program = new Command();
  program.name("apm").description("APM local memory CLI").version("1.0.0");
  // Shown after `apm --help` only (not stderr from a failing command). Kept short so it reads as notes, not an error.
  program.addHelpText(
    "afterAll",
    [
      "",
      "Notes:",
      "  • Section YAML timestamps use the local timezone (YYYY-MM-DD HH:mm:ss).",
      "  • Windows: if Chinese/English output looks wrong, try UTF-8 first:  chcp 65001",
      "  • When developing this repo: the apm bin runs dist/ — run `npm run build` after editing src/."
    ].join("\n")
  );

  registerRead(program);
  registerRole(program);
  registerPersist(program);
  registerDynamic(program);
  registerConfig(program);

  return program;
}
