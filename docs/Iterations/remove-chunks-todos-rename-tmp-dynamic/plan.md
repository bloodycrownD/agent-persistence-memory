# 移除 chunks / todos 并将 tmp 更名为 dynamic 设计方案

依据：`docs/Iterations/remove-chunks-todos-rename-tmp-dynamic/spec.md`（完全破坏性、零兼容）。

## 设计目标

- 从代码与 **新** 磁盘布局中 **彻底移除** chunks、todos 能力及其实现与测试。
- 将「临时工作区」统一为 **dynamic**：CLI、路径、`Section` 与 `config.json` 的 **`dynamicDetail`** 一致。
- **`apm dynamic show`** 仅展示 **dynamic detail** 正文（不再含 Todos 区块）；`detail` 子命令族行为与现 **`apm tmp detail`** 对齐，仅 section 与路径更名。
- 保持 `role` / `persist` / `config` 等现有能力与测试基线；导入脚本在无 chunks 前提下 **仍有可执行语义**（见下文）。

## 总体方案

1. **删除竖切**：移除 chunks / todos 的 CLI、service、schema、`doc-limits` 与 chunk/todo 专用错误常量；`apmPaths` 不再暴露 `chunksDir` / `todosDir`，`ensureApm` 只创建 `persistence/`、`dynamic/` 及既有 `role` / `config` / `status` / lock 等。
2. **横切更名**：`tmp` CLI 与 `tmp.ts` → **`dynamic`** / `dynamic.ts`；磁盘 `.apm/tmp/**` → **`.apm/dynamic/detail.md`**；配置与类型 **`tmpDetail` → `dynamicDetail`**，贯通 `sections-service`、`registerSectionCommands`、`config` 子命令、`DEFAULT_CONFIG` / `ConfigSchema` / `CONFIG_SHAPE_HINT`。
3. **占位 read**：删除 `--with-all-chunks` 等与已删能力相关的选项，避免歧义。
4. **导入脚本**：不再写入 chunk、不创建 todo；改为在 **`persist`** 与 **`dynamicDetail`** 写入符合长度限制的摘要（条数、下一步提示等），文件头注释与控制台输出同步更新。**不**再承诺「全文按 200 字入库」；若未来需要新的归档载体，单独立项。

## 最终项目结构

```
src/
  cli/
    commands/
      chunks.ts          # 删除
      tmp.ts             # 删除，新增 dynamic.ts
      read.ts            # 修改（去掉 chunk 相关 option）
      config.ts          # 修改（section 枚举文案）
      section.ts         # 无路径逻辑；若仅类型引用则随 config 类型自动更新
      register.ts        # 修改
  services/
    chunks-service.ts    # 删除
    todos-service.ts     # 删除
    sections-service.ts  # 修改（Section、label、limits 分支）
    config-service.ts    # 若无直接 tmp 引用则可能不变
  schemas/
    chunk.ts             # 删除
    todo.ts              # 删除
    config.ts            # 修改
  storage/
    paths.ts             # 修改
  core/
    doc-limits.ts        # 删除（仅服务 chunk/todo）
    limits-messages.ts   # 删除或清空后删除（仅 chunk/todo/renameChunk 文案）
scripts/
  import-memory-to-apm.ts  # 重写语义（见实现步骤）
tests/
  cli.spec.ts            # 大改：删 chunk/todo/tmp 用例；增 dynamic 路径与 config 用例
  write-limits.spec.ts   # 删除整文件（或改为仅 section 的测试；推荐删除以免空壳）
.cursor/skills/
  apm-memory-first/SKILL.md  # 修改示例命令与 checklist
```

> 说明：`src/storage/fs-atomic.ts` 中临时文件后缀 `.tmp-` 为 **操作系统临时文件名**，与产品「tmp 工作区」无关，**不**改名。

## 变更点清单

