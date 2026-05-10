# apm read 占位（开发中）需求说明

## 背景

顶层命令 `apm read` 曾负责汇总 role、persist、tmp、chunks 等并输出可读快照或 `--json` 结构。当前迭代需要暂停该能力，保留命令入口以便脚本与工作流不因子命令消失而断裂，同时明确向用户提示功能尚未就绪。

## 目标

- 调用 `apm read`（含既有 CLI 选项如 `--json`、`--with-all-chunks`）时，仅输出一行 **`开发中`**。
- 移除原实现及相关专用代码（非简单注释屏蔽），避免误用旧行为。

## 范围

### 包含范围

- `src/cli/commands/read.ts`：仅注册 `read` 子命令并在 action 中输出 `开发中`。
- 删除仅服务于原 `read` 实现的模块：
  - `src/services/read-service.ts`
  - `src/services/read-associations.ts`
  - `src/services/status-service.ts`（原用于 `lastReadAt` 等 read 侧状态）
  - `src/schemas/status.ts`（仅被 status-service 使用）
- 更新 `tests/cli.spec.ts`：去掉依赖旧 JSON/文本快照的用例；增加占位行为断言；移除已无运行时校验路径的 status 校验用例。

### 不包含范围

- `apm chunks read` 等其它子命令中的 `read` 动词。
- `ensureApm` 仍会在其它命令中创建 `status.json`；本需求不要求删除或改写该文件格式。
- 历史迭代文档（如 `docs/Iterations/apm-cli-memory-v1/...`）中的计划描述不强制同步修改。

## 功能需求

1. 执行 `apm read`、`apm read --json`、`apm read --with-all-chunks` 时，标准输出为 **`开发中`**（可单独一行，前后无额外说明）。
2. 不再读取 section、todos、chunks，不更新 `lastReadAt`，不输出 JSON 快照结构。

## 非功能需求

- TypeScript 编译与现有测试套件通过。
- 不引入替代实现或「半套」快照逻辑；代码库中不存在对已删模块的引用。

## 验收标准

- [ ] 本地执行 `apm read` 与 `apm read --json` 均只打印 `开发中`。
- [ ] 已删除 `read-service.ts`、`read-associations.ts`、`status-service.ts`、`schemas/status.ts`。
- [ ] `npm test` 全部通过。

## 风险与待确认项

- **脚本兼容**：依赖 `apm read --json` 解析结构化字段的外部脚本将失效，需由调用方改为等待正式实现或临时改用其它数据源。
- **lastReadAt**：不再维护；若未来恢复 `read`，需重新定义是否仍写入 `status.json`。
- **文档**：仓库内旧 plan 仍提及已删除文件，可能造成阅读困惑；是否统一修订由后续文档任务决定。
