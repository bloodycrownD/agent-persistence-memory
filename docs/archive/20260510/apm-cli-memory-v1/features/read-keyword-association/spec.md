# read-keyword-association 变更需求说明

## 变更动机与原因

主需求 `apm-cli-memory-v1` 中 `apm read` 需输出「持久化关联」「联想关键词」等与原始产品设计一致的区块。早期实现曾将「持久化关联」简单等同于「列出全部 chunks 关键词」，导致：

- 关键词数量与预期区间（5~10 / 3~5）不一致；
- **持久化关联关键词**并非从 **持久化记忆（persist）与当前任务明细（tmp detail）** 等正文抽取，而是间接沿用 chunk 自带 keywords，语义不符「由正文驱动的关联索引」。

本变更将上述行为收紧为**可验收、可测试**的规则，并与「无外部模型、纯本地汇总」约束兼容。

## 与原始范围相比的变化

| 维度 | 原始主 spec 表述 | 本变更明确后的行为 |
|------|------------------|---------------------|
| **持久化关联关键词** | 仅要求模板中包含区块 | 必须从 **`.apm/persistence/memory.md` 正文** 与 **`.apm/tmp/detail.md` 正文**（并可选叠加未完成 todos 文本）经 **词频/倒排式抽取** 得到；**不得**把 chunk 的 front matter `keywords` 当作持久化关联关键词的来源 |
| **关联 chunks** | 未单独规定选取规则 | 在全部 chunks 上，用「抽取出的查询词集合」与 **各 chunk 的 keywords 字段** 做匹配打分，取 **至多 5 条**（目标 **3~5 条**，不足则更少） |
| **联想关键词** | 模板中有「联想关键词」区块 | 由 **上述选中 chunks** 的 keywords（排除已与持久化关联关键词重复的项）按相关性加权排序；数量优先 **5~10**；若语料不足则 **最多 5、尽量不少于 3** |
| **`apm read --json`** | 要求结构化输出 | `persistenceLinks.keywords`、`persistenceLinks.chunks`（含 `score`）、`associative.keywords` 与文本模板语义一致 |

**不在本变更内**：调用 LLM 生成摘要或关键词；修改 `chunks add/edit` 用户录入 keywords 的规则。

## 影响模块与接口

- **服务层**：`read` 汇总前增加「关联计算」步骤（persist/detail/todos → 关键词 → chunk 打分 → 联想词）。
- **CLI**：`apm read` / `apm read --json` 输出字段结构扩展或对齐（见下）。
- **测试**：Vitest 锁定关键词区间、来源约束与 chunk 选取上限。

## 功能需求（变更增量）

### `apm read` 文本模板

输出结构在主 spec 基础上保证：

1. **## 持久化关联**
   - 第一行为：`Keywords: <k1>, <k2>, ...`（持久化关联关键词，数量目标 **5~10**；若可抽取词不足则少于 5，可为空）
   - 其后列出 **选中的关联 chunks**（至多 **5** 条），每条展示 chunk `name` 及其 **存储的** `keywords`（用于人机对照；**持久化关联行的 Keywords 仍来自正文抽取**）

2. **## 联想关键词**
   - 单行逗号分隔，目标 **5~10**；不足时 **≤5 且尽量 ≥3**

### `apm read --json`

新增或保持稳定字段（与实现一致即可，但必须可断言）：

- `persistenceLinks.keywords: string[]` — 来自 persist/detail/(todos) 抽取
- `persistenceLinks.chunks: Array<{ name, keywords, score }>` — 选中 chunks 及得分
- `associative.keywords: string[]` — 联想关键词（规则见上）
- `chunks` — 仍可保留「全部 chunks 列表」等与主实现一致的字段（若存在），以便完整审计；**关联区块不得以「全量 chunks」冒充「持久化关联」**

### 抽取与打分规则（实现约束）

- **抽取源文本**：`persist` 正文、`tmp detail` 正文；可选叠加 **未完成** todos 的 `name` + `description`。
- **抽取方式**：本地确定性分词 + 停用词过滤 + 词频加权（倒排/TF 风格）；**禁止**调用远程服务。
- **持久化关联关键词**：从抽取结果中取排名前 **10**，且在实际输出中体现为 **5~10** 条（若候选不足则少于 5）。
- **chunk 关联打分**：仅使用 chunk **元数据中的 `keywords` 数组**与查询词权重做交集加权（chunk **正文 content** 可作为后续迭代扩展，本变更不强制）。
- **确定性**：相同 `.apm` 状态下多次 `apm read` 输出一致。

## 非功能需求（变更增量）

- 性能：关联计算为内存操作，chunks 数量在常规规模（数百条以内）下可接受。
- 可测试性：关键区间与「含指定 token」场景须有 Vitest 覆盖。

## 验收标准

- [ ] `apm read` 文本中「持久化关联」行的 Keywords **不是**简单拼接全部 chunk 的 keywords。
- [ ] 在 fixtures 下，`persistenceLinks.keywords.length` 落在 **5~10**（若 persist/detail 文本足够丰富）；极端短文本下允许少于 5。
- [ ] `persistenceLinks.chunks` 条数 **≤ 5**，且与打分排序一致。
- [ ] `associative.keywords.length`：**5~10** 优先；否则 **≤5** 且 **≥3**（若候选不足则更少）。
- [ ] `npm test` 通过；新增/更新用例覆盖上述断言。

## 风险与已确认决策

- **中英文混合**：当前抽取以通用 token 规则为主；中文场景若词表不足，可能出现关键词偏少——允许少于区间下限，但不允许静默改用 chunk keywords 冒充持久化关联来源。
- **与「联想区」全文 chunks 列表并存**：模板中可同时存在「持久化关联（精选）」与「Chunks（全量列表）」，语义上不混淆。
