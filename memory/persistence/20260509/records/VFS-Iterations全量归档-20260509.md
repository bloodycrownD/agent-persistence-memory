# VFS Iterations 全量归档（2026-05-09）

## 日期

2026-05-09

## 背景

`docs/Iterations/` 用于存放“进行中”文稿。随着本轮迭代文档稳定，需要把 Iterations 中的内容全量落盘为归档快照，避免双份漂移，并把 `Iterations` 清空回“仅保留 README 的工作区入口”。

## 结论 / 事实

- 已将 `docs/Iterations/` 下所有需求目录全量归档到：`docs/archive/20260509/`
  - `虚拟宏工作树渲染/`
  - `虚拟工作树UI所见即所得/`
  - `虚拟工具调用执行/`
- `docs/archive/20260509/index.md` 已更新，新增上述需求入口。
- 归档完成后，已删除 `docs/Iterations/` 中对应的冗余副本，并清理空目录。
- 当前约定：一旦某个需求目录被纳入 `docs/archive/<yyyyMMdd>/`，后续查阅该版本应以归档为准（Iterations 不再保留同内容副本）。

## 影响 / 下一步

- 以后新增/修改迭代文稿：先写入 `docs/Iterations/<需求名称>/...`，稳定后再归档到某个日期目录。
- 归档时务必同步维护：
  - `docs/archive/index.md`（根索引）
  - `docs/archive/<yyyyMMdd>/index.md`（当日索引）
  - 以及必要的 Iterations README 提示，避免入口丢失。