| 路径 | 操作 | 摘要 |
|------|------|------|
| `src/cli/commands/chunks.ts` | 删除 | 移除 `chunks` 命令族 |
| `src/services/chunks-service.ts` | 删除 | — |
| `src/schemas/chunk.ts` | 删除 | — |
| `src/cli/commands/tmp.ts` | 删除 | 由 `dynamic.ts` 替代 |
| `src/cli/commands/dynamic.ts` | 新增 | `registerDynamic`；`dynamic detail` → `registerSectionCommands(..., "dynamicDetail")`；`dynamic show` 仅输出 detail |
| `src/services/todos-service.ts` | 删除 | — |
| `src/schemas/todo.ts` | 删除 | — |
| `src/core/doc-limits.ts` | 删除 | — |
| `src/core/limits-messages.ts` | 删除 | 若其它模块无引用 |
| `src/storage/paths.ts` | 修改 | `detail` → `join(root, "dynamic", "detail.md")`；去掉 `todosDir`/`chunksDir`；`ensureApm` 仅 `mkdirSync(..., "dynamic")`，不再创建 tmp/chunks/todos |
| `src/schemas/config.ts` | 修改 | `tmpDetail` → `dynamicDetail`；`Section` 联合类型同步 |
| `src/services/sections-service.ts` | 修改 | `sectionPath` / `sectionLabel` / `enforceLimits` 三分支改为 `dynamicDetail`；label 文案 **「dynamic detail」** |
| `src/cli/commands/config.ts` | 修改 | `--section` 合法值含 `dynamicDetail`，帮助字符串更新 |
| `src/cli/register.ts` | 修改 | `registerChunks`/`registerTmp` 移除；`registerDynamic` |
| `src/cli/commands/read.ts` | 修改 | 移除 `--with-all-chunks` |
| `scripts/import-memory-to-apm.ts` | 重写 | 去掉 chunk/todo 写入与相关 import；persist + `dynamicDetail` 摘要；顶部注释与 `console.log` 更新 |
| `tests/cli.spec.ts` | 修改 | 删除所有 chunks/tmp todos 相关 `it`；新增至少：`dynamic detail show/write`、`config set --section dynamicDetail`、`dynamic show` 路径断言 `.apm/dynamic/detail.md` |
| `tests/write-limits.spec.ts` | 删除 | 当前文件仅测 chunk/todo service 与 CLI |
| `.cursor/skills/apm-memory-first/SKILL.md` | 修改 | 替换为 `dynamic` / `dynamic detail`；去掉 todos/chunks checklist |
| `memory/README.md` 等 | 视 grep 结果 | 若测试或脚本硬编码 `.apm/tmp` / `tmp todos`，做 **最小** 文字或路径修正以满足 spec「与测试冲突则修补」 |

## 兼容性或迁移说明

**不适用。** 与 `spec.md` 一致：不实现双读配置键、不搬迁旧目录、不提供迁移命令。实现 PR / release note **一句**声明破坏性即可。

## 详细实现步骤

### 阶段 A — 配置与存储基座

1. 修改 `src/schemas/config.ts`：`DEFAULT_CONFIG`、`ConfigSchema`、`Section`、`CONFIG_SHAPE_HINT` 中 **`tmpDetail` → `dynamicDetail`**。
2. 修改 `src/storage/paths.ts`：`apmPaths.detail` 指向 **`dynamic/detail.md`**；删除 `todosDir`、`chunksDir`；`ensureApm` 创建 **`dynamic`** 目录与 `detail.md`，**删除**对 `tmp`、`todos`、`chunks` 的 `mkdirSync`。
3. 修改 `src/services/sections-service.ts`：所有 `tmpDetail` 分支改为 `dynamicDetail`；`sectionLabel` 返回 **`dynamic detail`**；`enforceLimits` 使用 `cfg.limits.dynamicDetail`。
4. `npm run build` 会报错；继续阶段 B 修复引用。

### 阶段 B — CLI：dynamic 与注册

5. 新增 `src/cli/commands/dynamic.ts`：  
   - `program.command("dynamic")`  
   - `dynamic.command("detail")` + `registerSectionCommands(detailCmd, "dynamicDetail")`  
   - `dynamic.command("show")`：`readSectionContent(cwd, "dynamicDetail")` 单行号输出（或 `toLineNumbered` 与现 tmp show 的 detail 部分一致，**不含 Todos**）。
6. 删除 `src/cli/commands/tmp.ts`。
7. 修改 `src/cli/register.ts`：移除 `registerTmp`、`registerChunks`；`import { registerDynamic } from "./commands/dynamic"` 并注册。
8. 修改 `src/cli/commands/config.ts`：`role|persist|dynamicDetail` 校验与帮助文案。
9. 修改 `src/cli/commands/read.ts`：删除 `--with-all-chunks` option 及相关描述。

### 阶段 C — 删除 chunks / todos 模块

