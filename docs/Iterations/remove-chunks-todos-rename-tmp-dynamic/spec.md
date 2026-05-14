# 移除 chunks / todos 并将 tmp 更名为 dynamic 需求说明

## 背景

当前 APM CLI 提供 `chunks` 子命令族（检索、增删改 chunk 文件）、`tmp` 子命令族（含 `tmp todos` 与 `tmp detail` 等），并在 `.apm` 下使用 `chunks/`、`tmp/todos/`、`tmp/detail.md` 等路径落盘。配置与领域模型中还包含与 **临时明细** 相关的 `tmpDetail` 等命名。

你希望 **彻底下线 chunks 与 todos 两类能力**，并将原「临时工作区」概念从 **`tmp` 统一更名为 `dynamic`**（含磁盘布局与代码标识），以降低概念重复、收窄产品表面，同时与后续只保留「动态明细」类能力对齐。

## 破坏性原则（强制）

本迭代按 **完全破坏性升级** 交付：**不提供**旧 CLI、旧磁盘路径、旧 `config.json` 键名的任何兼容层——包括但不限于双读旧键、启动时目录搬迁、迁移子命令、静默回退或「读旧写新」。旧工作区须由使用方自行处理；实现与测试 **只验证新布局与新配置形态**。

## 目标

1. **功能层面**：仓库内不再提供 chunks 与 todos 的 CLI、service、schema 及测试用例；`read` 等其它命令不得再依赖或输出已删除的数据结构（若仍有占位实现，须去掉对已删能力的引用或选项）。
2. **存储与布局**：`.apm` 下 **不再创建或使用** `chunks/`、`tmp/`（含 `tmp/todos/`）；明细落盘仅 **`dynamic/detail.md`**（及 `ensureApm` 所需的 `dynamic/` 目录）。
3. **命名一致性**：CLI 顶层子命令、源文件名、函数名、配置键、类型字面量、文档与脚本中，凡表示「临时工作区 / tmp」且与本次能力对应的标识，**统一改为 `dynamic`**（含 `tmpDetail` → **`dynamicDetail`**，全文一致）。

## 范围

### 包含范围

- **Chunks**
  - 删除 `apm chunks` 及其实现（如 `src/cli/commands/chunks.ts`）、`chunks-service`、chunk 相关 schema / 校验与专用测试。
  - `ensureApm` 不再创建 `chunks` 目录；**不再**读写 `.apm/chunks/*`。
- **Todos**
  - 删除 todos 子命令及 `todos-service`、todo schema、与 todo 相关的 doc-limits / 错误文案与测试。
- **tmp → dynamic**
  - 磁盘：仅 **`.apm/dynamic/detail.md`**（及父目录）；**不**创建 `dynamic/todos/`。
  - CLI：`apm tmp ...` → **`apm dynamic ...`**；实现文件 `tmp.ts` → `dynamic.ts`，注册函数与内部变量一致改名。
  - 配置与类型：`limits.tmpDetail` / `Section` 中的 `tmpDetail` / `CONFIG_SHAPE_HINT` 等 → **`dynamicDetail`**。
  - 其它：`sections-service` 等将「tmp detail」展示文案改为 **「dynamic detail」**；`scripts/import-memory-to-apm.ts`、项目内 `.cursor/skills` 若引用 `chunks` / `tmp todos` / `tmp detail`，改为新命名或删除过时指引。
- **发布说明**：在 PR / release note 中单句声明 **破坏性大版本**（旧路径与旧配置键失效），**不写**官方迁移步骤（与「零兼容」一致）。

### 不包含范围

- **`docs/archive/**`**：历史归档文档不要求逐篇改写（默认不纳入本迭代工作量）。
- **仓库外 `memory/` 示例树**：若与脚本或测试硬编码路径冲突，则做最小修补以通过构建与测试。
- **任何形式的兼容或迁移实现**：不实现自动搬迁、不实现双键读取、不提供 `apm migrate` 类命令。

## 功能需求

1. 执行 `apm --help` 时 **不得**再出现 `chunks` 子命令；**不得**再出现 `tmp` 子命令；应出现 **`dynamic`** 子命令（仅保留与「动态明细」相关的子能力，与当前 `tmp` 中非 todos 部分对齐）。
2. 任何代码路径 **不得**再调用已删除的 chunks / todos service；**不得**读取 `.apm/tmp`、`.apm/chunks` 或旧配置键 `tmpDetail`。
3. `ensureApm`（或等价初始化）仅创建 **新布局** 所需目录与默认文件；新仓库初始化后不存在 `chunks`、`tmp` 相关目录创建逻辑。
4. 配置校验：`config.json` 与 `ConfigSchema` **仅**接受 **`dynamicDetail`**；旧键或缺键按现有校验策略失败（与项目其它 config 错误行为一致）。
5. 全量测试套件更新：删除与 chunks、todos 相关的用例；**所有**仍需要的 CLI 集成测试改用 `dynamic` 路径与子命令；`npm run build` 与测试均可通过。

## 非功能需求

- **可维护性**：删除模块后无残留 dead import、无指向已删文件的 `grep` 命中（除归档与刻意保留的变更说明）。
- **文档**：本迭代 `spec.md` 保留为需求真源；README 或用户面向文档若仍描述 `chunks`/`tmp todos`，须同步为 `dynamic` 且不再承诺两项已删能力（以实际改动的用户文档为准，不额外新建无关 markdown 文件）。

## 验收标准

1. `npm run build` 成功，无 TypeScript 错误。
2. `npm test`（或项目约定的测试命令）全部通过。
3. 新临时目录下执行 `apm` 初始化后，文件系统存在 **`.apm/dynamic/detail.md`**，不存在 `.apm/chunks`、`.apm/tmp` 的创建逻辑。
4. 帮助与实现一致：**无** `chunks`、`tmp`、`todos` 子命令；存在 **`dynamic`** 及与明细相关的子命令行为与改名前「非 todos」部分等价（除路径与命名外）。
5. 代码库中不存在为旧路径或旧 config 键分支的逻辑（审查 grep：`tmpDetail`、`\.apm/tmp`、`chunksDir` 等应仅出现在文档说明「已删除」或归档路径，不应出现在运行时代码的兼容分支）。

## 风险与已知后果（非待确认）

| 项 | 说明 |
|----|------|
| **K1** | 已有 `.apm/tmp`、`chunks`、旧 `config.json` 的用户升级后 **需自行重建或改写**；本仓库实现 **不** 读取或保留上述旧形态。 |
| **K2** | `tmpDetail` 配置键 **即刻失效**；未更新 `config.json` 的仓库将按 schema/校验报错，属预期。 |
| **K3** | 占位 `read` 若仍带 chunk 相关 flag，须删除，避免歧义。 |
| **K4** | `doc-limits` / 错误常量：仅 chunk/todo 专用的随删；仍被 `persist`/`role`/`dynamicDetail` 使用的保留并删减 chunk/todo 部分。 |
| **K5** | `scripts/import-memory-to-apm.ts` 等生成文案须与新产品面对齐，不得再推荐 `chunks` / `tmp todos`。 |

---

**文档路径：** `docs/Iterations/remove-chunks-todos-rename-tmp-dynamic/spec.md`

本 spec **已冻结**；破坏性策略为 **零兼容**，实现阶段不得引入旧键/旧路径的读取或静默迁移。
