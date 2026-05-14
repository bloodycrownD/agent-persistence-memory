# 知识库（kb）与 .apm 目录重组 技术规格（SPEC）

依据 PRD：`docs/Iterations/apm-kb-memory-layout-init/prd.md`。本文档基于**当前仓库实现**整理约束与改动面，并给出可执行实现步骤与测试策略。

## 设计目标

- 落地 PRD 中的 **`.apm/kb/**` 与 **`.apm/memory/**` 布局、`apm init`、`apm kb`（写/导入/搜）、**gzip+json 索引**、**`dynamic` 扁平化对齐 `persist`** 及 **`archive` / `clear`**。
- **零旧布局兼容**（与 PRD 一致）：不再读写 `.apm/role.md`、`.apm/persistence/`、`.apm/dynamic/`；检测到旧树时 **显式失败** 并提示用户备份后 `apm init` 或使用新目录。
- 保持现有能力：**配置校验**（Zod）、**section 前 YAML + 正文长度限制**、**全局写锁 + atomicWrite** 模式；在新路径上复用而非重写一套存储语义。

## 现状约束（代码事实）

| 区域 | 当前实现 | 影响 |
|------|-----------|------|
| 路径中枢 | `apmPaths()`：`role`→`.apm/role.md`，`persist`→`.apm/persistence/memory.md`，`detail`→`.apm/dynamic/detail.md`（`src/storage/paths.ts`） | 全部需改为 `memory/` 下路径；`ensureApm` 的 `mkdirSync` 与默认文件创建同步调整。 |
| Section 模型 | `Section = "role" \| "persist" \| "dynamicDetail"`；`sectionPath` 分支映射上述三文件（`src/services/sections-service.ts`） | 增加 **`kbDynamicDetail`**（及对应 `limits.kbDynamicDetail`）以支撑 `kb/dynamic`；路径映射集中改一处。 |
| persist / role CLI | `registerSectionCommands(cmd, section)` 直接挂在 `persist`、`role` 根上（`src/cli/commands/persist.ts`、`role.ts`） | `dynamic` 应去掉 `detail` 子命令层级，改为与 `persist` 相同的 **show / write / edit** 根级子命令。 |
| dynamic CLI | `dynamic.detail.*` + `dynamic.show`（`src/cli/commands/dynamic.ts`） | 改为 `dynamic show|write|edit` + `archive|clear`；测试与文档中所有 `dynamic detail` 调用需替换。 |
| config CLI | `--section` 白名单 `role|persist|dynamicDetail`（`src/cli/commands/config.ts`） | 增加 `kbDynamicDetail`（若 kb dynamic 走同一套 limits）。 |
| 依赖 | `commander`、`zod`、`js-yaml`；无全文检索库（`package.json`） | 需新增 **npm 全文检索依赖**（见下文选型）及 Node **zlib**（内置）写 gzip。 |
| 测试 | `tests/cli.spec.ts` 断言 `.apm/dynamic/detail.md`、 `dynamic detail write` 等 | 全部改为新路径与新 CLI 形态。 |

## 总体方案

### 1. 目录与「主文件」约定（实现拍板，满足 PRD 树形）

均在 `.apm` 根下：

```
.apm/
  config.json
  status.json
  .write.lock
  kb/
    docs/                 # 用户 Markdown 树，保留相对路径，不打平
    dynamic/
      detail.md           # kb 侧过程笔记；走 Section「kbDynamicDetail」+ 独立 limits
    index/
      search.json.gz      # 仅索引产物；与 docs 源分离
  memory/
    role.md               # 原 .apm/role.md
    persist.md            # 原 .apm/persistence/memory.md
    dynamic.md            # 原 .apm/dynamic/detail.md
    archive/              # 仅 dynamic 归档；时间戳文件名
```

> 与 PRD 文案「`memory/persist` 子树」的差异：实现采用 **`memory/persist.md` 单文件**（你已确认），便于与 `role.md` / `dynamic.md` 对称；若未来要多文件 persist，再迭代子目录。

- **`memory/archive/`**：在 **`apm init`** 时预创建（满足 PRD「init 即存在」的验收路径）；`dynamic archive` 向其中写入**新文件**，文件名含本地时间戳（如 `dynamic-YYYY-MM-DD-HHmmss.md`），内容与归档前 **`memory/dynamic.md` 全文（含 front matter）**一致。
- **`dynamic clear`**：将 **`memory/dynamic.md`** 重置为与 `ensureWorkspace` 相同的「空 section 模板」（`renderFrontMatter` + 空正文）；**不**遍历或删除 `memory/archive/`。
- **旧布局检测**：若存在 `.apm/persistence` 或 `.apm` 下顶层 `role.md`（旧路径）且不存在 `memory/role.md`（或约定哨兵文件 `.apm/.layout-v2`），则 `readConfig` / `ensureWorkspace` / 各命令统一抛错提示重新 `init`——避免半迁移状态。

