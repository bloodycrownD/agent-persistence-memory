---
name: archive-docs
description: 用于在迭代开发完成后执行文档归档，按日期与需求分层存放并维护多级索引文件时使用。
disable-model-invocation: true
---

# 文档归档

## 使用说明

1. 在开发完成且相关文档稳定后执行归档。
2. 将文档归档到：
   - `docs/archive/<yyyyMMdd>/<需求名称>/features/...`
3. 维护多级索引文件：
   - `docs/archive/index.md`
   - `docs/archive/<yyyyMMdd>/index.md`
4. 归档结构必须符合：
   - `docs/archive/`
   - `docs/archive/<yyyyMMdd>/`
   - `docs/archive/<yyyyMMdd>/<需求名称>/features/<变更名称>/...`
5. 更新 `docs/archive/index.md`，登记日期级入口。
6. 更新 `docs/archive/<yyyyMMdd>/index.md`，登记需求与变更入口。
7. 保持相对链接可用，避免归档后引用失效。
8. 归档快照已落盘后，删除本次已纳入快照的 `docs/Iterations/` 冗余副本（与归档范围一致的子目录）；**唯一事实来源**为对应日期的 `docs/archive/`。未归档的草稿仍只在 `Iterations` 留存。

## 归档结构

```text
docs/
- archive/
  - index.md
  - yyyyMMdd/
    - index.md
    - <需求名称>/features/<变更名称>/...
```

## 索引建议

- 日期索引应列出该日期归档的需求条目。
- 根索引应列出可用归档日期及快速入口链接。
