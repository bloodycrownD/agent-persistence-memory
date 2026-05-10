# APM Service 层写入长度校验 设计方案

## 设计目标

- 所有 **chunk / todo 落盘**在 service 内统一校验：**chunk 正文 ≤200**、`name + description` **≤100** 且 **description 去空白后非空**（与现 CLI 语义一致）。
- **收敛 chunk 写入**：CLI 不再 `renderFrontMatter` + `renameChunk(cwd, from, to, payload)`；重命名仅通过 **携带 `ChunkDoc` 的 service API**，由 service 内部序列化并校验。
- **单一错误文案来源**：抽常量，CLI 与 service 共用，避免分叉。
- **不扩大产品能力**：无自动截断、无迁移脚本；读路径仍容忍历史超长文件。

## 总体方案

1. **共享常量与断言**（新建小模块）  
   - `src/core/limits-messages.ts`：导出 `CHUNK_TEXT_LENGTH_ERROR`、`TODO_COMBO_LENGTH_ERROR`、`TODO_DESCRIPTION_REQUIRED_ERROR`、**`RENAME_CHUNK_REQUIRES_DISTINCT_NAMES`**（或等价命名，文案需明确「请使用 `writeChunk`」）等。  
   - `src/core/doc-limits.ts`（或 `limits-enforce.ts`）：导出  
     - `assertChunkContentWithinLimit(content: string): void` — 内部 `countChars` + 超限抛 `CHUNK_TEXT_LENGTH_ERROR`  
     - `assertTodoWritable(todo: { name: string; description: string }): void` — `description.trim()` 为空抛 `TODO_DESCRIPTION_REQUIRED`；`countChars(name + description) > 100` 抛 `TODO_COMBO_LENGTH_ERROR`  

2. **chunks-service**  
   - `writeChunk`：在组 `payload` 之前对 `chunk.content` 调用 `assertChunkContentWithinLimit`。  
   - **替换** `renameChunk(cwd, fromName, toName, payload: string)` 为 **`renameChunk(cwd, fromName, next: ChunkDoc)`**：  
     - **前置（方案 A，已确认）**：若 `fromName === next.name`，**立即 `throw`**（专用错误常量，说明应使用 `writeChunk`）。禁止在此路径内转调 `writeChunk`，避免「重命名 API 也能原地更新」的歧义，并杜绝「同路径写后误删」的实现风险。现 CLI 仅在改名时调用 `renameChunk`，行为不变。  
     - 对 `next` 做 `assertChunkContentWithinLimit(next.content)`（可在同名校验之后）。  
     - 在 **单锁**内：`renderFrontMatter(meta(next), next.content)` → `atomicWrite(newPath)` → `serialRm(oldPath)`，逻辑同今，仅 payload 生成移入 service。  
   - 可选：抽私有函数 `serializeChunk(chunk: ChunkDoc): string` 供 `writeChunk` 与 `renameChunk` 共用，避免两处 `renderFrontMatter` 字段不一致。

3. **todos-service**  
   - `writeTodoUnlocked`（或 `writeTodo` 入口）：在 `renderFrontMatter` 前调用 `assertTodoWritable(todo)`。  
   - `renameTodo` 无需重复写断言，只要最终仍走 `writeTodoUnlocked` 即可。

4. **CLI**  
   - **`chunks.ts`**：删除 `add` / `edit` 中的 `countChars` 与本地 `throw`；保留 `ensureApm`、`assertSafeName`、业务校验（重名、存在性）。`edit` 重命名分支改为 `await renameChunk(cwd, current.name, next)`，删除 `renderFrontMatter` 与 `payload` 变量；可移除对 `renderFrontMatter` 的 import（若本文件无其它引用）。  
   - **`tmp.ts`**：删除 `todos add` / `edit` 中的长度与 description 校验，改由 service 抛错；保留 `assertSafeName`、索引/重名/20 条上限等业务规则。

5. **测试**  
   - 新增 **`tests/write-limits.spec.ts`**（或并入 `cli.spec.ts`）：  
     - 使用 `mkdtemp` + `ensureApm`，直接 `import { writeChunk } from "../src/services/chunks-service"` 等，断言超长 `writeChunk` / `renameChunk` / `writeTodo` 抛出 **常量中的同一条**消息。  
     - 保留/补充一条 **CLI 路径**用例（例如 `runCli(["chunks","add",...])`）确保错误仍冒泡到用户可见（回归 commander + service 集成）。

## 最终项目结构

```text
src/
  core/
    doc-limits.ts          # 新建：assertChunkContentWithinLimit、assertTodoWritable
    limits-messages.ts     # 新建：错误文案常量
    validate.ts            # 已有：countChars（doc-limits 内复用）
  services/
    chunks-service.ts      # 修改：writeChunk 校验；renameChunk(ChunkDoc)；内部序列化
    todos-service.ts       # 修改：writeTodoUnlocked 前 assertTodoWritable
  cli/
    commands/
      chunks.ts            # 修改：去掉重复校验与 CLI 侧 renderFrontMatter+rename 拼文件
      tmp.ts               # 修改：去掉 todo 长度重复校验
tests/
  write-limits.spec.ts     # 新建：service 层直调 + 可选 CLI 一条
  cli.spec.ts              # 按需微调期望文案（若完全共用常量则无变化）
docs/
  Iterations/
    apm-service-layer-write-limits/
      spec.md
      plan.md              # 本文件
```

