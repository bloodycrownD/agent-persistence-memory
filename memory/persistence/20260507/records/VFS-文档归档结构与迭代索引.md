# VFS 文档归档结构与迭代索引

## 日期

2026-05-07

## 背景

迭代文档散落在 `docs/Iterations/` 下，在多轮实现后需要按项目约定集中到 `docs/archive/<yyyyMMdd>/`，便于回溯「当时冻结」的 spec/plan；同时与工作区文稿区分。

## 结论 / 事实

1. 归档根入口：`docs/archive/index.md`，日期索引：`docs/archive/20260507/index.md`。
2. 本日归档快照路径（均需满足 `features/<变更名称>/`）：
   - `docs/archive/20260507/持久化抽象重构/features/spec-plan/`：`spec.md`、`plan.md`
   - `docs/archive/20260507/消息事件管线设计/features/spec-plan/`：`spec.md`、`plan.md`
   - `docs/archive/20260507/虚拟文件系统/features/spec-baseline/`：早期 `spec.md` 单行本
3. `docs/Iterations/README.md`：进行中文档在 Iterations；某批文档归档落盘后删除 Iterations 中当次冗余副本，`docs/archive/` 为该批次的查阅入口。
4. **知识沉淀（与归档无关但相关）**：持久化分层为 Adapter / Schema / Store；消息侧为单独 `st-event-adapter`，`CHAT_CHANGED` 仅由 `vfs-store-singleton` 处理以避免重复监听。

## 影响 / 下一步

- 新迭代可先写 `docs/Iterations/...`，稳定后再按同一规则追加新 `yyyyMMdd` 或同日新 `features/<名称>`。
- 已归档条目不再保留 `Iterations/` 中与归档快照重复的目录，参见 `Iterations/README.md` 与归档 skill 的第 8 步。
