#!/usr/bin/env node

import { Command } from "commander";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
  unlinkSync
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";

type Limits = { min: number; max: number };
type Section = "role" | "persist" | "tmpDetail";
type MatchMode = "contains" | "exact" | "prefix";
type SearchField = "keywords" | "content" | "name";
type SortField = "name" | "createdAt" | "updatedAt";

const DEFAULT_CONFIG = {
  limits: {
    role: { min: 50, max: 100 },
    persist: { min: 300, max: 500 },
    tmpDetail: { min: 500, max: 1000 }
  }
} as const;

const ConfigSchema = z.object({
  limits: z.object({
    role: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    persist: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) }),
    tmpDetail: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) })
  })
});

const StatusSchema = z.object({
  initializedAt: z.string(),
  updatedAt: z.string(),
  lastReadAt: z.string().nullable()
});

const TodoMetaSchema = z.object({
  name: z.string().min(1),
  index: z.number().int().min(1),
  priority: z.number().int().min(1),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const ChunkMetaSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string()
});

const writeQueue = new Map<string, Promise<void>>();

function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}

/**
 * Prevent path traversal and unstable file names in user-provided keys.
 */
export function assertSafeName(name: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(name) || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Invalid name: ${name}. Allowed characters: letters, numbers, -, _.`);
  }
}

function countChars(text: string): number {
  return Array.from(text).length;
}

function validateRange(lines: string[], start: number, end: number): void {
  if (start < 1 || end < 1 || start > end) {
    throw new Error("Invalid range: start and end must be >= 1 and start <= end.");
  }
  if (start > lines.length || end > lines.length) {
    throw new Error("Edit range out of bounds.");
  }
}

function toLineNumbered(text: string): string {
  const lines = text.length === 0 ? [""] : text.split("\n");
  return lines.map((line, idx) => `${idx + 1}|${line}`).join("\n");
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const render = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i], " ")).join(" | ");
  return [render(headers), widths.map((w) => "-".repeat(w)).join("-|-"), ...rows.map(render)].join("\n");
}

function parseFrontMatter(raw: string): { meta: unknown; content: string } {
  if (!raw.startsWith("---\n")) {
    throw new Error("Invalid markdown front matter: missing opening --- line.");
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("Invalid markdown front matter: missing closing --- line.");
  }
  const metaRaw = raw.slice(4, end).trim();
  const content = raw.slice(end + 5);
  const jsonLike = metaRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(":");
      if (i < 0) {
        throw new Error(`Invalid front matter line: ${line}`);
      }
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim();
      return [key, value] as const;
    });
  const metaObj: Record<string, unknown> = {};
  for (const [k, v] of jsonLike) {
    if (v === "true") metaObj[k] = true;
    else if (v === "false") metaObj[k] = false;
    else if (/^\d+$/.test(v)) metaObj[k] = Number(v);
    else if (v.startsWith("[") && v.endsWith("]")) {
      metaObj[k] = v
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else metaObj[k] = v;
  }
  return { meta: metaObj, content };
}

function renderFrontMatter(meta: Record<string, unknown>, content: string): string {
  const lines = Object.entries(meta).map(([k, v]) =>
    `${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}`
  );
  return `---\n${lines.join("\n")}\n---\n${content}`;
}

function apmPaths(cwd: string) {
  const root = join(cwd, ".apm");
  return {
    root,
    config: join(root, "config.json"),
    status: join(root, "status.json"),
    persist: join(root, "persistence", "memory.md"),
    detail: join(root, "tmp", "detail.md"),
    todosDir: join(root, "tmp", "todos"),
    chunksDir: join(root, "chunks"),
    role: join(root, "role.md"),
    lock: join(root, ".write.lock")
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withGlobalLock<T>(lockPath: string, run: () => T | Promise<T>): Promise<T> {
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

async function atomicWrite(path: string, content: string): Promise<void> {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, "utf8");
  renameSync(tempPath, path);
}

async function serialWrite(path: string, writeFn: () => Promise<void>): Promise<void> {
  const prev = writeQueue.get(path) ?? Promise.resolve();
  const next = prev.then(writeFn, writeFn);
  writeQueue.set(path, next.finally(() => writeQueue.delete(path)));
  await next;
}

function ensureApm(cwd: string): void {
  const p = apmPaths(cwd);
  mkdirSync(join(p.root, "persistence"), { recursive: true });
  mkdirSync(join(p.root, "tmp"), { recursive: true });
  mkdirSync(p.todosDir, { recursive: true });
  mkdirSync(p.chunksDir, { recursive: true });
  const now = nowLocal();
  if (!existsSync(p.config)) {
    writeFileSync(p.config, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
  if (!existsSync(p.status)) {
    writeFileSync(
      p.status,
      JSON.stringify({ initializedAt: now, updatedAt: now, lastReadAt: null }, null, 2),
      "utf8"
    );
  }
  if (!existsSync(p.role)) writeFileSync(p.role, "", "utf8");
  if (!existsSync(p.persist)) writeFileSync(p.persist, "", "utf8");
  if (!existsSync(p.detail)) writeFileSync(p.detail, "", "utf8");
}

function readJson<T>(path: string, schema: z.ZodType<T>): T {
  const raw = readFileSync(path, "utf8");
  return schema.parse(JSON.parse(raw));
}

function readConfig(cwd: string) {
  ensureApm(cwd);
  return readJson(apmPaths(cwd).config, ConfigSchema);
}

function writeConfig(cwd: string, config: z.infer<typeof ConfigSchema>): Promise<void> {
  const p = apmPaths(cwd);
  return withGlobalLock(p.lock, async () => {
    await serialWrite(p.config, async () => {
      await atomicWrite(p.config, JSON.stringify(config, null, 2));
    });
  });
}

function readStatus(cwd: string) {
  ensureApm(cwd);
  return readJson(apmPaths(cwd).status, StatusSchema);
}

function updateStatus(cwd: string, patch: Partial<z.infer<typeof StatusSchema>>): Promise<void> {
  const p = apmPaths(cwd);
  const next = { ...readStatus(cwd), ...patch, updatedAt: nowLocal() };
  return withGlobalLock(p.lock, async () => {
    await serialWrite(p.status, async () => {
      await atomicWrite(p.status, JSON.stringify(next, null, 2));
    });
  });
}

function sectionPath(cwd: string, section: Section): string {
  const p = apmPaths(cwd);
  if (section === "role") return p.role;
  if (section === "persist") return p.persist;
  return p.detail;
}

function sectionLabel(section: Section): string {
  if (section === "tmpDetail") return "tmp detail";
  return section;
}

function enforceLimits(cwd: string, section: Section, text: string): void {
  const cfg = readConfig(cwd);
  const limits: Limits =
    section === "role" ? cfg.limits.role : section === "persist" ? cfg.limits.persist : cfg.limits.tmpDetail;
  const len = countChars(text);
  if (len < limits.min || len > limits.max) {
    throw new Error(`${sectionLabel(section)} content length must be ${limits.min}~${limits.max} chars.`);
  }
}

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

async function writeSection(cwd: string, section: Section, text: string): Promise<void> {
  enforceLimits(cwd, section, text);
  const p = sectionPath(cwd, section);
  const paths = apmPaths(cwd);
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(p, async () => {
      await atomicWrite(p, text);
    });
  });
}

async function editSection(cwd: string, section: Section, start: number, end: number, text: string): Promise<void> {
  const p = sectionPath(cwd, section);
  const lines = readText(p).split("\n");
  validateRange(lines, start, end);
  lines.splice(start - 1, end - start + 1, ...text.split("\n"));
  await writeSection(cwd, section, lines.join("\n"));
}

type TodoDoc = z.infer<typeof TodoMetaSchema> & { description: string };
type ChunkDoc = z.infer<typeof ChunkMetaSchema> & { content: string };

function todoPath(cwd: string, name: string): string {
  assertSafeName(name);
  return join(apmPaths(cwd).todosDir, `${name}.md`);
}

function chunkPath(cwd: string, name: string): string {
  assertSafeName(name);
  return join(apmPaths(cwd).chunksDir, `${name}.md`);
}

function readTodoFile(path: string): TodoDoc {
  const parsed = parseFrontMatter(readText(path));
  const meta = TodoMetaSchema.parse(parsed.meta);
  return { ...meta, description: parsed.content };
}

function readChunkFile(path: string): ChunkDoc {
  const parsed = parseFrontMatter(readText(path));
  const meta = ChunkMetaSchema.parse(parsed.meta);
  return { ...meta, content: parsed.content };
}

function listTodos(cwd: string): TodoDoc[] {
  const dir = apmPaths(cwd).todosDir;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readTodoFile(join(dir, f)))
    .sort((a, b) => a.index - b.index);
}

function listChunks(cwd: string): ChunkDoc[] {
  const dir = apmPaths(cwd).chunksDir;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readChunkFile(join(dir, f)));
}

async function writeTodo(cwd: string, todo: TodoDoc): Promise<void> {
  const paths = apmPaths(cwd);
  const file = todoPath(cwd, todo.name);
  const payload = renderFrontMatter(
    {
      name: todo.name,
      index: todo.index,
      priority: todo.priority,
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt
    },
    todo.description
  );
  await withGlobalLock(paths.lock, async () => {
    await serialWrite(file, async () => {
      await atomicWrite(file, payload);
    });
  });
}

async function writeChunk(cwd: string, chunk: ChunkDoc): Promise<void> {
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

function currentTask(todos: TodoDoc[]): TodoDoc | null {
  const open = todos.filter((t) => !t.completed);
  if (open.length === 0) return null;
  return open.sort((a, b) => a.priority - b.priority || a.index - b.index)[0];
}

function buildProgram(): Command {
  const program = new Command();
  program.name("apm").description("APM local memory CLI").version("1.0.0");

  program
    .command("read")
    .option("--json", "output JSON")
    .action(async (opts: { json?: boolean }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const p = apmPaths(cwd);
      const role = readText(p.role);
      const persist = readText(p.persist);
      const detail = readText(p.detail);
      const todos = listTodos(cwd);
      const chunks = listChunks(cwd);
      const task = currentTask(todos);
      const payload = {
        lastTime: readStatus(cwd).lastReadAt,
        now: nowLocal(),
        role,
        persist,
        currentTask: task ? `${task.name}: ${task.description}` : "",
        todos: todos.map((t) => ({
          name: t.name,
          index: t.index,
          priority: t.priority,
          completed: t.completed,
          description: t.description
        })),
        detail,
        chunks: chunks.map((c) => ({ name: c.name, keywords: c.keywords, content: c.content }))
      };
      await updateStatus(cwd, { lastReadAt: payload.now });
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      const txt = [
        "# APM Memory Read",
        `Last Time: ${payload.lastTime ?? "N/A"}`,
        `Current Time: ${payload.now}`,
        "",
        "## Role",
        role || "(empty)",
        "",
        "## Persist",
        persist || "(empty)",
        "",
        "## Current Task",
        payload.currentTask || "(none)",
        "",
        "## Todos",
        todos.length === 0
          ? "(empty)"
          : todos
              .sort((a, b) => a.priority - b.priority || a.index - b.index)
              .map(
                (t) => `- [${t.completed ? "x" : " "}] #${t.index} p${t.priority} ${t.name}: ${t.description}`
              )
              .join("\n"),
        "",
        "## Detail",
        detail || "(empty)",
        "",
        "## Chunks",
        chunks.length === 0
          ? "(empty)"
          : chunks.map((c) => `- ${c.name} (${c.keywords.join(", ")})`).join("\n")
      ].join("\n");
      console.log(txt);
    });

  const tmp = program.command("tmp");
  const roleCmd = program.command("role");
  const persistCmd = program.command("persist");
  const detailCmd = tmp.command("detail");
  const registerSection = (cmd: Command, section: Section) => {
    cmd.command("show").action(() => {
      const cwd = process.cwd();
      ensureApm(cwd);
      console.log(toLineNumbered(readText(sectionPath(cwd, section))));
    });
    cmd.command("write").requiredOption("--text <text>").action(async (opts: { text: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      await writeSection(cwd, section, opts.text);
      console.log("OK");
    });
    cmd
      .command("edit")
      .requiredOption("--start <start>")
      .requiredOption("--end <end>")
      .requiredOption("--text <text>")
      .action(async (opts: { start: string; end: string; text: string }) => {
        const cwd = process.cwd();
        ensureApm(cwd);
        await editSection(cwd, section, Number(opts.start), Number(opts.end), opts.text);
        console.log("OK");
      });
  };
  registerSection(roleCmd, "role");
  registerSection(persistCmd, "persist");
  registerSection(detailCmd, "tmpDetail");

  tmp.command("show").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const detail = readText(apmPaths(cwd).detail);
    const todos = listTodos(cwd)
      .map((t) => `- [${t.completed ? "x" : " "}] #${t.index} p${t.priority} ${t.name}: ${t.description}`)
      .join("\n");
    console.log(toLineNumbered(`## Todos\n${todos || "(empty)"}\n\n## Detail\n${detail || "(empty)"}`));
  });

  const todos = tmp.command("todos");
  todos.command("show").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const content = listTodos(cwd)
      .map((t) => `#${t.index} [${t.completed ? "x" : " "}] p${t.priority} ${t.name}: ${t.description}`)
      .join("\n");
    console.log(toLineNumbered(content || "(empty)"));
  });
  todos.command("list").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const items = listTodos(cwd).sort((a, b) => a.priority - b.priority || a.index - b.index);
    console.log(
      table(
        ["index", "priority", "done", "name", "description"],
        items.map((t) => [String(t.index), String(t.priority), t.completed ? "yes" : "no", t.name, t.description])
      )
    );
  });
  todos
    .command("add")
    .requiredOption("--name <name>")
    .requiredOption("--description <description>")
    .requiredOption("--index <index>")
    .option("--priority <priority>", "priority (lower is higher)", "5")
    .action(async (opts: { name: string; description: string; index: string; priority: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      assertSafeName(opts.name);
      const all = listTodos(cwd);
      const index = Number(opts.index);
      if (all.some((t) => t.name === opts.name)) throw new Error(`Todo name exists: ${opts.name}`);
      if (all.some((t) => t.index === index)) throw new Error(`Todo index exists: ${index}`);
      if (!opts.description.trim()) throw new Error("Todo description is required.");
      if (countChars(`${opts.name}${opts.description}`) > 100) {
        throw new Error("Todo name + description must be <= 100 chars.");
      }
      const now = nowLocal();
      await writeTodo(cwd, {
        name: opts.name,
        description: opts.description,
        index,
        priority: Number(opts.priority),
        completed: false,
        createdAt: now,
        updatedAt: now
      });
      console.log("OK");
    });
  todos
    .command("rm")
    .requiredOption("--index <index>")
    .action((opts: { index: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const item = listTodos(cwd).find((t) => t.index === Number(opts.index));
      if (!item) throw new Error(`Todo index not found: ${opts.index}`);
      rmSync(todoPath(cwd, item.name));
      console.log("OK");
    });
  todos
    .command("edit")
    .requiredOption("--index <index>")
    .option("--name <name>")
    .option("--description <description>")
    .action(async (opts: { index: string; name?: string; description?: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const all = listTodos(cwd);
      const current = all.find((t) => t.index === Number(opts.index));
      if (!current) throw new Error(`Todo index not found: ${opts.index}`);
      const nextName = opts.name ?? current.name;
      assertSafeName(nextName);
      if (nextName !== current.name && all.some((t) => t.name === nextName)) {
        throw new Error(`Todo name exists: ${nextName}`);
      }
      const nextDescription = opts.description ?? current.description;
      if (!nextDescription.trim()) throw new Error("Todo description is required.");
      if (countChars(`${nextName}${nextDescription}`) > 100) {
        throw new Error("Todo name + description must be <= 100 chars.");
      }
      if (nextName !== current.name) rmSync(todoPath(cwd, current.name));
      await writeTodo(cwd, { ...current, name: nextName, description: nextDescription, updatedAt: nowLocal() });
      console.log("OK");
    });
  todos.command("clear").action(() => {
    const cwd = process.cwd();
    ensureApm(cwd);
    for (const file of readdirSync(apmPaths(cwd).todosDir)) {
      if (file.endsWith(".md")) rmSync(join(apmPaths(cwd).todosDir, file));
    }
    console.log("OK");
  });
  todos
    .command("complete")
    .requiredOption("--index <index>")
    .option("--done <done>", "true/false", "true")
    .action(async (opts: { index: string; done: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const all = listTodos(cwd);
      const current = all.find((t) => t.index === Number(opts.index));
      if (!current) throw new Error(`Todo index not found: ${opts.index}`);
      await writeTodo(cwd, { ...current, completed: opts.done === "true", updatedAt: nowLocal() });
      console.log("OK");
    });
  todos
    .command("priority")
    .requiredOption("--index <index>")
    .requiredOption("--priority <priority>")
    .action(async (opts: { index: string; priority: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const all = listTodos(cwd);
      const current = all.find((t) => t.index === Number(opts.index));
      if (!current) throw new Error(`Todo index not found: ${opts.index}`);
      await writeTodo(cwd, { ...current, priority: Number(opts.priority), updatedAt: nowLocal() });
      console.log("OK");
    });

  const chunks = program.command("chunks");
  chunks
    .command("add")
    .requiredOption("--name <name>")
    .requiredOption("--keywords <keywords>")
    .requiredOption("--text <text>")
    .action(async (opts: { name: string; keywords: string; text: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      assertSafeName(opts.name);
      if (listChunks(cwd).some((c) => c.name === opts.name)) throw new Error(`Chunk name exists: ${opts.name}`);
      const now = nowLocal();
      await writeChunk(cwd, {
        name: opts.name,
        keywords: opts.keywords.split(",").map((s) => s.trim()).filter(Boolean),
        content: opts.text,
        createdAt: now,
        updatedAt: now
      });
      console.log("OK");
    });
  chunks
    .command("rm")
    .requiredOption("--name <name>")
    .action((opts: { name: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const path = chunkPath(cwd, opts.name);
      if (!existsSync(path)) throw new Error(`Chunk not found: ${opts.name}`);
      rmSync(path);
      console.log("OK");
    });
  chunks
    .command("edit")
    .requiredOption("--name <name>")
    .option("--keywords <keywords>")
    .option("--text <text>")
    .action(async (opts: { name: string; keywords?: string; text?: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const current = listChunks(cwd).find((c) => c.name === opts.name);
      if (!current) throw new Error(`Chunk not found: ${opts.name}`);
      await writeChunk(cwd, {
        ...current,
        keywords: opts.keywords ? opts.keywords.split(",").map((s) => s.trim()).filter(Boolean) : current.keywords,
        content: opts.text ?? current.content,
        updatedAt: nowLocal()
      });
      console.log("OK");
    });
  chunks
    .command("list")
    .option("--size <size>", "page size", "10")
    .option("--page <page>", "page number", "1")
    .option("--order <order>", "asc/desc", "asc")
    .option("--sort <sort>", "name/createdAt/updatedAt", "name")
    .action((opts: { size: string; page: string; order: "asc" | "desc"; sort: SortField }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const size = Number(opts.size);
      const page = Number(opts.page);
      const orderFactor = opts.order === "desc" ? -1 : 1;
      const sortField = opts.sort;
      if (!["name", "createdAt", "updatedAt"].includes(sortField)) {
        throw new Error(`Invalid sort field: ${sortField}`);
      }
      const all = listChunks(cwd).sort((a, b) =>
        String(a[sortField]).localeCompare(String(b[sortField])) * orderFactor
      );
      const slice = all.slice((page - 1) * size, page * size);
      console.log(
        table(
          ["name", "keywords", "createdAt", "updatedAt"],
          slice.map((c) => [c.name, c.keywords.join(","), c.createdAt, c.updatedAt])
        )
      );
    });
  chunks
    .command("search")
    .requiredOption("--q <query>")
    .option("--field <field>", "keywords|content|name", "keywords")
    .option("--case-sensitive", "case sensitive search")
    .option("--match <mode>", "contains|exact|prefix", "contains")
    .action((opts: { q: string; field: SearchField; caseSensitive?: boolean; match: MatchMode }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const field = opts.field;
      if (!["keywords", "content", "name"].includes(field)) throw new Error(`Invalid field: ${field}`);
      const match = opts.match;
      if (!["contains", "exact", "prefix"].includes(match)) throw new Error(`Invalid match mode: ${match}`);
      const q = opts.caseSensitive ? opts.q : opts.q.toLowerCase();
      const isMatch = (target: string) => {
        const source = opts.caseSensitive ? target : target.toLowerCase();
        if (match === "exact") return source === q;
        if (match === "prefix") return source.startsWith(q);
        return source.includes(q);
      };
      const result = listChunks(cwd).filter((c) => {
        if (field === "name") return isMatch(c.name);
        if (field === "content") return isMatch(c.content);
        return c.keywords.some(isMatch);
      });
      console.log(result.map((r) => r.name).join("\n") || "");
    });
  chunks.command("read").requiredOption("--names <names>").action((opts: { names: string }) => {
    const cwd = process.cwd();
    ensureApm(cwd);
    const names = opts.names.split(",").map((s) => s.trim()).filter(Boolean);
    const all = listChunks(cwd);
    const selected = names.map((name) => {
      const item = all.find((c) => c.name === name);
      if (!item) throw new Error(`Chunk not found: ${name}`);
      return item;
    });
    console.log(
      selected
        .map(
          (s) =>
            `## ${s.name}\nkeywords: ${s.keywords.join(", ")}\ncreatedAt: ${s.createdAt}\nupdatedAt: ${s.updatedAt}\n\n${s.content}`
        )
        .join("\n\n")
    );
  });

  const config = program.command("config");
  config.command("show").action(() => {
    const cfg = readConfig(process.cwd());
    console.log(JSON.stringify(cfg, null, 2));
  });
  config
    .command("set")
    .requiredOption("--section <section>", "role|persist|tmpDetail")
    .requiredOption("--min <min>")
    .requiredOption("--max <max>")
    .action(async (opts: { section: Section; min: string; max: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const cfg = readConfig(cwd);
      const sec = opts.section;
      if (!["role", "persist", "tmpDetail"].includes(sec)) throw new Error(`Invalid section: ${sec}`);
      const min = Number(opts.min);
      const max = Number(opts.max);
      if (min > max) throw new Error("min must be <= max.");
      const next = { ...cfg, limits: { ...cfg.limits, [sec]: { min, max } } };
      ConfigSchema.parse(next);
      await writeConfig(cwd, next);
      console.log("OK");
    });

  return program;
}

export { buildProgram, nowLocal, parseFrontMatter };

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