## 变更点清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/core/limits-messages.ts` | 新增 | 错误字符串常量 |
| `src/core/doc-limits.ts` | 新增 | 基于 `countChars` 的断言 |
| `src/services/chunks-service.ts` | 修改 | 校验；`renameChunk` 签名与实现；可选 `serializeChunk` |
| `src/services/todos-service.ts` | 修改 | `writeTodoUnlocked` 前断言 |
| `src/cli/commands/chunks.ts` | 修改 | 删重复校验；`renameChunk(cwd, current.name, next)` |
| `src/cli/commands/tmp.ts` | 修改 | 删 todo 长度/description 重复校验 |
| `tests/write-limits.spec.ts` | 新增 | Service 直调与 CLI 回归 |
| `tests/cli.spec.ts` | 可能修改 | 若某用例依赖「CLI 先抛」顺序，改为接受 service 消息 |

## 详细实现步骤

1. **新增 `limits-messages.ts`**  
   从现有 `chunks.ts` / `tmp.ts` 复制字面量到常量导出（一字不改）。

2. **新增 `doc-limits.ts`**  
   实现 `assertChunkContentWithinLimit`、`assertTodoWritable`，仅抛 `Error(常量)`。

3. **修改 `chunks-service.ts`**  
   - `writeChunk` 首行或序列化前：`assertChunkContentWithinLimit(chunk.content)`。  
   - 将 `renameChunk` 改为 `(cwd, fromName, next: ChunkDoc)`；实现内：**先**断言 `fromName !== next.name`，再内容校验、`serializeChunk`、加锁、`atomicWrite`+`serialRm`。  
   - **删除**对外暴露的「原始字符串 payload」写入路径；全仓库 `grep renameChunk` 确保仅 CLI 一处调用且已更新。  

4. **修改 `todos-service.ts`**  
   在 `writeTodoUnlocked` 开头调用 `assertTodoWritable(todo)`。

5. **修改 `chunks.ts`**  
   - 移除 `countChars` 与 200 相关 `throw`（若文件内无其它用途则移除 import）。  
   - 重命名分支：`await renameChunk(cwd, current.name, next)`。  
   - 移除 `renderFrontMatter` import。

6. **修改 `tmp.ts`**  
   - `add`：删除 `countChars` 与 `description` 的 CLI 侧长度/空校验（保留 `!opts.description.trim()` 可删，改由 service 抛 `TODO_DESCRIPTION_REQUIRED` —— **注意**：现 CLI 是 `!opts.description.trim()`，service 应对齐同一规则）。  
   - `edit`：同样删除重复断言。

7. **测试**  
   - `write-limits.spec.ts`：`writeChunk` 201 字失败；`writeTodo` name+desc 101 失败；`description` 全空白失败；`renameChunk` 传入超长 `next.content` 失败。  
   - 运行 `npm test`；必要时修 `cli.spec.ts` 中断言字符串为导入的常量。

8. **`npm run build`** 确认无类型错误（`renameChunk` 签名变更会影响所有调用方）。

## 兼容性与迁移说明

- **磁盘已有超长 chunk/todo**：读列表仍成功；下一次 **经 CLI 的写回**（如 `complete`、`priority`、`edit`）若触发 `writeTodo`/`writeChunk` 且正文仍超长，将 **失败并抛错** —— 与 spec 一致；用户需手工 `edit`/`write` 缩短。  
- **API 破坏性**：`renameChunk(cwd, from, to, payload)` 若被仓库外代码依赖，属 **破坏性变更**；本仓库内仅 `chunks.ts` 调用，可一并改完。  
- **行为等价**：成功路径下生成文件字节应与「原 CLI 拼 payload」一致（同一 `renderFrontMatter` 字段顺序与内容）。

## 测试策略

### 测试用例

| 编号 | 场景 | 期望 |
|------|------|------|
| T1 | `ensureApm` 后直接 `writeChunk`，`content` 长度 201 | `throw`，消息为 chunk 常量 |
| T2 | `writeChunk` 长度 200 | 成功，文件可读 |
| T3 | `renameChunk(cwd, "a", { ... name: "b", content: 201字 ... })` | `throw`（内容超长） |
| T3b | `renameChunk(cwd, "a", { ... name: "a", content: "ok" ... })` | `throw`，消息为 **同名重命名**常量 |
| T4 | `renameChunk` 合法，`fromName !== next.name` | 新文件存在、旧文件删除、内容一致 |
| T5 | `writeTodo`，`name+description` 101 字符 | `throw` |
| T6 | `writeTodo`，`description` 为 `"   "` | `throw`（与现 CLI 一致） |
| T7 | CLI `chunks add --text` 201 字符 | 失败，stderr/抛错消息同常量 |
| T8 | CLI `tmp todos add` 超长 name+desc | 失败，消息同常量 |
| T9 | 现有 `cli.spec.ts` 全部通过 | 回归 |

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| `renameChunk` 签名变更遗漏调用方 | 全仓库 grep；`tsc` | `git revert` 该提交 |
| 双锁或锁顺序变化导致死锁 | 保持与现 `renameChunk` 相同的 `withGlobalLock` + `serialWrite` 结构 | 同上 |
| CLI 与 service 文案不一致 | 强制只用 `limits-messages.ts` | 单测断言消息等于常量 |
| 历史 todo `complete` 突然失败 | 文档已在 spec；支持侧告知用户先 `edit` 缩短 | 业务上非代码回滚 |

---

**已确认：`renameChunk` 采用严格策略（方案 A）** — `fromName === next.name` 时 **抛错**，调用方必须使用 **`writeChunk`**。实现时按上文常量文案与 **T3b** 单测落实即可。
