---
name: apm-usage
description: Provides APM CLI usage for init, read, role/persist/dynamic memory, kb import/search, and read association area. Use when the user mentions apm, external memory, .apm, apm read, knowledge base, or session context recovery.
disable-model-invocation: true
---

# APM 使用指南

## 快速开始

```text
apm init
apm read                    # 会话开始必做
# … 执行任务 …
apm dynamic write --text "…"
apm persist write --text "…"  # 可选：长期结论
```

- 在**项目根目录**（将创建或使用 `.apm/`）执行。
- 入口：`apm` 或 `npx apm`（本仓库需先 `npm run build`）。

## 工作区

```
.apm/
  config.json          # 各段 min/max；initializedAt / updatedAt / lastReadAt
  memory/role.md       # 角色
  memory/persist.md    # 持久记忆
  memory/dynamic.md    # 动态记忆（当前任务）
  kb/docs/             # 知识库 .md（可嵌套）
  kb/dynamic/detail.md
  kb/archive/          # dynamic 覆盖前自动归档
  kb/index/search.json.gz
```

`apm kb write --path` 的路径相对 `kb/docs/`（如 `Iterations/foo/prd.md`）。检索与联想中的路径相对 `kb/`（如 `docs/foo.md`、`archive/dynamic-....md`）。

## `apm read` 输出

无内容的段会省略。顺序：

1. `# 角色`、`# 持久记忆`、`# 动态记忆`（正文已去 YAML front matter）
2. `# 联想区`（用三段记忆正文检索 `kb/`，不含 `index/`）

| 联想区 | 说明 |
|--------|------|
| 详细区 | ≤5 条；`[匹配率%] 路径 关键词：…` + ≤3 行 `行号\|正文`（超 120 字截断）；条间空一行 |
| 简略区 | ≤10 条；仅头部；条间无空行；与详细区间空一行 |
| 无命中 | 不输出联想区 |
| 无索引 | 输出提示执行 `apm kb index rebuild` |

## 命令

### 记忆：`role` | `persist` | `dynamic`

`show` · `write --text <正文>` · `replace --old <原文> --new <新文> [--all]`

```bash
apm role show
apm role write --text "…"
apm role replace --old "旧" --new "新"
apm persist write --text "…"
apm dynamic write --text "…"
apm dynamic replace --old "…" --new "…"
```

- `replace`：`--old` 须与 `show`/`read` 正文**原样**匹配；默认只换第一次，全换加 `--all`。
- 全量覆盖用 `write`；长度受 `apm config` 约束。
- 写入时不要手写 YAML front matter。
- `--text` / `--old` / `--new` 支持转义：`\n` `\t` `\r` `\\`；字面量 `\n` 写 `\\n`（`kb write` 的 `--text` 同理）。

### `dynamic` 与归档

| 命令 | 行为 |
|------|------|
| `dynamic write --text "…"` | 当前正文非空时先写入 `kb/archive/dynamic-<时间戳>.md`，再覆盖 `memory/dynamic.md` |
| `dynamic write --text ""` | 清空 dynamic（非空则先归档） |
| `dynamic replace` | 只改正文，不归档 |

### 知识库

```bash
apm kb import --from <目录>
apm kb write --path <path.md> --text "…"
apm kb search --q "<查询>"
apm kb index rebuild
apm kb dynamic show|write|replace
```

| 操作 | 自动 `kb index rebuild` |
|------|-------------------------|
| `role` / `persist` / `dynamic` 的 write、replace | 是 |
| `dynamic write` | 是 |
| `kb import` | 是 |
| `kb write`、`kb dynamic` 的 write/replace | 否 |

### 配置

```bash
apm config show
apm config set --section role|persist|dynamicDetail|kbDynamicDetail --min <n> --max <n>
```

## 典型场景

**恢复会话：** `apm read` → 读动态记忆与联想区 → 继续任务。

**切换任务：**

```bash
apm dynamic write --text "任务：…\n下一步：…"
```

**写入知识库单文件：**

```bash
apm kb write --path Iterations/<名>/prd.md --text "…"
apm kb index rebuild
apm read
```

**批量导入：** `apm kb import --from docs`（导入后自动 rebuild）。

## 勿混淆的路径

| 路径 | 用途 |
|------|------|
| `.apm/memory/` | CLI 外置记忆，`apm read` 使用 |
| 仓库内其他 `memory/` | 不参与 `apm read`，不要当作 `.apm` 使用 |

## 故障排查

| 现象 | 处理 |
|------|------|
| `Incomplete .apm workspace` | `apm init` |
| `Knowledge index missing` | `apm kb index rebuild` |
| 联想区无结果 | 记忆与 kb 有共同词；`rebuild` |
| `kb write` 后搜不到 | `apm kb index rebuild` |
| 长度报错 | `apm config set` 调大 `max` 或缩短正文 |
| `\n` 未换行 | 使用 `\n` 转义序列，或传真实换行 |
