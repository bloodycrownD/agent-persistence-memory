---
name: apm-usage
description: 指导 Agent 与开发者使用本仓库 APM CLI（init、read、role/persist/dynamic、kb 检索/索引、联想区、stdin 管道写入）。在用户提到 apm、外置记忆、.apm、apm read、知识库、会话恢复或 Agent 初始化上下文时使用。
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
- **工作区自动补齐**：任意命令首次执行时会创建或补全 `.apm/` 目录树；`apm init` 等价且幂等。

## 工作区

```
.apm/                   # 运行态目录（整体 .gitignore）
  config/config.json   # initializedAt / updatedAt / lastReadAt
  config/index.gz        # 搜索索引（apm index build 产物）
  memory/role.md       # 角色
  memory/persist.md    # 持久记忆
  memory/dynamic.md    # 动态记忆（当前任务）
  archive/             # memory 三段 write 时写入的分层快照（见下文）
docs/                   # 项目根，知识库 .md（可嵌套，入版本控制）
```

知识库文档请直接写入项目根 `docs/`（如 `Iterations/foo/prd.md`），再执行 `apm index build`。检索与联想中的路径带来源前缀（如 `docs/foo.md`、`archive/2026/06/18/dynamic/143052127.md`；旧版扁平 `archive/dynamic-....md` 仍可被索引）。

## `apm read` 输出

无内容的段会省略。顺序：

1. `# 角色`、`# 持久记忆`、`# 动态记忆`（正文已去 YAML front matter）
2. `# 联想区`（用三段记忆正文检索 `docs/` 与 `archive/`）

| 联想区 | 说明 |
|--------|------|
| 详细区 | ≤5 条；`[匹配率%] 路径 关键词：…` + ≤3 行 `行号\|正文`（超 120 字截断）；条间空一行 |
| 简略区 | ≤10 条；仅头部；条间无空行；与详细区间空一行 |
| 无命中 | 不输出联想区 |
| 无索引 | 输出提示执行 `apm index build` |

## 命令

### 记忆：`role` | `persist` | `dynamic`

`show` · `write`

```bash
apm role show
apm role write --text "…"
apm persist write --text "…"
apm dynamic write --text "…"
```

#### 正文输入：`--text`、管道、`--stdin`

- `--text <正文>`：单行参数，支持转义 `\n` `\t` `\r` `\\`。
- **管道**（未传 `--text` 时自动读 stdin）：`echo hello | apm dynamic write`
- **`--stdin`**：显式从 stdin 读取（与 `--text` **互斥**）。

```bash
# bash：管道写入
echo -e "任务：…\n下一步：…" | apm dynamic write

# PowerShell：管道写入
"任务：…`n下一步：…" | apm dynamic write
```

**无 `--file` 参数**：长知识库文档请直接写入项目根 `docs/`，再执行 `apm index build`。

#### 写入说明

- 全量覆盖用 `write`。
- 写入时不要手写 YAML front matter；若磁盘上 FM 损坏/缺失，`write` 会自愈写出合法 FM（`show` 仍严格校验）。
- `--text` 支持转义（`\n` `\t` 等）。

### memory 三段 write 与 archive 快照

每次 `role` / `persist` / `dynamic` 的 **`write`** 会将**本次落盘全文**（含 YAML front matter）同时写入目标文件与分层 archive 快照；快照内容与目标文件**完全相同**（存新版，非覆盖前的旧版）。

| 路径模式（相对 `.apm/archive/`） | 说明 |
|------------------------|------|
| `{yyyy}/{MM}/{dd}/role/{HHmmssSSS}.md` | role write 快照 |
| `{yyyy}/{MM}/{dd}/persist/{HHmmssSSS}.md` | persist write 快照 |
| `{yyyy}/{MM}/{dd}/dynamic/{HHmmssSSS}.md` | dynamic write 快照 |

| 命令 | archive 快照 |
|------|--------------|
| `role` / `persist` / `dynamic` **`write`** | 每次 +1 条分层快照 |
| `dynamic write --text ""` | 目标变为空模板，仍 +1 条空模板快照 |

旧版扁平 `archive/dynamic-<时间戳>.md` 若已存在（位于 `.apm/archive/`），索引 rebuild 后仍可检索，与新分层路径共存。

### 知识库与索引

```bash
apm index build       # 扫描项目根 docs/ 与 .apm/archive/，重建 .apm/config/index.gz
```

知识库正文不经 CLI 写入：直接复制/移动/编辑项目根 `docs/**/*.md` 后执行 `apm index build`。

| 操作 | 自动 `index build` |
|------|--------------------|
| `role` / `persist` / `dynamic` 的 write | 是 |
| 直接写入/移动 `docs/` | 否（需手动 `index build`） |

> `apm read` 的联想区会消费索引；没有独立的 search 命令，检索结果通过 `apm read` 输出。

### 配置

```bash
apm config show
```

- 输出 `initializedAt` / `updatedAt` / `lastReadAt` 三个时间戳字段。

## 典型场景

**恢复会话：** `apm read` → 读动态记忆与联想区 → 继续任务。

**切换任务：**

```bash
apm dynamic write --text "任务：…\n下一步：…"
# 或管道 / --stdin（见上文）
```

**写入知识库：**

```bash
# 直接复制/移动到项目根 docs/ 后：
apm index build
apm read
```

## 勿混淆的路径

| 路径 | 用途 |
|------|------|
| `.apm/memory/` | CLI 外置记忆，`apm read` 使用 |
| `.apm/archive/` | memory write 的分层快照，参与索引检索 |
| `docs/`（项目根） | 知识库 .md，入版本控制；参与索引检索 |
| 仓库内其他 `memory/` | 不参与 `apm read`，不要当作 `.apm` 使用 |

## 故障排查

| 现象 | 处理 |
|------|------|
| `Knowledge index missing` | `apm index build` |
| 联想区无结果 | 记忆与 docs/archive 有共同词；`index build` |
| 知识库改完搜不到 | `apm index build` |
| `\n` 未换行 | 使用 `\n` 转义序列、管道真实换行，或 `--stdin` |
| `Cannot use both --text and --stdin` | 只选其一 |
