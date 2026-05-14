import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowLocal } from "../core/time";
import { renderFrontMatter } from "./markdown";
import { DEFAULT_CONFIG } from "../schemas/config";

export function apmPaths(cwd: string) {
  const root = join(cwd, ".apm");
  return {
    root,
    config: join(root, "config.json"),
    status: join(root, "status.json"),
    persist: join(root, "persistence", "memory.md"),
    detail: join(root, "dynamic", "detail.md"),
    role: join(root, "role.md"),
    lock: join(root, ".write.lock")
  };
}

export function ensureApm(cwd: string): void {
  const p = apmPaths(cwd);
  mkdirSync(join(p.root, "persistence"), { recursive: true });
  mkdirSync(join(p.root, "dynamic"), { recursive: true });
  const now = nowLocal();
  if (!existsSync(p.config)) {
    writeFileSync(p.config, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
  if (!existsSync(p.status)) {
    writeFileSync(p.status, JSON.stringify({ initializedAt: now, updatedAt: now, lastReadAt: null }, null, 2), "utf8");
  }
  const emptySection = renderFrontMatter({ createdAt: now, updatedAt: now }, "");
  if (!existsSync(p.role)) writeFileSync(p.role, emptySection, "utf8");
  if (!existsSync(p.persist)) writeFileSync(p.persist, emptySection, "utf8");
  if (!existsSync(p.detail)) writeFileSync(p.detail, emptySection, "utf8");
}
