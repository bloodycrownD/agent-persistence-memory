import { load as yamlLoad, dump as yamlDump } from "js-yaml";

export function parseFrontMatter(raw: string): { meta: unknown; content: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error("Invalid markdown front matter: missing opening --- line.");
  }
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error("Invalid markdown front matter: missing closing --- line.");
  }
  const metaRaw = normalized.slice(4, end).trim();
  const content = normalized.slice(end + 5);
  let meta: unknown;
  try {
    meta = yamlLoad(metaRaw) ?? {};
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid markdown front matter YAML: ${msg}`);
  }
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error("Invalid markdown front matter YAML: expected a mapping/object.");
  }
  return { meta, content };
}

export function renderFrontMatter(meta: Record<string, unknown>, content: string): string {
  const yaml = yamlDump(meta, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: true
  }).trimEnd();
  return `---\n${yaml}\n---\n${content.replace(/\r\n/g, "\n")}`;
}