### 2. CLI 形态

| 命令 | 行为 |
|------|------|
| **`apm init`** | 创建完整树 + `config`/`status`/空 section 文件 + `kb/docs` 占位（可选 `.gitkeep` 或空 `README`）+ `kb/index/` + `memory/archive/`；幂等：已 v2 布局则跳过或仅补缺失目录。 |
| **`apm persist` / `apm role`** | 行为不变；底层路径改为 `memory/...`。 |
| **`apm dynamic`** | `show` \| `write` \| `edit` 与 `persist` 一致（参数与 `section.ts` 相同）；新增 **`archive`**、**`clear`**（无额外必填参数或仅 `--force` 由实现决定）。 |
| **`apm kb`** | 子命令建议：`search`（`--q`）、`import`（`--from <dir>`，仅 `.md`）、`write`（写入 `kb/docs` 下相对路径）、`index rebuild`（重建 `search.json.gz`）；`kb dynamic`：`show`/`write`/`edit` 绑定 `kbDynamicDetail`（与 `dynamic` 对称，路径 `kb/dynamic/detail.md`）。 |

### 3. 索引与检索

- **依赖选型（实现阶段锁定其一）**：优先 **MiniSearch**（支持 `toJSON`/`fromJSON`，生态成熟）；若 CJK 分词不满足验收，再在实现中替换 tokenizer（如 `Intl.Segmenter('zh', { granularity: 'word' })` 与回退策略）而不改 CLI 契约。
- **文档单元**：每个 `kb/docs/**/*.md` 文件为一个 docId（相对 `kb/docs` 的 posix 路径）；正文可 strip front matter（若无则全文）；标题优先取首个 `#` 行。
- **持久化**：`writeFileSync` + `zlib.gzipSync(JSON.stringify(payload))` 写入 `kb/index/search.json.gz`；加载时 gunzip + `JSON.parse` + MiniSearch `fromJSON`。
- **`kb import`**：将源目录下目录结构 **复制** 到 `kb/docs/` 下（保持相对路径）；完成后 **自动或显式** 触发索引更新（PRD要求可测：至少 `index rebuild` 或 import 末尾 rebuild）。

## 最终项目结构（源码侧）

```
src/
  storage/
    paths.ts                 # 大幅调整：v2 路径 + 旧布局检测辅助
  cli/
    register.ts              # registerInit, registerKb
    commands/
      init.ts                # 新增
      kb.ts                  # 新增（或 kb/ 多文件）
      dynamic.ts             # 扁平化 + archive/clear
      role.ts | persist.ts   # 通常仅 import paths 间接影响
      config.ts              # section 白名单 + 文案
  services/
    sections-service.ts      # sectionPath + enforceLimits + labels
    kb-index-service.ts      # 新增：scan, build, load, search
    kb-import-service.ts     # 新增：copy tree
    dynamic-archive-service.ts # 新增：archive + clear 封装（或并入 sections-service）
  schemas/
    config.ts                # kbDynamicDetail limits
tests/
  cli.spec.ts                # 路径与命令全量更新
  kb.spec.ts                 # 新增：导入+搜索+gzip magic（可选与 cli 合并）
```

## 变更点清单

| 路径 | 变更类型 | 说明 |
|------|----------|------|
| `src/storage/paths.ts` | 修改 | v2 路径；`ensureApm` → 建议重命名为 `ensureWorkspace` 并含 init 所需目录；旧布局拒绝逻辑 |
| `src/services/sections-service.ts` | 修改 | `sectionPath` / `enforceLimits` / `sectionLabel` 支持 `kbDynamicDetail` |
| `src/schemas/config.ts` | 修改 | `DEFAULT_CONFIG`、`ConfigSchema`、`Section`、`CONFIG_SHAPE_HINT` 增加 `kbDynamicDetail` |
| `src/cli/commands/config.ts` | 修改 | `set` 的 section 白名单与帮助文案 |
| `src/cli/commands/dynamic.ts` | 修改 | 扁平子命令 + `archive`/`clear` |
| `src/cli/commands/kb.ts`（等） | 新增 | `kb` 子树 |
| `src/cli/commands/init.ts` | 新增 | `init` |
| `src/cli/register.ts` | 修改 | 注册 `init`、`kb` |
| `src/services/kb-index-service.ts` 等 | 新增 | 索引与搜索 |
| `package.json` | 修改 | 增加 `minisearch`（或评审替换为 flexsearch） |
| `tests/cli.spec.ts` | 修改 | 全部新路径；增加 `init`、`archive`/`clear`、`kb` 烟测 |
| `scripts/import-memory-to-apm.ts` | 视情况 | 若仍引用旧 `apmPaths` 字段，需同步改为 v2 路径或标注废弃 |

