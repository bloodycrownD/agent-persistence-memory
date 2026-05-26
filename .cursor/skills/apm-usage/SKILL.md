---
name: apm-usage
description: 指导 Agent 与开发者使用本仓库 APM CLI（init、read、role/persist/dynamic、kb 导入/索引/联想区）。在用户提到 apm、外置记忆、.apm、apm read、知识库、会话恢复或 Agent 初始化上下文时使用。
disable-model-invocation: true
---

# APM 使用指南

## 何时使用

- Agent **会话开始**：用 `apm read` 拉取角色、持久记忆、动态记忆与知识库联想。
- **任务进行中**：用 `apm dynamic write/replace` 更新当前进度；重要结论写入 `apm persist`。
- **沉淀文档**：将 Markdown 导入知识库并重建索引。
- **改 APM 源码**：遵守下文开发约束，并跑 `npm test`。

## 前置条件

- 在**项目根目录**（含或将创建 `.apm/` 的目录）执行命令。
- 本地需已 `npm run build`；开发调试可用 `npx tsx src/index.ts <子命令>`。
- 二进制入口：`apm` 或 `npx apm`（`package.json` 的 `bin`）。

## 工作区布局（v2）

```
.apm/
  config.json
  status.json
  memory/
    role.md          # 角色
    persist.md       # 持久记忆
    dynamic.md       # 动态记忆（当前任务）
  kb/
    docs/            # 知识库 Markdown 树
    dynamic/detail.md
    archive/         # dynamic 归档副本
    index/
      search.json.gz # 检索索引（gzip + MiniSearch JSON）
```

- **禁止**依赖旧布局（`.apm/role.md`、`.apm/persistence/`、`.apm/dynamic/`）；检测到旧树会报错并提示 `apm init`。
- 路径一律通过代码里的 `apmPaths()` 解析，**不要**硬编码 `.apm` 内部结构。

## Agent 标准流程

```text
1. apm init                    # 首次或空目录（幂等）
2. apm read                    # 初始化上下文（必做）
3. … 执行任务 …
4. apm dynamic write --text …  # 更新进度/下一步
5. （可选）apm persist write   # 写入长期规则/结论
6. （可选）kb 导入 + 索引重建  # 见下文
```

### `apm read` 输出结构

按顺序输出（**无内容的区块会省略**）：

1. `# 角色` — `memory/role.md` 正文（已去 YAML front matter）
2. `# 持久记忆` — `memory/persist.md`
3. `# 动态记忆` — `memory/dynamic.md`
4. `# 联想区` — 基于 **role + persist + dynamic** 合并正文检索 `kb/`（**不含** `kb/index/`）

**联想区规则（摘要）：**

| 项 | 说明 |
|----|------|
| 详细区 | 最多 **5** 条：首行 `[匹配率%] kb相对路径 关键词：kw1 …(≤4)` + 最多 **3** 行 `行号\|正文`（超长截断为 120 字符 + `...`）；条间空一行 |
| 简略区 | 最多 **10** 条：仅首行（同头部格式），条间无空行；与详细区之间空一行 |
| 匹配率 | 当次 Top 结果内 BM25+ 分数归一化为 0–100 整数 |
| 无命中 | **不输出** `# 联想区` |
| 无索引 | 仍输出 `# 联想区` + 提示执行 `apm kb index rebuild` |

路径示例：`docs/Iterations/foo/spec.md`、`archive/dynamic-20260516-120000.md`。

## 常用命令

### 初始化与读取

```bash
apm init
apm read
```

### 记忆三段（结构相同）

子命令：`show` | `write --text <正文>` | `replace --old <原文> --new <新文> [--all]`

```bash
apm role show
apm role write --text "…"
apm role replace --old "旧片段" --new "新片段"
apm persist write --text "…"
apm dynamic write --text "…"
apm dynamic replace --old "下一步：…" --new "下一步：…"
```

