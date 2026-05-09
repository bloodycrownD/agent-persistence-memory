#!/usr/bin/env node

import { buildProgram } from "./cli/register";

export { buildProgram };
export { nowLocal } from "./core/time";
export { parseFrontMatter } from "./storage/markdown";
export { assertSafeName } from "./core/name-sanitize";

async function main(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

if (require.main === module) {
  main(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
