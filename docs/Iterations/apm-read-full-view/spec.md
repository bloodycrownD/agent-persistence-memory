# apm-read-full-view 技术规格（SPEC）

依据 PRD：`docs/Iterations/apm-read-full-view/prd.md`。本文档描述如何实现 `apm read` 命令，聚合输出角色、持久记忆与动态记忆的正文内容。

## 设计目标
- 实现 `apm read` 命令，按顺序聚合输出三个核心 memory 文件的正文。
- 自动剔除 YAML front matter。
- 自动隐藏内容为空的部分（不显示标题）。
- 保持现有的 `Section` 抽象与存储访问模式。

## 总体方案
1. **复用现有服务**：使用 `src/services/sections-service.ts` 中的 `readSectionContent` 函数来获取清洗后的正文（该函数内部已调用 `parseFrontMatter`）。
2. **命令实现**：重写 `src/cli/commands/read.ts`，依次读取 `role`、`persist`、`dynamicDetail` 三个 section。
3. **聚合逻辑**：
   - 定义标题映射关系。
   - 遍历 section，若内容非空（trim 后），则拼接对应的二级标题与正文。
   - 正文与下一个标题之间保留必要的换行符以符合 Markdown 规范。

## 最终项目结构
- `src/cli/commands/read.ts`：更新实现逻辑。
- `tests/cli.spec.ts`：更新测试用例以验证聚合输出效果。

## 变更点清单
| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/cli/commands/read.ts` | 修改 | 实现聚合读取与格式化输出逻辑。 |
| `tests/cli.spec.ts` | 修改 | 更新 `T8` 测试用例，并新增聚合读取的专项测试。 |

## 详细实现步骤
1. **重构 `read.ts`**：
   - 导入 `readSectionContent`。
   - 定义 section 列表：`["role", "persist", "dynamicDetail"]`。
   - 定义标题映射：`role: "角色"`, `persist: "持久记忆"`, `dynamicDetail: "动态记忆"`。
   - 在 action 中循环读取，构建输出字符串。
   - 处理内容为空的情况：`content.trim().length === 0` 则跳过。
2. **完善测试**：
   - 在 `tests/cli.spec.ts` 中模拟三个文件都有内容、部分有内容、全为空的场景。

## 测试策略
### 测试用例
| ID | 场景 | 步骤与断言 |
|----|------|------------|
| T-READ-1 | 全量输出 | 向 role, persist, dynamic 写入内容 -> 执行 `apm read` -> 断言包含三个 # 标题及正文，且无 `---` 元数据。 |
| T-READ-2 | 部分隐藏 | 仅向 role 写入内容 -> 执行 `apm read` -> 断言包含 “# 角色”，不包含 “# 持久记忆” 和 “# 动态记忆”。 |
| T-READ-3 | 全空输出 | 初始状态 -> 执行 `apm read` -> 断言输出为空字符串或仅换行。 |

## 风险与回滚方案
- **风险**：`parseFrontMatter` 若解析失败会抛错（例如文件损坏）。
- **缓解**：`readSectionContent` 已有完善的错误处理，命令层直接捕获即可。
- **回滚**：`git checkout src/cli/commands/read.ts`。
