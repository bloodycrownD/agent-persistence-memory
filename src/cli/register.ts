import { Command } from "commander";
import { registerRead } from "./commands/read";
import { registerRole } from "./commands/role";
import { registerPersist } from "./commands/persist";
import { registerTmp } from "./commands/tmp";
import { registerChunks } from "./commands/chunks";
import { registerConfig } from "./commands/config";

export function buildProgram(): Command {
  const program = new Command();
  program.name("apm").description("APM local memory CLI").version("1.0.0");
  program.addHelpText(
    "afterAll",
    "\nTimestamps use system local timezone (format: YYYY-MM-DD HH:mm:ss).\nOn Windows, run `chcp 65001` in the console before `apm` if mixed Chinese/English output appears corrupted."
  );

  registerRead(program);
  registerRole(program);
  registerPersist(program);
  registerTmp(program);
  registerChunks(program);
  registerConfig(program);

  return program;
}

