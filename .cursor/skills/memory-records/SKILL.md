---
name: memory-records
description: 用于记录项目关键记忆信息，区分长期持久记录与临时记录，并通过索引实现可追溯管理时使用。
disable-model-invocation: true
---

# 记忆管理

## 使用说明

1. 使用本 skill 记录项目中的重要知识、结论与决策。
2. 将记忆分为两类：
   - 持久记忆：长期有效、可复用的信息
   - 临时记忆：阶段性、短期跟踪的信息
3. 按以下路径写入：
   - 持久记忆：
     - `memory/persistence/<yyyyMMdd>/index.md`
     - `memory/persistence/<yyyyMMdd>/records/...`
   - 临时记忆：
     - `memory/tmp/index.md`
     - `memory/tmp/records/...`
4. 每新增一条记录，都必须同步更新对应 `index.md`。
5. 每条记录建议包含：
   - 标题
   - 日期
   - 背景
   - 结论 / 事实
   - 影响 / 下一步
6. 文件命名保持清晰，便于后续检索。

## 记录模板

```markdown
# <记录标题>

## 日期

## 背景

## 结论 / 事实

## 影响 / 下一步
```
