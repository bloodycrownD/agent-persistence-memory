# APM Service 层写入长度校验 需求说明

## 背景

当前 `role` / `persist` / `tmp detail` 在 `writeSection` 内通过 `enforceLimits` 统一校验正文长度后再落盘；而 **chunk 正文 ≤200**、**todo 的 name+description 合计 ≤100** 仅在 CLI 命令层（`chunks.ts`、`tmp.ts`）检查，`writeChunk`、`writeTodo`、`renameTodo` 等 service 不校验。

后果包括：手工改文件、未来脚本或其它入口若直接调用 service，可写入超长数据；`chunks edit` 重命名路径通过 `renameChunk` 写入预序列化 `payload` 时，规则是否被遵守完全依赖调用方。读路径亦不拒绝历史超长数据，与「写入约束」在架构上不一致。

此外，**文本落盘的接口不统一**：chunk 同时存在 `writeChunk(ChunkDoc)` 与「CLI 拼完整文件 + `renameChunk(..., payload)`」两条路径；todo 为「CLI 校验 + `writeTodo` 盲写」。本次除补齐校验外，应在 **service 层收敛落盘**（统一序列化、锁、校验），CLI 只构造领域对象并调用少数写入 API。

## 目标

- **凡经 service 写入磁盘的数据**，在落盘前必须通过既有长度规则（与 CLI 行为一致）。
- **单一可信边界**：业务规则优先集中在 service（或共享的校验模块），CLI 仅负责参数解析与用户提示，避免重复与遗漏。
- **写入收敛**：chunk、todos 的磁盘写入以 service 层 **少数明确 API** 为唯一合法路径（内部可拆私有辅助函数）；避免 CLI 拼好整文件字符串再绕过校验写入。`renameChunk` 宜向「接收 `ChunkDoc` 或先解析再走同一套 persist」靠拢，具体形态在实现中二选一并在本文档「待确认项」落地。

## 范围

### 包含范围

- **Chunks**
  - 在 `writeChunk`（及任何向 `.apm/chunks/*.md` 写入等价内容的路径）中校验正文：`countChars(content) <= 200`，错误信息与现 CLI 一致或明确兼容（`Chunk text must be <= 200 characters (countChars).`）。
  - **`renameChunk` 收敛**：消除「CLI 渲染 `payload` + service 原样写入」的旁路；优先方案为 **仅由 service 根据 `ChunkDoc`（或等价结构）生成文件字节** 并在此路径上执行校验。若短期仍接收字符串，则必须在 service 内 **parse → 校验 content → 再写**，且错误信息带可读文件路径。
- **Todos**
  - 在 `writeTodo` / `writeTodoUnlocked` / `renameTodo` 最终落盘前校验：`countChars(name + description) <= 100`（拼接方式与现 CLI 一致：无中间分隔符），`description` 去空格后非空等与现 CLI 一致（若 CLI 已有「必填」规则，service 层应对齐）。
  - `tmp todos complete` / `priority` 等仅更新标量字段的写入，若仍经 `writeTodo` 写回全文，应自动受同一规则约束（不改变现有语义）。

### 不包含范围

- **自动修复超长内容**：不提供自动截断、自动拆分到多个 chunk、或自动迁移脚本；用户通过既有 **`edit` / `write` 子命令** 手工缩短正文，或将多余信息**新建其它 chunk** 分担（产品行为不变，仅操作方式说明）。
- **读路径**：`listChunks`、`readTodoFile` 等不强制拒绝已存在的超长历史文件（除非另开「迁移/修复」需求）。
- **`config` 写入**：无叙事正文长度需求，维持现状。
- **Section（role/persist/tmpDetail）**：已有 `enforceLimits`，本需求以对齐 chunk/todo 为主，除非发现 `editSection` 等遗漏（非本次必须）。
- **顶层 `apm read`**：占位状态，不涉及。

## 功能需求

1. 任意成功执行的 chunk 落盘，其正文长度满足 **≤200**（`countChars`）。
2. 任意成功执行的 todo 落盘，满足 **`name` + `description` 拼接长度 ≤100**（与现 CLI 拼接方式一致：无中间分隔符），且 `description` 规则与 CLI 对齐（如 `trim()` 后非空）。
3. 校验失败时 **抛出 Error**，进程退出码与现 CLI 失败行为一致；文案与现有一致或可测的等价表述。
4. CLI 层可删除与 service **完全重复**的长度判断，或保留为快速失败（二选一须在实现时统一，避免双份不一致逻辑）；**以 service 为最终准绳**。
5. **Chunk 落盘**：对外（含 CLI）仅通过 `writeChunk` / 收敛后的 `renameChunk`（或其它在 spec 中列名的单一入口）写入 chunk 文件；不在命令层重复 `renderFrontMatter` + `atomicWrite` 组合。

## 非功能需求

- 不引入新依赖；`countChars` 复用 `src/core/validate.ts`。
- 现有 Vitest 用例全部通过；**补充** service 层或直接调用 `writeChunk`/`writeTodo` 的测试，证明绕过 CLI 仍被拒绝。
- 改动范围聚焦校验与必要小重构，不扩大业务功能。

## 验收标准

- [ ] 直接调用 `writeChunk` 且 `content` 长度 >200 时失败，≤200 时成功。
- [ ] 直接调用 `writeTodo` / `renameTodo` 且 `name+description` 超限或 description 违反必填规则时失败。
- [ ] `renameChunk` 在正文超限时失败，不能仅靠 CLI 保证。
- [ ] **Chunk 写入**：CLI 中不再单独拼装完整 chunk 文件再调用低层写入；与 `chunks edit` 重命名相关的逻辑走 service 收敛路径。
- [ ] `npm test` 通过；必要时更新 CLI 测试以反映「service 报错」路径。

## 风险与待确认项

- **`renameChunk` 最终签名**：优先 **`ChunkDoc` + 旧名**（service 内序列化）；若过渡期保留 `payload: string`，须在 service 内 **parse → 校验正文 → 写入**，错误带文件路径。实现前在 PR / 评审二选一写死，避免长期双轨。
- **历史超长数据与 `complete` / `priority`**：收紧校验后，磁盘上已超长的 todo 在下次经 `writeTodo` 写回时可能失败，属预期。修复方式：**人工**使用 `tmp todos edit` 缩短 `name` / `description`（或拆分任务）；**不提供**本需求内的自动迁移脚本（可另立项）。
- **历史超长 chunk**：同样可通过 **`chunks edit`** 将正文改到 ≤200；多余信息由用户**手动**拆到其它 chunk 或丢弃，**本需求不实现**自动拆分或自动截断。
- **错误文案**：CLI 与 service 重复的错误字符串建议抽到 **共享常量**（如 `src/core/limits-messages.ts`），避免漂移。
