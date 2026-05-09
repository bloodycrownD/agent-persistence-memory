import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { assertSafeName } from "../core/name-sanitize";
import { formatZodError } from "../core/schema-errors";
import { parseFrontMatter, renderFrontMatter } from "../storage/markdown";
import { apmPaths } from "../storage/paths";
import { CHUNK_FRONT_MATTER_HINT, ChunkMetaSchema } from "../schemas/chunk";
import { withGlobalLock } from "../storage/fs-lock";
import { serialRm, serialWrite } from "../storage/serial";
import { atomicWrite } from "../storage/fs-atomic";

export type ChunkDoc = z.infer<typeof ChunkMetaSchema> & { content: string };

function chunkPath(cwd: string, name: string): string {
  assertSafeName(name);
  return join(apmPaths(cwd).chunksDir, `${name}.md`);
}

export function readChunkFile(path: string): ChunkDoc {
  const parsed = parseFrontMatter(readFileSync(path, "utf8"));
  try {
    const meta = ChunkMetaSchema.parse(parsed.meta);
    return { ...meta, content: parsed.content };
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(
        formatZodError({
          filePath: path,
          label: "chunk front matter",
          error: e,
          expectedShapeHint: CHUNK_FRONT_MATTER_HINT
        })
      );
    }
    throw e;
  }
}

export function listChunks(cwd: string): ChunkDoc[] {
  const dir = apmPaths(cwd).chunksDir;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readChunkFile(join(dir, f)));
}

export async function writeChunk(cwd: string, chunk: ChunkDoc): Promise<void> {
  const paths = apmPaths(cwd);
  const file = chunkPath(cwd, chunk.name);
  const payload = renderFrontMatter(
    {
      name: chunk.name,
      keywords: chunk.keywords,
      createdAt: chunk.createdAt,
      updatedAt: chunk.updatedAt
    },
    chunk.content
  );
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(file, async () => {
      await atomicWrite(file, payload);
    });
  });
}

export async function rmChunk(cwd: string, name: string): Promise<void> {
  const path = chunkPath(cwd, name);
  if (!existsSync(path)) throw new Error(`Chunk not found: ${name}`);
  const paths = apmPaths(cwd);
  await withGlobalLock(paths.lock, async () => {
    await serialRm(path);
  });
}

export async function renameChunk(cwd: string, fromName: string, toName: string, payload: string): Promise<void> {
  const paths = apmPaths(cwd);
  const oldPath = chunkPath(cwd, fromName);
  const newPath = chunkPath(cwd, toName);
  await withGlobalLock(paths.lock, async () => {
    if (existsSync(newPath)) throw new Error(`Chunk name exists: ${toName}`);
    await serialWrite(newPath, async () => {
      await atomicWrite(newPath, payload);
    });
    await serialRm(oldPath);
  });
}

