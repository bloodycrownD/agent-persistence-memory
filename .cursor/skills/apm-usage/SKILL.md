---
name: apm-usage
description: 指导 Agent 与开发者使用 APM CLI（init、read、role/persist/dynamic、kb 导入/索引/联想区）。在用户提到 apm、外置记忆、.apm、apm read、知识库、会话恢复或 Agent 初始化上下文时使用。
disable-model-invocation: true
---

# APM 使用指南

## 何时使用

- **会话开始**：`apm read` 拉取角色、持久记忆、动态记忆与知识库联想。
- **任务进行中**：`apm dynamic write/replace` 更新当前任务；稳定结论写入 `apm persist`。
- **沉淀文档**：把 Markdown 放进知识库并保证可检索。

## 前置条件

- 在**项目根目录**（含或将创建 `.apm/` 的目录）执行命令。
- 已安装本仓库 CLI：`apm` 或 `npx apm`（仓库内需先 `npm run build`）。

## 工作区布局（v2）

```
.apm/
  config.json        # 各段长度 limits；工作区元数据（初始化/更新时间等）
  memory/
    role.md          # 角色
    persist.md       # 持久记忆
    dynamic.md       # 动态记忆（当前任务）
  kb/
    docs/            # 知识库 Markdown（可嵌套目录）
    dynamic/detail.md
    archive/         # dynamic 历史归档（write 时自动写入）
    index/
      search.json.gz # 检索索引
```

- 不要使用旧布局（`.apm/role.md`、`.apm/persistence/`、`.apm/dynamic/`）；若报错，备份后 `apm init`。
- 知识库路径写相对 `kb/docs/` 时，命令里用 `docs/...` 或 `Iterations/foo/prd.md` 等形式（见 `apm kb write --path`）。

## Agent 标准流程

```text
1. apm init                 # 首次（幂等）
2. apm read                 # 拉上下文（必做）
3. … 执行任务 …
4. apm dynamic write --text "…"   # 更新当前任务（见下文归档规则）
5. （可选）apm persist write      # 长期规则/结论
6. （可选）apm kb import / write  # 沉淀文档（注意是否要 rebuild，见下表）
```

### `apm read` 输出

按顺序输出（**无内容则省略该段**）：

1. `# 角色` — `memory/role.md` 正文（已去 YAML）
2. `# 持久记忆` — `memory/persist.md`
3. `# 动态记忆` — `memory/dynamic.md`
4. `# 联想区` — 用 role+persist+dynamic 正文检索 `kb/`（不含 `index/`）

**联想区格式（摘要）：**

| 项 | 说明 |
|----|------|
| 详细区 | 最多 5 条：`[匹配率%] 路径 关键词：…` + 最多 3 行 `行号\|正文`（过长截断）；条间空一行 |
| 简略区 | 最多 10 条：仅头部一行；条间无空行；与详细区之间空一行 |
| 无命中 | 不输出联想区 |
| 无索引 | 输出联想区 + 提示 `apm kb index rebuild` |

## 常用命令

### 初始化与读取

```bash
apm init
apm read
```

### 记忆三段（role / persist / dynamic）

子命令相同：`show` | `write --text <正文>` | `replace --old <原文> --new <新文> [--all]`

```bash
apm role show
apm role write --text "…"
apm role replace --old "旧" --new "新"
apm persist write --text "…"
apm dynamic write --text "…"
apm dynamic replace --old "…" --new "…"
```

**使用要点：**

- `replace` 的 `--old` 须与 `show`/`read` 正文**完全一致**（原样子串）；多处相同加 `--all`。
- 全量覆盖用 `write`；长度受 `apm config` 的 min/max 约束。
- **不要**在写入内容里手写 YAML front matter（文件里由 CLI 维护）。
- **参数转义**（`--text` / `--old` / `--new`，含 `kb write`）：`\n` 换行、`\t` 制表、`\r` 回车、`\\` 反斜杠；字面量 `\n` 写 `\\n`。

### 动态记忆与归档

| 操作 | 行为 |
|------|------|
| `apm dynamic write --text "新任务"` | 若当前 dynamic 正文非空，**先**复制到 `kb/archive/dynamic-时间戳.md`，再写入新正文 |
| `apm dynamic write --text ""` | 清空 dynamic（正文已空则不归档；非空则先归档再清空） |
| `apm dynamic replace` | 不自动归档，只改当前正文 |

已无 `apm dynamic archive` / `apm dynamic clear`，请用上面两种方式。

### 知识库

```bash
apm kb import --from <目录>              # 导入 .md 到 kb/docs/，结束后自动 rebuild
apm kb write --path <相对docs的路径.md> --text "…"
apm kb search --q "<查询>"
apm kb index rebuild                     # 全量重建索引
apm kb dynamic show|write|replace        # kb/dynamic/detail.md
```

**何时需要手动 `apm kb index rebuild`：**

| 操作 | 自动 rebuild |
|------|----------------|
| `role` / `persist` / `dynamic` 的 write、replace | 是 |
| `apm dynamic write` | 是 |
| `apm kb import` | 是 |
| `apm kb write` | **否** → 写完请执行 `rebuild` |
| `apm kb dynamic` 的 write、replace | **否** |

### 配置

```bash
apm config show
apm config set --section role|persist|dynamicDetail|kbDynamicDetail --min <n> --max <n>
```

工作区只需维护 `.apm/config.json`（旧版单独的 `status.json` 会在首次使用时自动合并进 `config.json`）。

## 典型场景

### 新会话恢复

1. `apm read`
2. 读「动态记忆」里的当前任务 / 下一步
3. 参考「联想区」打开相关 `kb/docs` 或 `kb/archive` 文档

### 切换任务（换一版 dynamic）

```bash
apm dynamic write --text "新任务：…\n下一步：…"
```

旧版 dynamic 会自动进 `kb/archive/`，之后 `apm read` 的联想可搜到归档内容。

### 把迭代文档放进知识库

```bash
apm kb write --path Iterations/功能名/prd.md --text "…"
apm kb index rebuild    # kb write 不会自动 rebuild
apm read                # 验证联想区是否命中
```

或批量：`apm kb import --from docs`（会自动 rebuild）。

### 多行正文（单行命令）

```bash
apm dynamic write --text "第一行\n第二行\n第三行"
```

## 与仓库 `memory/` 目录的区别

| 位置 | 用途 |
|------|------|
| `.apm/memory/*.md` | **APM 运行时记忆**，由 CLI 读写，`apm read` 使用 |
| 仓库根 `memory/` 等 | 人工/项目记录，**不**参与 `apm read`，勿与 `.apm` 混淆 |

## 故障排查

| 现象 | 处理 |
|------|------|
| `Old .apm layout detected` | 备份后删旧 `.apm`，`apm init` |
| `Incomplete .apm workspace` | `apm init` |
| `Knowledge index missing` | `apm kb index rebuild` |
| 联想区无结果 | 记忆与 kb 文档要有共同关键词；`rebuild` |
| `kb write` 后搜不到 | 执行 `apm kb index rebuild` |
| 长度报错 | `apm config set` 调大 `max` 或缩短正文 |
| `--text` 里 `\n` 没换行 | 确认传的是字面量 `\`+`n`（CLI 会转义）；或改用真实多行参数 |
