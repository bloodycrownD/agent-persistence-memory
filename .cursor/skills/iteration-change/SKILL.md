---
name: iteration-change
description: 用于处理已有迭代内的需求变更，要求在 features 子路径下补齐变更级 spec 与 plan 文档时使用。
disable-model-invocation: true
---

# 迭代内变更

## 使用说明

1. 将每次迭代内变更视为该需求下的 feature 级变更。
2. 使用 `AskQuestion` 与用户澄清变更内容：
   - 变更动机与原因
   - 与原始范围相比发生了什么变化
   - 影响的模块与接口
   - 更新后的验收标准
3. 生成变更级需求文档：
   - `docs/Iterations/<需求名称>/features/<变更名称>/spec.md`
4. 生成变更级方案文档：
   - `docs/Iterations/<需求名称>/features/<变更名称>/plan.md`
5. 质量标准与主需求一致：
   - 范围清晰
   - 方案可落地
   - 测试用例明确
6. 开发前请用户确认这两个文档。

## 必要产物

- `docs/Iterations/<需求名称>/features/<变更名称>/spec.md`
- `docs/Iterations/<需求名称>/features/<变更名称>/plan.md`
