import type { Section } from "../schemas/config";

const SNAPSHOT_SECTIONS = new Set<Section>(["role", "persist", "dynamicDetail"]);

/** 是否为 memory 三段（role / persist / dynamicDetail），写入时需生成 archive 快照。 */
export function isMemorySnapshotSection(section: Section): boolean {
  return SNAPSHOT_SECTIONS.has(section);
}

/** CLI/目录用段名：dynamicDetail → dynamic */
export function memorySnapshotSectionDir(section: Section): "role" | "persist" | "dynamic" {
  if (section === "dynamicDetail") return "dynamic";
  if (section === "role" || section === "persist") return section;
  throw new Error(`Not a memory snapshot section: ${section}`);
}

/**
 * 生成 archive 相对 kb/ 的路径：archive/yyyy/MM/dd/{section}/HHmmssSSS.md
 * @param section 记忆段
 * @param at 写入时刻（默认当前本地时间）；测试可注入固定 Date
 */
export function buildMemorySnapshotArchiveRelPath(section: Section, at: Date = new Date()): string {
  const dir = memorySnapshotSectionDir(section);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const yyyy = at.getFullYear();
  const MM = pad(at.getMonth() + 1);
  const dd = pad(at.getDate());
  const ts = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}${pad(at.getMilliseconds(), 3)}`;
  return `archive/${yyyy}/${MM}/${dd}/${dir}/${ts}.md`;
}
