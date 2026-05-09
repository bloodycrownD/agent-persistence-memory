# APM CLI 外置记忆 V1 需求说明

## 背景

当前 `agent-persistence-memory` 是一个 CLI 应用，目标是为 Agent 提供可落地的外置记忆能力。用户希望将角色定义、持久化记忆、临时任务信息和联想记忆存储在当前工作目录下的 `.apm` 中，并通过命令行进行稳定管理。核心业务价值是支持会话中断后恢复，减少上下文丢失，提高连续协作效率。

## 目标

- 提供完整可用的 APM 命令集，支持记忆信息的读取、写入、编辑、搜索与展示。
- 统一记忆数据结构和输出格式，保证 Agent 与人工都能快速理解与维护。
- 通过本地文件存储实现可迁移、可审计的记忆持久化，不依赖外部数据库。

## 范围

### 包含范围

- 实现 `apm read`，按约定结构汇总输出角色、持久化记忆、当前记忆与联想区信息。
- 实现 `apm role` 全套命令：`show`、`write`、`edit`（带行号展示与行区间编辑）。
- 实现 `apm persist` 全套命令：`show`、`write`、`edit`（同 role 交互方式）。
- 实现 `apm tmp` 下子能力：
  - `tmp show`
  - `tmp todos`：`show/add/rm/edit/clear/list/complete/priority`
  - `tmp detail`：`show/write/edit`
- 实现 `apm chunks` 全套命令：
  - `list`（分页、排序）
  - `add/rm/edit`
  - `search`（按 keywords/content/name）
  - `read`（批量读取详情）
- 实现 `.apm` 目录存储结构及文件格式：
  - `.apm/config.json`
  - `.apm/status.json`
  - `.apm/role.md`
  - `.apm/chunks/*.md`
  - `.apm/persistence/memory.md`
  - `.apm/tmp/todos/*.md`
  - `.apm/tmp/detail.md`
- Markdown 文件采用 front matter（YAML）+ content 结构，字段满足定义（如 `name/keywords/createdAt/updatedAt` 等）。
- 提供命令演示与自动化测试（Vitest）作为验收依据。

### 不包含范围

- 不引入数据库、远程服务或云端同步能力。
- 不实现 GUI 或 Web 管理界面。
- 不处理多用户并发写入冲突的高级协作机制（如锁服务）。

## 功能需求

- `apm read`
  - 输出完整记忆模板结构，包含角色、持久化记忆、持久化关联、当前记忆（todos/detail）、联想区（片段与关键词）。
  - 自动填充时间信息（上次时间、当前时间）与当前任务描述（按优先级选择首个未完成任务）。
  - `read` 只做汇总与模板渲染，不引入模型推理或外部服务生成。
  - 支持 `--json` 输出，供 Agent 稳定解析；默认输出面向人工阅读的文本模板。
- `apm role` / `apm persist` / `apm tmp detail`
  - `show` 以 `行号|内容` 形式输出，行号从 1 开始。
  - `write` 覆盖写入目标内容。
  - `edit` 支持基于 `--start`、`--end` 的行区间替换。
  - `write/edit` 对写入内容执行字数限制，不满足时直接报错；默认阈值为：`role` 50~100 字、`persist` 300~500 字、`tmp detail` 500~1000 字（可通过 `apm config` 调整）。
- `apm tmp todos`
  - 支持新增、删除、编辑、清空、列出、完成、优先级设置。
  - 每条 todo 具备 `name/description/index/priority/createdAt/updatedAt` 元信息，其中 `name` 为唯一键，`index` 不可重复。
  - `description` 为必填，单条 todo 文本（`name + description` 组合）不超过 100 字。
  - 列表展示能够反映完成状态和优先级顺序，且优先级采用“数值越小越高”。
- `apm tmp show`
  - 汇总展示当前临时记忆（todos + detail），输出格式同 `role show`，即 `行号|内容`。