## 兼容性或迁移说明

- **不兼容、不自动迁移**（PRD）。实现：**检测旧布局即抛错**；用户在新目录执行 `apm init` 得 v2。
- **发布说明**：CHANGELOG 或 PR 描述中一句破坏性说明即可。

## 详细实现步骤

1. **路径与检测**：实现 `apmPaths` v2 全字段；实现 `assertLayoutV2(cwd)`（或内嵌于 `ensureWorkspace`）；删除对 `persistence`、`dynamic`（旧）、根 `role.md` 的写入。
2. **sections-service**：扩展 `Section` 与 `sectionPath`：`role`→`memory/role.md`，`persist`→`memory/persist.md`，`dynamicDetail`→`memory/dynamic.md`；`kbDynamicDetail` → `kb/dynamic/detail.md`。
3. **config schema + config CLI**：默认值与 `config set` 白名单一致。
4. **`apm init`**：创建 PRD 目录树 + 空 **`memory/role.md`**、**`memory/persist.md`**、**`memory/dynamic.md`**、`kb/dynamic/detail.md` + `memory/archive/` + `kb/index/` + 既有 `config.json`/`status.json`。
5. **替换 `ensureApm` 调用点**：全局 grep `ensureApm`，改为 `ensureWorkspace`（行为：非 init 场景下若 `.apm` 不存在可报错提示先 `init`，或懒创建——**推荐与现行为一致：懒创建仅 v2**，与 PRD「空目录 init」并存）。
6. **`dynamic` CLI 重构**：删除 `detail` 子命令；`registerSectionCommands(dynamic, "dynamicDetail")` 改为在 `dynamic` 上直接注册 `show/write/edit`；新增 `archive`、`clear` 调用 archive 服务。
7. **`kb` 实现**：import（fs cp）、write、search、index rebuild；`kb dynamic` 三子命令复用 `registerSectionCommands` 绑定 `kbDynamicDetail`。
8. **索引服务**：glob `kb/docs/**/*.md`、分词、构建 MiniSearch、写 gzip json；search 读索引，缺失时提示 `kb index rebuild`。
9. **测试与文档**：更新 `cli.spec`；可选 `kb.spec`；`.cursor/skills/apm-memory-first` 若仍写旧路径则同步。

## 测试策略

### 测试用例

| ID | 场景 | 步骤与断言 |
|----|------|------------|
| T1 | init 结构 | 空目录 `apm init` → `existsSync(.apm/memory/role.md)`、`.../persist.md`、`.../dynamic.md`、`.../archive`、`.../kb/docs`、`.../kb/dynamic/detail.md`、`.../kb/index`；`search.json.gz` 可无直至首次 index |
| T2 | 旧布局拒绝 | 构造仅含 `.apm/persistence` 的旧树 → 任一需 workspace 的命令应抛错且文案含引导 |
| T3 | dynamic 扁平 | `dynamic write` / `show` / `edit` 与现 `persist` 用法一致；**无** `dynamic detail` |
| T4 | archive | 写入 dynamic 正文后 `dynamic archive` → `memory/archive` 下新增匹配时间戳模式的文件；原文备份一致 |
| T5 | clear | archive 后执行 `dynamic clear` → **`memory/dynamic.md`** 为空模板；`readdir(archive)` 数量不变 |
| T6 | kb 闭环 | `kb/docs` 下放两篇含不同关键词的 md → `kb import` 或 `kb write` → `kb index rebuild` → `kb search --q <kw>` → top 结果命中路径 |
| T7 | gzip 索引 | 重建后读文件头 magic 为 gzip；删除 `search.json.gz` 后 search 失败或提示 rebuild |
| T8 | regression | `role`/`persist`/`config`/`read` 占位现有用例在新路径下仍通过 |

## 风险与回滚方案

| 风险 | 缓解 |
|------|------|
| MiniSearch 中文召回不足 | 实现阶段用 `Intl.Segmenter` + 字二元组回退；验收以 PRD「Top5 命中一条」为准调参 |
| `ensureWorkspace` 与 `init` 语义重叠 | SPEC 固定：`init` 全量；其它命令只校验 v2 并补写**单个**缺失文件需慎重——**推荐**缺目录则报错「请 apm init」以免造半树 |
| 改动面大导致漏改路径 | 全局 grep `persistence`、`dynamic/detail`（旧）、`role.md`（根） |

**回滚**：单分支 `git revert`；无线上 DB。

---

**文档路径：** `docs/Iterations/apm-kb-memory-layout-init/spec.md`

请确认本 SPEC；确认后再进入编码实现。`memory` 下 **persist / dynamic 已与 PRD 子目录方案改为同级单文件**：`persist.md`、`dynamic.md`（与 `role.md`、`archive/` 并列）。
