#!/usr/bin/env node

import { Command } from "commander";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

type MemoryRecord = {
  id: string;
  key: string;
  value: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

const DB_PATH = join(homedir(), ".agent-persistence-memory", "memory.json");

const MemoryDbSchema = z.object({
  memories: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      value: z.string(),
      tags: z.array(z.string()),
      createdAt: z.string(),
      updatedAt: z.string()
    })
  )
});

function ensureDbFile() {
  mkdirSync(dirname(DB_PATH), { recursive: true });

  try {
    readFileSync(DB_PATH, "utf8");
  } catch {
    writeFileSync(DB_PATH, JSON.stringify({ memories: [] }, null, 2), "utf8");
  }
}

function readDb(): { memories: MemoryRecord[] } {
  ensureDbFile();
  const raw = readFileSync(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return MemoryDbSchema.parse(parsed);
}

function writeDb(db: { memories: MemoryRecord[] }) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function upsertMemory(key: string, value: string, tags: string[]) {
  const db = readDb();
  const existing = db.memories.find((m) => m.key === key);
  const now = new Date().toISOString();

  if (existing) {
    existing.value = value;
    existing.tags = tags;
    existing.updatedAt = now;
    writeDb(db);
    return { mode: "updated" as const, memory: existing };
  }

  const record: MemoryRecord = {
    id: randomUUID(),
    key,
    value,
    tags,
    createdAt: now,
    updatedAt: now
  };

  db.memories.push(record);
  writeDb(db);
  return { mode: "created" as const, memory: record };
}

function listMemories(filterTag?: string) {
  const db = readDb();
  if (!filterTag) {
    return db.memories;
  }
  return db.memories.filter((m) => m.tags.includes(filterTag));
}

function getMemory(key: string) {
  const db = readDb();
  return db.memories.find((m) => m.key === key);
}

function deleteMemory(key: string) {
  const db = readDb();
  const next = db.memories.filter((m) => m.key !== key);
  const removed = db.memories.length - next.length;

  if (removed > 0) {
    writeDb({ memories: next });
  }

  return removed > 0;
}

const program = new Command();

program
  .name("agent-memory")
  .description("External persistence memory for agent workflows")
  .version("0.1.0");

program
  .command("remember")
  .description("Create or update a memory by key")
  .requiredOption("-k, --key <key>", "memory key")
  .requiredOption("-v, --value <value>", "memory value")
  .option("-t, --tags <tags>", "comma-separated tags")
  .action((opts: { key: string; value: string; tags?: string }) => {
    const tags = opts.tags
      ? opts.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const result = upsertMemory(opts.key, opts.value, tags);
    console.log(
      `${result.mode === "created" ? "Created" : "Updated"} memory: ${result.memory.key}`
    );
  });

program
  .command("recall")
  .description("Get a memory by key")
  .requiredOption("-k, --key <key>", "memory key")
  .action((opts: { key: string }) => {
    const item = getMemory(opts.key);
    if (!item) {
      console.error(`Memory not found: ${opts.key}`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(item, null, 2));
  });

program
  .command("list")
  .description("List all memories")
  .option("-t, --tag <tag>", "filter by a specific tag")
  .action((opts: { tag?: string }) => {
    const items = listMemories(opts.tag);
    console.log(JSON.stringify(items, null, 2));
  });

program
  .command("forget")
  .description("Delete a memory by key")
  .requiredOption("-k, --key <key>", "memory key")
  .action((opts: { key: string }) => {
    const ok = deleteMemory(opts.key);
    if (!ok) {
      console.error(`Memory not found: ${opts.key}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Deleted memory: ${opts.key}`);
  });

program.parse();
