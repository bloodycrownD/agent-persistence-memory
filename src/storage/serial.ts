import { rmSync } from "node:fs";

const writeQueue = new Map<string, Promise<void>>();

export async function serialWrite(path: string, writeFn: () => Promise<void>): Promise<void> {
  const prev = writeQueue.get(path) ?? Promise.resolve();
  const next = prev.then(writeFn, writeFn);
  writeQueue.set(path, next.finally(() => writeQueue.delete(path)));
  await next;
}

export async function serialRm(path: string): Promise<void> {
  await serialWrite(path, async () => {
    rmSync(path);
  });
}

