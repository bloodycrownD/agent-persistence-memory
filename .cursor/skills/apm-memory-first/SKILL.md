---
name: apm-memory-first
description: Uses APM CLI as the primary memory loop for ongoing work. Use when handling coding, debugging, planning, or mixed general tasks where context must persist across turns, interruptions, and long-running sessions. Prefer frequent apm read/write updates to keep role, persistent memory, dynamic detail, and config synchronized.
disable-model-invocation: true
---

<!--
Skill files use module-level sections (purpose, triggers, command tables, workflows)
instead of line-by-line narration so agents load intent quickly and the doc stays
stable when CLI flags change.
-->

# APM memory-first（本仓库 CLI）

## 目的

把本仓库的 `apm` CLI 当作**主记忆回路**：在长时间任务、被打断、或需要可复核落盘时，用 **`role` / `persist` / `dynamic` / `kb` / `config`** 维持一致上下文，而不是只在对话里堆状态。

## 何时启用

- 多轮实现、调试、规划混在一起，需要**可恢复**的“当前事实”
- 需要把结论写进仓库旁 `.apm/`，供下一轮或脚本读取
- 要调整各段正文的 min/max 限制时（`apm config set --section …`）

## 核心命令（当前产品面）

初始化：先 **`apm init`** 得到完整 v2 树；多数子命令也会在**无 `.apm`** 时懒创建同布局。记忆正文在 **`.apm/memory/`**（`role.md`、`persist.md`、`dynamic.md`），知识库在 **`.apm/kb/docs`**，知识库侧过程笔记在 **`.apm/kb/dynamic/detail.md`**（与 `memory/dynamic.md` 分离）。

| 能力 | 示例 |
|------|------|
| 角色 / 持久记忆 | `apm role show`、`apm role write --text '…'`；`apm persist …` |
| 任务动态（memory） | `apm dynamic show`、`apm dynamic write --text '…'`；阶段结束 `apm dynamic archive` / `apm dynamic clear` |
| 知识库 | `apm kb write`、`apm kb import --from <dir>`、`apm kb index rebuild`、`apm kb search --q '…'`；过程笔记 `apm kb dynamic show|write|edit` |
| 配置段限制 | `apm config set --section dynamicDetail` 或 `kbDynamicDetail` |
| 占位 read | `apm read`（输出「开发中」） |

**已移除（勿再使用）**：`chunks`、`tmp`、`todos` 子命令与旧 `.apm` 根下 `role.md` / `persistence/` 布局；旧树需备份后删除并由 **`apm init`** 建立 v2。

## 工作流清单（建议频率）

1. **开局**：`apm init`（若尚无树）；`apm role show`、`apm persist show`、`apm dynamic show` 了解落盘状态；需要检索时 `apm kb search --q …`。
2. **推进中**：**稳定结论** → `persist`；**当前阶段执行细节** → `memory/dynamic.md`（`apm dynamic`）；**知识型笔记** → `kb/docs`；角色边界 → `role`；知识库侧随笔 → `apm kb dynamic`。
3. **收口前**：再跑一遍 show，确认长度在 `config` 范围内；必要时 `apm config show`。
4. **导入索引（可选）**：`tsx scripts/import-memory-to-apm.ts` 仅写入 **persist + dynamicDetail** 的摘要，不创建 chunks/todos（需已存在 v2 `.apm` 或通过其它命令懒创建）。

## 约束

- 时间戳格式：`YYYY-MM-DD HH:mm:ss`（系统本地时区），与 CLI 帮助一致。
- Windows 控制台若中文乱码，可先 `chcp 65001`。
- 改源码后执行 `npm run build`（`apm` 入口为 `dist/index.js`）。

## 与「只聊天」的边界

APM 文件是**单一事实来源**之一：对话可以讨论方案，但**已确认**的决策与任务状态应反映到 `role` / `persist` / `dynamic`（及 kb 约定路径），避免下一轮从零推断。
