# apm-cli-memory-v1 设计方案

## 设计目标

- 在当前 `agent-persistence-memory` CLI 基础上实现 `apm` 命令族，覆盖 `read/role/persist/tmp/chunks/config` 的完整能力。
- 以当前命令执行目录下 `.apm` 作为唯一存储根目录，支持首次自动初始化，保证本地可审计和可迁移。
- 提供稳定的人类可读输出和 `--json` 机器可解析输出，满足人工协作与 Agent 自动消费。
- 通过 schema 校验、文件锁、原子替换写入保证数据正确性与写入安全。

## 总体方案

- 命令层：基于 `commander` 按命令域拆分子命令注册，`src/index.ts` 仅保留入口和装配。
- 应用层：按功能拆分 service（`role/persist/tmp/chunks/read/config`），每个 service 只处理业务规则和组合逻辑。
- 存储层：统一文件访问 API（初始化、读取、校验、写入、锁、原子替换）。
- 领域模型层：统一定义 front matter、config、status、todo、chunk 的 zod schema 和类型。
- 展示层：统一文本渲染器与 JSON 序列化器，确保输出格式稳定并可测试。

## 最终项目结构

```text
src/
  index.ts
  cli/
    register.ts
    commands/
      read.ts
      role.ts
      persist.ts
      tmp.ts
      chunks.ts
      config.ts
  core/
    errors.ts
    time.ts
    constants.ts
    name-sanitize.ts
  storage/
    apm-root.ts
    fs-atomic.ts
    fs-lock.ts
    files.ts
    markdown.ts
  schemas/
    config.ts
    status.ts
    role.ts
    persist.ts
    todo.ts
    chunk.ts
  services/
    read-service.ts
    role-service.ts
    persist-service.ts
    tmp-service.ts
    chunks-service.ts
    config-service.ts
  formatters/
    line-number.ts
    table.ts
    read-template.ts
tests/
  cli/
    read.test.ts
    role.test.ts
    persist.test.ts
    tmp.test.ts
    chunks.test.ts
    config.test.ts
  integration/
    apm-init.test.ts
    lock-and-atomic.test.ts
```

## 变更点清单

- 入口改造
  - `src/index.ts`：从单体命令重构为命令注册入口，程序名切换为 `apm`（可保留旧名别名兼容）。

- CLI 命令新增
  - `apm read [--json]`
  - `apm role show|write|edit`
  - `apm persist show|write|edit`
  - `apm tmp show`
  - `apm tmp todos show|add|rm|edit|clear|list|complete|priority`
  - `apm tmp detail show|write|edit`
  - `apm chunks list|add|rm|edit|search|read`
  - `apm config`（读写字数阈值、其他可配置项）

- 数据模型与约束
  - `name` 安全字符约束：仅字母、数字、`-`、`_`，禁止 `..` 和路径分隔符。
  - `todos`：`name` 唯一、`index` 不可重复、`description` 必填、`name+description <= 100`。
  - `chunks`：`name` 唯一，重名写入报错。
  - 分区字数阈值默认：
    - role: 50~100
    - persist: 300~500
    - tmp detail: 500~1000

- 存储结构
  - 统一在 `<cwd>/.apm` 下读写：
    - `config.json`
    - `status.json`
    - `persistence/memory.md`
    - `tmp/detail.md`
    - `tmp/todos/*.md`
    - `chunks/*.md`

- 写入安全
  - 进程内串行（同路径队列）
  - 文件锁（同机多进程冲突保护）
  - 临时文件 + rename 原子替换

- 输出格式
  - `show` 系列采用 `行号|内容`。
  - `chunks list` 对齐表格，支持 `--size --page --order --sort`。
  - `read` 默认文本模板；`--json` 输出结构化对象。

## 兼容性或迁移说明