- `apm chunks`
  - `add/edit` 支持 `text`、`keywords`、`name`。
  - `name` 为唯一键；重名写入直接报错。
  - `keywords` 以逗号分隔并支持模糊搜索，最小 flag 集固定为：`--field`（`keywords|content|name`）、`--case-sensitive`（默认 false）、`--match`（`contains|exact|prefix`，默认 `contains`）。
  - `list` 默认每页 10 条，默认第 1 页，支持升降序字段排序并按表格对齐输出；排序字段固定为 `name`、`createdAt`、`updatedAt`。参数形式固定为 `--size`、`--page`、`--order <asc|desc>`、`--sort <field>`。
  - `read` 支持按逗号分隔的多个 name 批量读取详情。
- 文件系统行为
  - 在命令执行目录下读取/创建 `.apm` 目录及子结构。
  - 首次使用时自动初始化必要目录和文件。
  - 时间字段统一格式为本地时间字符串 `YYYY-MM-DD HH:mm:ss`，并在帮助文档明确为“系统本地时区时间”。
  - 文件写入默认采用“进程内串行 + 文件锁 + 临时文件替换”的策略，避免同机多进程踩写与部分写入损坏。
  - `name` 仅允许安全字符集（字母、数字、`-`、`_`），禁止路径分隔符与 `..`，防止路径穿越与非法文件名。

## 非功能需求

- 技术约束：
  - 仅使用 Node.js + TypeScript。
  - 基于本地文件系统实现，不引入数据库。
  - `.apm/config.json` 用于存放可配置项（如字数限制阈值），可通过 `apm config` 调整。
  - 对 `config/status/front matter` 执行严格 schema 校验（如 zod），非法数据直接报错并给出修复提示。
- 可维护性：
  - 命令结构与代码模块保持一一对应，便于后续扩展。
  - 输出文案和格式稳定，避免破坏自动化消费。
  - `status.json` 与 `config.json` 的字段在 V1 开发期固定并在帮助信息/文档中明确语义，不要求跨版本兼容承诺。
- 健壮性：
  - 对缺失文件、参数非法、目标不存在等情况提供清晰错误提示。
  - 读写流程必须避免部分写入导致的数据损坏（采用临时文件替换策略）。
  - `edit --start --end` 在范围越界、空区间、目标不存在、并发写冲突时统一报错，不做自动纠正。
- 可测试性：
  - 核心命令具备 Vitest 测试覆盖。
  - 关键输出格式和文件变更行为可被断言。

## 验收标准

- 命令验收：
  - 文档中列出的全部命令均可执行，参数行为符合定义。
  - 关键输出格式（行号格式、chunks 列表表格、chunks read 详情模板）与需求一致。
  - `.apm` 目录与文件在空目录和已有目录场景均行为正确。
- 自动化验收：
  - 使用 Vitest 提供核心能力测试（至少覆盖 role/persist/tmp/chunks 的关键路径）。
  - 测试可在本地一键运行通过（`npm test`）。
- 业务验收：
  - 在“会话中断后恢复”场景中，`apm read` 可输出足够上下文以恢复任务执行。

## 风险与已确认决策

- 当前任务描述的“500~1000字自动生成”策略：
  - `read` 不做模型自动生成，仅从 role/persist/todos/detail/chunks 汇总渲染当前任务描述。
  - role/persist/tmp detail 的 `write/edit` 写入时默认执行严格字数限制。
  - 字数上下限可配置，并通过 `apm config` 命令修改。
- `todos` 的优先级规则：
  - 采用“数值越小优先级越高”。
  - `name` 为唯一键，`index` 不可重复。
- `chunks list` 的排序字段范围：
  - 固定为 `name`、`createdAt`、`updatedAt`。
- 模糊搜索规则：
  - 搜索行为由固定 flag 区分：`--field`、`--case-sensitive`、`--match`，默认值见功能需求。
- `status.json` 与 `config.json` 的最小字段集：
  - 在 V1 开发期由实现固定，并在实现文档/帮助中说明字段含义。
- 并发与写入安全：
  - 明确提供单机多进程写入保护（文件锁）与原子替换写入。