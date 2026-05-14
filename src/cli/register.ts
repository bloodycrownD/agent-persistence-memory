import { Command } from "commander";
import { registerRead } from "./commands/read";
import { registerInit } from "./commands/init";
import { registerRole } from "./commands/role";
import { registerPersist } from "./commands/persist";
import { registerDynamic } from "./commands/dynamic";
import { registerKb } from "./commands/kb";
import { registerConfig } from "./commands/config";

export function buildProgram(): Command {
  const program = new Command();
  program.name("apm").description("APM local memory CLI").version("1.0.0");

  registerRead(program);
  registerInit(program);
  registerRole(program);
  registerPersist(program);
  registerDynamic(program);
  registerKb(program);
  registerConfig(program);

  return program;
}
