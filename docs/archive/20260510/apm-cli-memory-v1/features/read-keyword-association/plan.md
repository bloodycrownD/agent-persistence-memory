# read-keyword-association 设计方案

## 设计目标

在不变更「无外部模型」前提下，为 `apm read` 补齐与产品语义一致的 **持久化关联关键词**、**关联 chunk 选取**、**联想关键词**，并用自动化测试锁住区间与数据来源约束。

## 总体方案

1. **关联构建模块**（纯函数 / service）：输入 `persist` 正文、`tmp detail` 正文、`todos[]`、`chunks[]`，输出：
   - `persistenceKeywords`（5~10 优先）
   - `selectedChunks`（≤5，带 `score`）
   - `associativeKeywords`（5~10 优先，否则 ≤5 尽量 ≥3）

2. **`read` 命令组装**：先读各存储文件，再调用关联模块，最后渲染文本 / JSON。

3. **测试**：构造可控长度的 persist/detail 文本与多个 chunks，断言关键词数量、包含关系与选取条数上限。

## 最终涉及的项目结构（增量）

```text
src/services/read-associations.ts   # 关联抽取与打分（本变更核心）
src/services/read-service.ts        # 模板渲染：持久化关联 / 联想关键词区块
src/cli/commands/read.ts           # JSON payload 字段组装
tests/cli.spec.ts                  # 新增用例：read 关联行为
```

## 变更点清单

| 类型 | 路径 | 说明 |
|------|------|------|
| 新增 | `src/services/read-associations.ts` | 词频抽取、chunk 打分、联想词排序 |
| 修改 | `src/services/read-service.ts` | `renderReadText` 增加 `associations` 参数与两段输出 |
| 修改 | `src/cli/commands/read.ts` | `buildReadAssociations` + JSON 字段 |
| 修改 | `tests/cli.spec.ts` | 覆盖 persist/detail 驱动关键词与 chunk 上限 |

## 详细实现步骤

1. **抽取管道**
   - 合并 persist（权重较高）、detail、todos 文本；
   - `tokenize`：小写、非字母数字分割、长度阈值、停用词表；
   - `termScore`：TF + 源权重叠加，排序得 `persistenceKeywords`（截断至 max 10，展示目标 5~10）。

2. **Chunk 打分**
   - 对每个 chunk，将其 `keywords` 与 `termScore` 中有交集的项加权求和；
   - 过滤 score>0，按 score 降序、`name` 字典序稳定排序；
   - `slice(0, 5)`。

3. **联想关键词**
   - 仅遍历 `selectedChunks` 的 keywords；
   - 排除已在 `persistenceKeywords` 中的词；
   - 按 chunk score 加权累计同一 keyword 的分数，排序后取 5~10，否则退回 ≤5。

4. **CLI / JSON**
   - `persistenceLinks.keywords`、`persistenceLinks.chunks`、`associative.keywords` 与文本模板一致。

5. **文档**
   - 本目录 `spec.md` / `plan.md` 作为变更唯一事实来源；若有细节与主 `apm-cli-memory-v1/spec.md` 冲突，以本 feature spec 为准（直至主 spec 合并修订）。

## 测试策略

### 测试用例（Vitest）

- **TC1**：写入足够长的 `persist`/`detail`（包含重复英文 token），断言 `persistenceLinks.keywords.length` ∈ [5,10]。
- **TC2**：添加多个 chunks（高相关 / 低相关 / noise），断言选中 chunks ≤5，且相关 chunk 排在 noise 前。
- **TC3**：断言 `associative.keywords` 长度 ∈ [3,10] 且不与持久化关联完全重复。
- **回归**：原有 `apm read --json` 字段不被破坏（`role`、`persist`、`currentTask` 等）。

### 验证命令

```bash
npm test -- --run
npm run build
```

## 风险与回滚方案

| 风险 | 缓解 | 回滚 |
|------|------|------|
| 短文本导致关键词不足 5 条 | 文档写明允许少于区间；测试同时覆盖「充足」与「极端短」 | 回退 `read-associations.ts` 提交 |
| 中英文混合抽取偏弱 | 后续迭代可扩展 tokenizer / CJK 二元组；本变更以确定性英文 token 为主验证 | 同上 |

## 兼容性说明

- **数据格式**：不改 `.apm` 文件 schema；仅改变 `apm read` **计算与展示**逻辑。
- **JSON 消费方**：若依赖旧版 `persistenceLinks.chunks` 仅为 `{name,keywords}`，需兼容带 `score` 字段（一般为增量兼容）。