- 本次为 V1 内部重构，不承诺跨版本数据兼容；但同一版本内字段语义固定。
- 现有仓库中的旧存储（用户目录下 `~/.agent-persistence-memory/memory.json`）不再作为主路径。
- 迁移策略：
  - 默认不自动迁移旧数据，避免误改用户历史数据。
  - 提供可选迁移脚本（后续可加）将旧键值对导出到 `.apm/chunks` 或 `persistence/memory.md`。

## 详细实现步骤

1. 脚手架重构
   - 拆分 `src/index.ts`，建立 `cli/services/storage/schemas/formatters` 目录骨架。
   - 保持可编译、可运行的最小空命令集。

2. 存储与 schema 基座
   - 实现 `.apm` 初始化逻辑和默认文件创建。
   - 实现 `config/status/front matter` 的 zod schema。
   - 实现统一读取/写入 API（含锁和原子写）。

3. 基础命令实现（role/persist/tmp detail）
   - 实现 `show/write/edit`。
   - 接入行号输出与 `edit --start --end` 严格报错行为。
   - 接入分区字数限制校验。

4. tmp todos 实现
   - 完成 `add/rm/edit/clear/list/complete/priority/show`。
   - 实现唯一性约束、长度约束、排序输出和状态展示。

5. chunks 实现
   - 完成 `add/rm/edit/list/search/read`。
   - 实现分页、排序、搜索 flag（`--field --case-sensitive --match`）和批量读取。

6. read/config 实现
   - `apm read` 组装文本模板输出与 `--json`。
   - `apm config` 支持读写字数阈值等配置并落盘。

7. 错误模型与帮助信息
   - 统一错误码/错误文案，补齐每个命令的参数帮助和示例。

8. 测试与验收
   - 完成单元 + 集成测试，执行 `npm test` 通过。
   - 按 spec 验收清单逐条走查。

## 测试策略

- 单元测试
  - schema 校验：合法/非法 front matter、config/status 字段缺失。
  - 纯函数：行号渲染、表格渲染、搜索匹配逻辑、名字合法性校验。

- CLI 行为测试（Vitest + 临时目录）
  - 每个命令至少覆盖：正常路径、参数缺失、目标不存在、边界值错误。
  - `edit --start --end` 覆盖越界、空区间、逆序区间。

- 集成测试
  - 空目录首次执行自动初始化 `.apm`。
  - 同机并发写入冲突测试（锁行为可观测）。
  - 写入中断场景验证无半写文件（原子替换有效）。

### 测试用例

- `apm read`
  - 无 `--json` 返回完整模板文本。
  - 带 `--json` 返回稳定可解析 JSON 结构。

- `apm role/persist/tmp detail`
  - `show` 输出 `行号|内容`。
  - `write/edit` 在字数不满足阈值时报错。
  - `edit` 越界和空区间时报错。

- `apm tmp todos`
  - `add` 成功创建，`name` 重复报错，`index` 重复报错。
  - `description` 缺失或超长时报错。
  - `complete/priority` 对不存在 index 报错。

- `apm chunks`
  - `add/edit` 重名检测。
  - `list` 分页/排序参数生效，表格列对齐稳定。
  - `search` 在不同 `field/match/case-sensitive` 组合下结果正确。
  - `read` 批量读取按请求顺序返回，缺失项给出错误提示。

- 文件与安全
  - 非法 `name`（含路径分隔符、`..`）报错。
  - 锁冲突时返回明确错误，不破坏已有数据。

## 风险与回滚方案

- 风险：单文件重构为模块后可能出现行为漂移。
  - 缓解：先建立回归测试，再逐步迁移命令。

- 风险：文件锁在不同平台行为差异（尤其 Windows）。
  - 缓解：封装锁实现并加入平台相关集成测试。

- 风险：Markdown front matter 解析异常导致读写失败。
  - 缓解：严格 schema 校验 + 明确修复指引（哪一文件、哪一字段非法）。

- 回滚策略
  - 采用小步提交，按模块上线；出现问题可回滚到上一个可运行提交。
  - 关键写入逻辑保留备份临时文件，失败后自动回退到旧文件版本。
