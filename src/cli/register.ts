import { Command } from "commander";
import { registerRead } from "./commands/read";
import { registerRole } from "./commands/role";
import { registerPersist } from "./commands/persist";
import { registerDynamic } from "./commands/dynamic";
import { registerConfig } from "./commands/config";

export function buildProgram(): Command {
  const program = new Command();
  program.name("apm").description("APM local memory CLI").version("1.0.0");
  program.addHelpText(
    "afterAll",
    "\nTimestamps use system local timezone (format: YYYY-MM-DD HH:mm:ss).\nOn Windows, run `chcp 65001` in the console before `apm` if mixed Chinese/English output appears corrupted.\nThe `apm` bin runs dist/index.js — run `npm run build` after source changes (or `npm install` in this repo to run the prepare script)."
  );

  registerRead(program);
  registerRole(program);
  registerPersist(program);
  registerDynamic(program);
  registerConfig(program);

  return program;
}
