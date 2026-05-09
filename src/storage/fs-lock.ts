import { closeSync, existsSync, openSync, unlinkSync } from "node:fs";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withGlobalLock<T>(lockPath: string, run: () => T | Promise<T>): Promise<T> {
  const started = Date.now();
  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      break;
    } catch {
      if (Date.now() - started > 3000) {
        throw new Error("Write conflict detected. Please retry.");
      }
      await sleep(40);
    }
  }
  try {
    return await run();
  } finally {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  }
}