- 局部修改：从 `show` / `read` 复制精确子串作为 `--old`；默认只替换**第一次**出现，多处同文加 `--all`。
- 全量覆盖仍用 `write`。

- 正文长度受 `apm config` 中各 section 的 `min`/`max` 约束。
- Section 文件带 YAML front matter（`createdAt` / `updatedAt`），**不要**在 `read` 输出里手写 front matter。

### 动态记忆归档

```bash
apm dynamic archive   # 将 memory/dynamic.md 全文复制到 kb/archive/（带时间戳文件名）
apm dynamic clear     # 清空 dynamic 正文模板；不删除 archive 已有文件
```

### 知识库

```bash
apm kb import --from <目录>    # 复制目录下全部 .md 到 kb/docs/，并自动 rebuild 索引
apm kb write --path <相对路径> --text "<内容>"   # 写入 kb/docs/（路径须 .md，且在 docs 下）
apm kb search --q "<查询>"     # BM25+ 检索，默认 Top 5
apm kb index rebuild           # 扫描 kb/ 下除 index/ 外全部 .md 并写 search.json.gz
apm kb dynamic show|write|replace # 对应 kb/dynamic/detail.md
```

**索引注意：**

- 升级或合并联想区功能后，若搜索/联想异常，先执行 **`apm kb index rebuild`**（索引内路径相对 `kb/`，如 `docs/foo.md`）。
- `kb write` / `dynamic archive` **不会**自动重建索引；大批量变更后应手动 `rebuild`。

### 配置

```bash
apm config show
apm config set --section role|persist|dynamicDetail|kbDynamicDetail --min <n> --max <n>
```

## 典型场景

### 将 docs 导入知识库做联调

```bash
npm run build
apm kb import --from docs
apm read
```

### 会话恢复（Agent）

1. `apm read` 获取角色 + 规则 + 当前任务 + 相关文档联想。
2. 根据「动态记忆」的「下一步」继续执行。
3. 阶段结束更新 `apm dynamic write`；稳定知识写入 `apm persist`。

### 测试/CI 前

```bash
npm run build
npm test
```

联想区用例见 `tests/cli.spec.ts` 中 `T-READ-ASSOC-*`。

## 修改 APM 代码时的约束

1. **路径**：只用 `apmPaths()` / `resolveKbDocPath` / `resolveKbIndexedPath`。
2. **写入**：`atomicWrite` + `withGlobalLock` + `serialWrite`。
3. **检索**：索引与联想共用 `kb-index-service`（`kbTokenize`、MiniSearch）；联想关键词展示走 `kb-stopwords`（与索引分词分离）。
4. **测试**：改动 CLI 行为必须更新 `tests/cli.spec.ts`。
5. **迭代文档**：新功能 PRD/SPEC 放在 `docs/Iterations/<名称>/`。

## 与 `memory/` 目录的区别

| 位置 | 用途 |
|------|------|
| `.apm/memory/*.md` | **运行时**外置记忆，由 `apm` CLI 读写 |
| `memory/persistence/`、`memory/tmp/` | **仓库内**人工归档记录（见 `memory-records` skill），**不**参与 `apm read` 联想索引 |

二者不要混用路径。

## 故障排查

| 现象 | 处理 |
|------|------|
| `Old .apm layout detected` | 备份后删除旧树，`apm init` |
| `Incomplete .apm workspace` | `apm init` |
| `Knowledge index missing` | `apm kb index rebuild` |
| 联想区无结果 | 确认记忆正文与 kb 文档有共同检索词；执行 rebuild |
| section 长度报错 | `apm config set` 调大 `max` 或缩短正文 |

## 延伸阅读

- 联想区 PRD：`docs/Iterations/apm-read-association-area/prd.md`
- 联想区 SPEC：`docs/Iterations/apm-read-association-area/spec.md`
- kb 布局迭代：`docs/Iterations/apm-kb-memory-layout-init/spec.md`
