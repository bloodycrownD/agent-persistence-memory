# read-display-tiers 设计方案

## 设计目标

在不引入外部模型的前提下，将 `apm read` 输出与最初 prompt 模板对齐：**持久化关联**与**联想记忆**均采用 **匹配度排序后的 3 条完整正文 + 5 条仅元数据**；并通过 **chunk 正文 ≤200**、**todos ≤20** 约束保证版式稳定、可测。

## 总体方案

1. **扩展 `read-associations`（或拆分子模块）**  
   - **Query A（持久化关联）**：权重延续现状——`persist` > `detail` > `openTodos`。  
   - **Query B（联想记忆）**：侧重 **`detail` + 当前 `currentTask` 文本**（由首个未完成 todo 拼出），`persist` 权重降低或作为补充；仍对全量 `chunks` 打分。  
   - 各队列输出 **按分数排序的全列表**，分别取 **前 8 名**（或「命中 score>0」后再取），再切分为 **primary=slice(0,3)**、**secondary=slice(3,8)**。  
   - Primary 渲染需带上 **`ChunkDoc.content`**（完整正文）；Secondary 仅 **name、keywords、score**。

2. **渲染层 `renderReadText`**  
   - 按 `spec.md` 增加 **## 联想记忆** 小节。  
   - **## 持久化关联** 内分 **Primary / Secondary** 二级标题或固定前缀，避免与旧版「仅列 name」混淆。  
   - **## Chunks**：默认 **折叠为可选**（`--json` 仍可返回全量列表）；若保留全量列表，标注为附录。

3. **校验层**  
   - `chunks`：`countChars(text) <= 200`（与 `core/validate.countChars` 一致）。  
   - `tmp todos add`：`listTodos(cwd).length >= 20` 时拒绝。

4. **测试**  
   - 构造 ≥8 个 chunk、可控 keywords；构造 persist/detail 文本使排序稳定；断言 read 文本或 JSON 中 primary 含 `content`，secondary 不含正文。

## 最终项目结构（增量）

```text
src/services/read-associations.ts    # 扩展：双队列 + primary/secondary 切分
src/services/read-service.ts         # 模板：持久化关联分层 + 联想记忆分层
src/cli/commands/read.ts             # JSON payload：新字段
src/cli/commands/chunks.ts             # 校验 text <= 200
src/cli/commands/tmp.ts              # todos add 上限 20
tests/cli.spec.ts                    # 新用例
```

## 变更点清单

| 文件 | 变更 |
|------|------|
| `read-associations.ts` | 输出 `persistencePrimary/Secondary`、`associativePrimary/Secondary`（或等价结构）；联想队列独立 `termScore` |
| `read-service.ts` | 新模板区块与层级 |
| `read.ts`（CLI） | JSON 对齐 |
| `chunks.ts` | `text` 长度校验 |
| `tmp.ts` | `todos add` 计数门禁 |
| `cli.spec.ts` | 覆盖 |

## JSON 字段建议（实现时保持一致）

```json
{
  "persistenceLinks": {
    "keywords": ["..."],
    "primary": [{ "name": "", "keywords": [], "score": 0, "content": "" }],
    "secondary": [{ "name": "", "keywords": [], "score": 0 }]
  },
  "associativeMemory": {
    "primary": [{ "name": "", "keywords": [], "score": 0, "content": "" }],
    "secondary": [{ "name": "", "keywords": [], "score": 0 }]
  },
  "associative": { "keywords": ["..."] }
}
```

（若命名调整，以单 MR 内一致为准，并更新本文件。）

## 详细实现步骤

1. `chunks add/edit`：增加 200 字校验 + 测试（含边界 200/201）。  
2. `tmp todos add`：读取 `listTodos`，长度 ≥20 则抛错 + 测试。  
3. 扩展 `buildReadAssociations`：  
   - 拆出 `buildTermScore(sources)`；  
   - `persistenceScoredChunks` 与 `associativeScoredChunks` 两套分数；  
   - 返回两套 primary/secondary + 原 `associativeKeywords` 生成逻辑（可改为基于联想队列 TopN）。  
4. `renderReadText` + `read` JSON：接入新结构。  
5. 全量 `npm test`、`npm run build`。

## 测试策略

- **TC-chunk-200**：201 字拒绝。  
- **TC-todo-20**：第 21 条拒绝。  
- **TC-read-tiers**：8+ chunks，断言 primary 含 content、secondary 无 content；两节均最多 3+5。  
- **TC-read-json**：JSON schema 关键字段存在且类型正确。

## 风险与回滚方案

- **模板变长**：Agent 上下文占用上升——接受；必要时后续加 `--compact`。  
- **双队列相关性不足**：优先保证 determinism 与测试夹具；中文场景后续迭代 tokenizer。  
- 回滚：单提交 revert `read-display-tiers` 相关改动即可恢复旧模板。

## 兼容性说明

- **破坏性**：`apm read` 文本与 `--json` 形状变更；消费方需同步。  
- **数据**：不改 `.apm` 文件 schema；仅 CLI 行为与校验增强。