10. 删除：`chunks.ts`、`chunks-service.ts`、`chunk.ts`、`todos-service.ts`、`todo.ts`、`doc-limits.ts`、`limits-messages.ts`（确认无其它 import 后删除；若有 `limits-messages` 仅被已删文件引用则整文件删除）。
11. 全局 `grep`：`chunks-service`、`todos-service`、`schemas/chunk`、`schemas/todo`、`doc-limits`、`limits-messages`、`registerTmp`、`command("tmp")`、`command("chunks")`、`tmpDetail`、`todosDir`、`chunksDir`、`.apm/tmp`（字符串字面量），确保运行时代码路径清零。

### 阶段 D — 脚本与技能

12. 重写 `scripts/import-memory-to-apm.ts`：  
    - 保留：读 `memory/persistence/index.md`、解析记录、`ensureApm`。  
    - 移除：`writeChunk`、`listChunks`、`writeTodo`、`listTodos` 及分段常量逻辑中与 chunk/todo 相关的全部代码。  
    - 新行为（建议）：统计 `records.length` 与可选总字数摘要，在 **`persist`** 与 **`dynamicDetail`** 各写入一段满足 `enforceLimits` 的说明性中文（内容描述「已导入索引条目数、源在 memory/persistence、后续请人工整理到 persist」等），**不再**声称 chunks 检索。  
    - `writeSection(..., "dynamicDetail", ...)` 使用新 section 名。
13. 更新 `.cursor/skills/apm-memory-first/SKILL.md` 中所有 `tmp` / `chunks` / `todos` 指令示例。

### 阶段 E — 测试

14. 删除 `tests/write-limits.spec.ts`。
15. 编辑 `tests/cli.spec.ts`：删除与 chunks、todos、tmp、todos 校验相关的用例；为 **`dynamic`** 补充与现 `role` 测试同风格的用例（`config set --section dynamicDetail`、`dynamic detail write/show`、`dynamic show`、断言 `join(dir, ".apm", "dynamic", "detail.md")` 存在）。
16. 运行 `npm run build` 与 `npm test`，修复残余类型错误。

## 测试策略

- **单元 / 集成**：以现有 Vitest + `runCli` 模式为主；不引入新测试框架。
- **回归**：`role` / `persist` / `config` / `read` 占位、`edit` 数值校验等与本次无关用例保持通过。
- **破坏性验证**：新目录初始化后 **不存在** `.apm/tmp`、`.apm/chunks` 创建逻辑（可通过 `ensureApm` 后 `readdir` 或路径不存在断言）。

### 测试用例

| ID | 类型 | 步骤 / 断言 |
|----|------|-------------|
| TC1 | CLI | `apm --help` 含 `dynamic`，**不含** `tmp`、`chunks` |
| TC2 | 路径 | 新 `mkdtemp` 目录下首次跑任意需 `ensureApm` 的命令后，存在 `.apm/dynamic/detail.md`，**不存在** `.apm/tmp`、`\.apm/chunks` 目录（或未创建） |
| TC3 | section | `config set --section dynamicDetail --min 500 --max 1000`（或项目默认）后，`dynamic detail write` 在范围内成功，`write` 过短/过长失败信息与 `sections-service` 一致 |
| TC4 | CLI | `dynamic detail show` 与 `dynamic show` 可运行且无对 todos 的引用 |
| TC5 | 脚本 | `tsx scripts/import-memory-to-apm.ts` 在含 `memory/persistence/index.md` 的夹具下可跑通（若 CI 无夹具，则以本地手册或后续加夹具为准；**最低**要求为 `tsc` 编译脚本无错且与 service 签名一致） |
| TC6 | 清理 | 删除 `write-limits.spec.ts` 后全量 `npm test` 通过 |

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 删除面过大漏 import | 每阶段结束 `npm run build` + `grep` 清单 | Git 回退该 commit |
| `import-memory-to-apm` 行为变化导致外部依赖脚本失效 | PR 说明破坏性；脚本仅面向本仓库 | 回滚 commit；用户自行 pin 旧版本 |
| `Section` 改名漏改某分支运行时抛错 | `Section` 为联合类型，TS  exhaustiveness 报错 | 同左 |
| `memory/` 文档与真实 CLI 不一致 | grep `tmp todos` / `chunks` 后最小改文案 | 文档回滚 |

**回滚**：单分支上 `git revert <merge_commit>` 即可恢复 chunks/todos/tmp；无数据库、无线上迁移状态。

---

**文档路径：** `docs/Iterations/remove-chunks-todos-rename-tmp-dynamic/plan.md`

请确认本 `plan.md` 是否可作为编码依据；确认后我再开始改代码（若你希望导入脚本 **完全删除** 而非「摘要写入 persist + dynamicDetail」，请说明，我会先更新本 plan 再实现）。
