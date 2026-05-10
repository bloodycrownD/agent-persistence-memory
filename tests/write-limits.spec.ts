import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProgram } from "../src/index";
import { nowLocal } from "../src/core/time";
import {
  CHUNK_TEXT_LENGTH_ERROR,
  RENAME_CHUNK_REQUIRES_DISTINCT_NAMES,
  TODO_COMBO_LENGTH_ERROR,
  TODO_DESCRIPTION_REQUIRED_ERROR
} from "../src/core/limits-messages";
import { ensureApm } from "../src/storage/paths";
import { readChunkFile, renameChunk, writeChunk, type ChunkDoc } from "../src/services/chunks-service";
import { writeTodo, type TodoDoc } from "../src/services/todos-service";

const tempDirs: string[] = [];

async function runCli(args: string[], cwd: string): Promise<{ out: string; err: string }> {
  const prev = process.cwd();
  const out: string[] = [];
  const err: string[] = [];
  const oldLog = console.log;
  const oldErr = console.error;
  console.log = (...a: unknown[]) => out.push(a.join(" "));
  console.error = (...a: unknown[]) => err.push(a.join(" "));
  process.chdir(cwd);
  try {
    const program = buildProgram();
    await program.parseAsync(["node", "apm", ...args], { from: "node" });
    return { out: out.join("\n"), err: err.join("\n") };
  } finally {
    process.chdir(prev);
    console.log = oldLog;
    console.error = oldErr;
  }
}

async function runCliFail(args: string[], cwd: string): Promise<string> {
  try {
    await runCli(args, cwd);
    throw new Error("Expected command to fail.");
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function newTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apm-write-limits-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function chunkFile(cwd: string, name: string): string {
  return join(cwd, ".apm", "chunks", `${name}.md`);
}

function baseChunk(name: string, content: string): ChunkDoc {
  const now = nowLocal();
  return {
    name,
    keywords: ["k"],
    content,
    createdAt: now,
    updatedAt: now
  };
}

function baseTodo(name: string, description: string): TodoDoc {
  const now = nowLocal();
  return {
    name,
    description,
    index: 1,
    priority: 5,
    completed: false,
    createdAt: now,
    updatedAt: now
  };
}

describe("write limits (service + CLI)", () => {
  it("T1: writeChunk rejects content over 200 countChars", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const bad = "x".repeat(201);
    await expect(writeChunk(dir, baseChunk("c", bad))).rejects.toThrow(CHUNK_TEXT_LENGTH_ERROR);
  });

  it("T2: writeChunk accepts 200 countChars", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const ok = "z".repeat(200);
    await writeChunk(dir, baseChunk("c200", ok));
    const doc = readChunkFile(chunkFile(dir, "c200"));
    expect(doc.content).toBe(ok);
  });

  it("T3: renameChunk rejects oversized next.content", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    await writeChunk(dir, baseChunk("a", "short"));
    const long = "y".repeat(201);
    await expect(renameChunk(dir, "a", baseChunk("b", long))).rejects.toThrow(CHUNK_TEXT_LENGTH_ERROR);
  });

  it("T3b: renameChunk rejects when fromName === next.name", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const doc = baseChunk("a", "ok");
    await writeChunk(dir, doc);
    await expect(renameChunk(dir, "a", doc)).rejects.toThrow(RENAME_CHUNK_REQUIRES_DISTINCT_NAMES);
  });

  it("T4: renameChunk writes new file and removes old", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const now = nowLocal();
    const created = { name: "a", keywords: ["k"], content: "body", createdAt: now, updatedAt: now };
    await writeChunk(dir, created);
    const updatedAt = nowLocal();
    const next: ChunkDoc = { ...created, name: "b", content: "renamed body", updatedAt };
    await renameChunk(dir, "a", next);
    expect(existsSync(chunkFile(dir, "a"))).toBe(false);
    expect(existsSync(chunkFile(dir, "b"))).toBe(true);
    const read = readChunkFile(chunkFile(dir, "b"));
    expect(read.content).toBe("renamed body");
    expect(read.name).toBe("b");
  });

  it("T5: writeTodo rejects name+description over 100 countChars", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const name = "n";
    const description = "d".repeat(100);
    await expect(writeTodo(dir, baseTodo(name, description))).rejects.toThrow(TODO_COMBO_LENGTH_ERROR);
  });

  it("T6: writeTodo rejects whitespace-only description", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    await expect(writeTodo(dir, baseTodo("t", "   "))).rejects.toThrow(TODO_DESCRIPTION_REQUIRED_ERROR);
  });

  it("T7: CLI chunks add surfaces chunk length error constant", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const bad201 = "y".repeat(201);
    const msg = await runCliFail(["chunks", "add", "--name", "c", "--keywords", "k", "--text", bad201], dir);
    expect(msg).toContain(CHUNK_TEXT_LENGTH_ERROR);
  });

  it("T8: CLI tmp todos add surfaces todo combo length error", async () => {
    const dir = newTempDir();
    ensureApm(dir);
    const name = "a";
    const description = "b".repeat(100);
    const msg = await runCliFail(
      ["tmp", "todos", "add", "--name", name, "--description", description, "--index", "1"],
      dir
    );
    expect(msg).toContain(TODO_COMBO_LENGTH_ERROR);
  });
});
