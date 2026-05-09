---
name: subagent-task-doc
description: 生成并发 subagent 开发所需的 task.md 文档，明确任务拆分、共享约束、边界与验收。用于用户提到 subagent 并行开发、任务拆分、并发执行规划、先写 task 文档再编码等场景。
---

# Subagent 并发任务文档

## 使用说明

1. 先读取该迭代的总览与子方案文档：
   - `docs/Iterations/<需求名称>/spec.md`
   - `docs/Iterations/<需求名称>/plan*.md`
2. 识别可并发与不可并发部分：
   - 可并发：低耦合模块、独立目录、独立测试路径。
   - 不可并发：共享壳层、共享状态接口、共享错误码、共享事件总线。
3. 生成任务文档：
   - `docs/Iterations/<需求名称>/task.md`
4. `task.md` 必须包含：
   - 目标与范围
   - subagent 拆分（每个 agent 的职责、输入、输出）
   - 共享契约（接口、事件、错误码、目录边界）
   - 并发执行顺序与依赖
   - DoD（完成定义）与验收清单
   - 合并策略（冲突处理、集成顺序、回滚方式）
5. 输出后要求用户确认 `task.md`，确认前不进入编码。

## task.md 模板

```markdown
# <需求名称> 并发开发任务单

## 目标与范围

## Subagent 拆分
### Agent A
### Agent B
### Agent C

## 共享契约
### 接口契约
### 事件契约
### 错误码契约
### 目录边界

## 执行顺序与依赖

## DoD 与验收清单

## 合并与回滚策略
```
