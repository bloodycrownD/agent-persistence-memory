---
name: apm-memory-first
description: Uses APM CLI as the primary memory loop for ongoing work. Use when handling coding, debugging, planning, or mixed general tasks where context must persist across turns, interruptions, and long-running sessions. Prefer frequent apm read/write updates to keep role, persistent memory, dynamic detail, and config synchronized.
disable-model-invocation: true
---

# APM memory-first（本仓库 CLI）

## 目的

把本仓库的 `apm` CLI 当作**主记忆回路**：在长时间任务、被打断、或需要可复核落盘时，用 **`role` / `persist` / `dynamic detail` / `config`** 维持一致上下文，而不是只在对话里堆状态。

## 何时启用

- 多轮实现、调试、规划混在一起，需要**可恢复**的“当前事实”
- 需要把结论写进仓库旁 `.apm/`，供下一轮或脚本读取
- 要调整各段正文的 min/max 限制时（`apm config set --section …`）

## 核心命令（当前产品面）

初始化（多数子命令会隐式 `ensureApm`）后，布局包含 **`.apm/dynamic/detail.md`**（dynamic detail 正文），以及 `role.md`、`persistence/memory.md`、`config.json` 等。

| 能力 | 示例 |
|------|------|
| 角色 / 持久记忆 | `apm role show`、`apm role write --text '…'`；`apm persist …` |
| 动态明细（原 tmp detail） | `apm dynamic detail show`、`apm dynamic detail write --text '…'`、`apm dynamic show` |
| 配置段限制 | `apm config set --section dynamicDetail --min 500 --max 1000` |
| 占位 read | `apm read`（输出「开发中」） |

**已移除（勿再使用）**：`chunks`、`tmp`、`todos` 子命令与 `.apm/chunks`、`.apm/tmp` 布局；配置键 **`tmpDetail`** 已改为 **`dynamicDetail`**（破坏性，无兼容读旧键）。

## 工作流清单（建议频率）

1. **开局**：`apm role show`、`apm persist show`、`apm dynamic detail show`（或 `apm dynamic show`）了解当前落盘状态。
2. **推进中**：把**稳定结论**写入 `persist`；把**当前阶段执行细节**写入 `dynamic detail`；角色边界/口吻更新 `role`。
3. **收口前**：再跑一遍 show，确认长度在 `config` 范围内；必要时 `apm config show`。
4. **导入索引（可选）**：`tsx scripts/import-memory-to-apm.ts` 仅写入 **persist + dynamicDetail** 的摘要，不创建 chunks/todos。

## 约束

- 时间戳格式：`YYYY-MM-DD HH:mm:ss`（系统本地时区），与 CLI 帮助一致。
- Windows 控制台若中文乱码，可先 `chcp 65001`。
- 改源码后执行 `npm run build`（`apm` 入口为 `dist/index.js`）。

## 与「只聊天」的边界

APM 文件是**单一事实来源**之一：对话可以讨论方案，但**已确认**的决策与任务状态应反映到 `role` / `persist` / `dynamic detail`，避免下一轮从零推断。
