/** Chunk body shares the same char budget as read primary excerpts (see main spec). */
import type { Command } from "commander";
import { ensureApm } from "../../storage/paths";
import { assertSafeName } from "../../core/name-sanitize";
import { nowLocal } from "../../core/time";
import { parsePositiveInt } from "../../core/validate";
import { table } from "../../formatters/table";
import { listChunks, rmChunk, type ChunkDoc, writeChunk, renameChunk } from "../../services/chunks-service";

type MatchMode = "contains" | "exact" | "prefix";
type SearchField = "keywords" | "content" | "name";
type SortField = "name" | "createdAt" | "updatedAt";

export function registerChunks(program: Command): void {
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
    .action(async (opts: { name: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      await rmChunk(cwd, opts.name);
      console.log("OK");
    });

  chunks
    .command("edit")
    .requiredOption("--name <name>")
    .option("--new-name <name>", "rename chunk (safe unique name)")
    .option("--keywords <keywords>")
    .option("--text <text>")
    .action(async (opts: { name: string; newName?: string; keywords?: string; text?: string }) => {
      const cwd = process.cwd();
      ensureApm(cwd);
      const current = listChunks(cwd).find((c) => c.name === opts.name);
      if (!current) throw new Error(`Chunk not found: ${opts.name}`);
      const nextName = opts.newName ?? current.name;
      assertSafeName(nextName);
      const nextContent = opts.text ?? current.content;
      const next: ChunkDoc = {
        ...current,
        name: nextName,
        keywords: opts.keywords ? opts.keywords.split(",").map((s) => s.trim()).filter(Boolean) : current.keywords,
        content: nextContent,
        updatedAt: nowLocal()
      };

      if (next.name === current.name) {
        await writeChunk(cwd, next);
        console.log("OK");
        return;
      }

      await renameChunk(cwd, current.name, next);
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
      const size = parsePositiveInt("--size", opts.size);
      const page = parsePositiveInt("--page", opts.page);
      if (opts.order !== "asc" && opts.order !== "desc") {
        throw new Error(`Invalid --order: ${String(opts.order)}. Expected asc|desc.`);
      }
      const orderFactor = opts.order === "desc" ? -1 : 1;
      const sortField = opts.sort;
      if (!["name", "createdAt", "updatedAt"].includes(sortField)) {
        throw new Error(`Invalid sort field: ${sortField}`);
      }
      const all = listChunks(cwd).sort((a, b) => String(a[sortField]).localeCompare(String(b[sortField])) * orderFactor);
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
}

