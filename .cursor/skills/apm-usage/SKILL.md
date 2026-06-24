---
name: apm-usage
description: 指导 Agent 与开发者使用本仓库 APM CLI（init、read、role/persist/dynamic、kb 导入/索引/联想区、replace 局部更新、validate 干跑、stdin 管道写入）。在用户提到 apm、外置记忆、.apm、apm read、知识库、会话恢复或 Agent 初始化上下文时使用。
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
  config.json          # 各段 max 上限；initializedAt / updatedAt / lastReadAt
  memory/role.md       # 角色
  memory/persist.md    # 持久记忆
  memory/dynamic.md    # 动态记忆（当前任务）
  kb/docs/             # 知识库 .md（可嵌套）
  kb/dynamic/detail.md
  kb/archive/          # memory 三段 write 时写入的分层快照（见下文）
  kb/index/search.json.gz
```

`apm kb write --path` 的路径相对 `kb/docs/`（如 `Iterations/foo/prd.md`）。检索与联想中的路径相对 `kb/`（如 `docs/foo.md`、`archive/2026/06/18/dynamic/143052127.md`；旧版扁平 `archive/dynamic-....md` 仍可被索引）。

## 默认长度上限（仅 max，无下限）

| 段 | config section | 默认 max |
|----|----------------|----------|
| 角色 | `role` | 100 |
| 持久记忆 | `persist` | 800 |
| 动态记忆 | `dynamicDetail` | 1500 |
| KB 动态 | `kbDynamicDetail` | 1500 |

- **无下限**：任意短文本（含 1 字、空串）均可写入。
- **仅上限**：超过 `max` 时拒绝写入，报错含 `got n, max m, need k fewer chars`。
- `kb write` **不受**上述 max 限制。

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

`show` · `write` · `validate` · `replace --old <原文> --new <新文> [--all]`

```bash
apm role show
apm role write --text "…"
apm role validate --text "…"
apm role replace --old "旧" --new "新"
apm persist write --text "…"
apm dynamic write --text "…"
apm dynamic replace --old "…" --new "…"
```

#### 正文输入：`--text`、管道、`--stdin`

- `--text <正文>`：单行参数，支持转义 `\n` `\t` `\r` `\\`。
- **管道**（未传 `--text` 时自动读 stdin）：`echo hello | apm dynamic write`
- **`--stdin`**：显式从 stdin 读取（与 `--text` **互斥**）。

```bash
# bash：管道写入
echo -e "任务：…\n下一步：…" | apm dynamic write

# bash：重定向文件
apm kb write --path Iterations/foo/prd.md --stdin < prd.md

# PowerShell：管道写入
"任务：…`n下一步：…" | apm dynamic write

# PowerShell：重定向文件
Get-Content .\prd.md -Raw | apm kb write --path Iterations/foo/prd.md --stdin
```

**无 `--file` 参数**：长文档请先写入 `kb/docs/` 路径（Shell 重定向 stdin），或使用 Agent 写文件工具后执行 `apm kb index rebuild`。

#### `validate`（干跑，不落盘）

```bash
apm dynamic validate --text "草稿正文"
echo "草稿" | apm persist validate
```

- 规则与 `write` 相同（仅检查 max）；成功输出 `OK: <当前长度>/<max>`。
- 不写盘、不归档、不触发索引重建。

#### `replace` 其他说明

- `replace`：`--old` 须与 `show`/`read` 正文**原样**匹配；默认只换第一次，全换加 `--all`。
- `replace` **不**写入 archive 快照（仅 `write` 触发快照）。
- 全量覆盖用 `write`。
- 写入时不要手写 YAML front matter。
- `--old` / `--new` 支持转义（`kb write` 的 `--text` / stdin 同理）。

### memory 三段 write 与 archive 快照

每次 `role` / `persist` / `dynamic` 的 **`write`** 会将**本次落盘全文**（含 YAML front matter）同时写入目标文件与分层 archive 快照；快照内容与目标文件**完全相同**（存新版，非覆盖前的旧版）。

| 路径模式（相对 `kb/`） | 说明 |
|------------------------|------|
| `archive/{yyyy}/{MM}/{dd}/role/{HHmmssSSS}.md` | role write 快照 |
| `archive/{yyyy}/{MM}/{dd}/persist/{HHmmssSSS}.md` | persist write 快照 |
| `archive/{yyyy}/{MM}/{dd}/dynamic/{HHmmssSSS}.md` | dynamic write 快照 |

| 命令 | archive 快照 |
|------|--------------|
| `role` / `persist` / `dynamic` **`write`** | 每次 +1 条分层快照 |
| `dynamic write --text ""` | 目标变为空模板，仍 +1 条空模板快照 |
| `replace` | **不**新增快照 |
| `validate` | **不**写盘、不归档 |
| `kb dynamic write` | **不**写入 `archive/`（仅更新 `kb/dynamic/detail.md`） |

旧版扁平 `archive/dynamic-<时间戳>.md` 若已存在，索引 rebuild 后仍可检索，与新分层路径共存。

### 知识库

```bash
apm kb import --from <目录>
apm kb write --path <path.md> --text "…"
apm kb write --path <path.md> --stdin    # 或管道 stdin
apm kb search --q "<查询>"
apm kb index rebuild
apm kb dynamic show|write|validate|replace
```

| 操作 | 自动 `kb index rebuild` |
|------|-------------------------|
| `role` / `persist` / `dynamic` 的 write、replace | 是 |
| `dynamic write` | 是 |
| `kb import` | 是 |
| `kb write`、`kb dynamic` 的 write/replace | 否 |
| `validate`（各段） | 否 |

### 配置

```bash
apm config show
apm config set --section role|persist|dynamicDetail|kbDynamicDetail --max <n>
```

- 各段 limits **仅含 `max`**；旧 config 中的 `min` 读取时忽略。
- `config set` 写回时只持久化 `{ "max": n }`。

## 典型场景

**恢复会话：** `apm read` → 读动态记忆与联想区 → 继续任务。

**切换任务：**

```bash
apm dynamic write --text "任务：…\n下一步：…"
# 或管道 / --stdin（见上文）
```

**写入知识库单文件：**

```bash
apm kb write --path Iterations/<名>/prd.md --text "…"
# 或：apm kb write --path … --stdin < prd.md
apm kb index rebuild
apm read
```

**写入前干跑校验：**

```bash
apm dynamic validate --text "草稿"
# 通过后再 write
apm dynamic write --text "草稿"
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
| 长度报错 `got … max … need … fewer` | 缩短正文，或 `config set --max` 调大；可先 `validate` 干跑 |
| `\n` 未换行 | 使用 `\n` 转义序列、管道真实换行，或 `--stdin` |
| `Cannot use both --text and --stdin` | 只选其一 |
