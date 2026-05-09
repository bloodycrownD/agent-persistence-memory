---
name: subagent-inline-loop
description: 规范化循环：实现子代理（inline 单次执行）-> code-reviewer 对 spec 严格评审 -> 修复 -> 循环直到 merge-ready。适用于“按 spec 一次做完并反复收敛”的任务。
disable-model-invocation: true
---

# Subagent Inline Loop（中文明确版）

## 目的

执行一个基于 spec 的固定循环：

1. **实现阶段：必须启动 `generalPurpose` 子代理**（单次 inline 运行）
2. **评审阶段：必须启动 `code-reviewer` 子代理**（严格对照 spec）
3. 若未通过，继续下一轮“实现子代理 -> 评审子代理”直到 **merge-ready**

该技能用于“严格按 spec 收敛，不靠主代理拍脑袋完成”的场景。

---

## 关键术语（消歧义）

### 什么是 inline

这里的 **inline** 指：

- 在“实现子代理”内部，采用**单次连续执行**完成实现与验证；
- **不是**把每个 task 再拆成多个子子代理；
- **更不是**主代理自己直接实现而不启子代理。

### 强制规则（必须）

- 实现阶段：**必须**派发 `generalPurpose` 子代理  
- 评审阶段：**必须**派发 `code-reviewer` 子代理  
- 除非发生资源故障（见“失败处理”），否则主代理不得跳过子代理步骤

---

## 开始前检查（必须满足）

- 目标 worktree/branch 工作区干净（无未提交改动）
- 已知以下信息：
  - `Spec path`（唯一事实来源）
  - `Plan path`（可选）
  - `Repo/worktree path`
  - 当前分支名
- 分支安全闸：
  - 若当前分支是 `main` 或 `master`，**禁止直接开发**
  - 必须先创建并切换到功能分支，或新建独立 worktree 再开发
  - 推荐命名：`feature/<topic>`、`fix/<topic>`（与 spec 主题对应）

若不干净，先 commit 或 stash（优先 commit，信息明确）。
若位于 `main/master`，先完成“分支安全闸”再进入循环。

---

## 循环结构（每轮固定三步）

### Step A：实现子代理（generalPurpose）

派发一个 `generalPurpose` 子代理，prompt 必须包含：

- repo/worktree 路径
- 分支名
- spec 路径（如有 plan 一并提供）
- 上一轮 CR 的 `must-fix`（逐条原样粘贴）
- 约束：
  - inline 模式（单次运行，不拆每任务多子代理）
  - 按逻辑块提交
  - 运行针对性测试/构建
  - 不回滚无关改动
  - 代码风格要求：新增/修改逻辑应补充“解释意图”的简洁注释，尤其是边界条件、校验规则、状态转换和序列化约束
  - 注释要求“帮助理解为什么”，禁止把代码逐行翻译成注释
- 返回格式：
  - 已实现项
  - 提交（sha + message）
  - 验证命令及 pass/fail
  - 剩余缺口/阻塞

### Step B：评审子代理（code-reviewer）

派发一个 `code-reviewer` 子代理，输入：

- spec 路径
- repo/worktree 路径
- `BASE_SHA` 与 `HEAD_SHA`
  - `BASE_SHA`: `git merge-base HEAD master`（或约定基线分支）
  - `HEAD_SHA`: `git rev-parse HEAD`

输出必须包含：

- 按严重级别排序的问题（Critical / Important / Minor），含精确文件引用
- 对照 spec 章节完成矩阵
- must-fix 列表
- 明确结论：`merge-ready` 或 `not merge-ready`

---

## 开发规范：注释与 TSDoc（必须）

### 注释优先级（从高到低）

1. **模块头注释（文件顶部）**
   - 说明“负责什么 / 不负责什么”
   - 写清关键不变量（例如：仅操作 chat 工作副本、失败也要消费标签避免重触发）
   - 简述调用链路（谁调用谁）

2. **边界/约束注释（关键分支处）**
   - 幂等、防重、资源上限、事务语义、序列化边界
   - 必须解释“为什么这样做”，不能只复述代码

3. **公共 API 注释（export 的 class/function/type）**
   - 参数/返回值/副作用/异常（必要时用 `@throws`）
   - 默认值与配置项含义

### TSDoc 使用范围

- **必须用 TSDoc**：对外导出的服务、调度器、核心运行时、协议类型（例如 dispatcher/runtime/handler/contracts）。
- **可用行内注释即可**：内部小工具函数、纯粹的类型收敛/判空。
- **禁止**：逐行翻译式注释（读代码就知道的那种）。

### 评审门槛

- 若评审指出“缺少关键语义注释/难以理解”，视为 **must-fix**（与逻辑 bug 同级处理）。

### Step C：分支决策

- 若结论为 `merge-ready`：
  - 运行最终验证（相关测试 + build）
  - 结束循环并给出集成选项（PR / merge / cleanup）
- 若结论为 `not merge-ready`：
  - 提取 must-fix，进入下一轮 Step A

---

## 验证规则（禁止口头通过）

每轮实现后至少执行：

- 能覆盖本轮改动的最小测试集
- 若涉及契约/文档：执行 `tests/http-api-v1-docs-coverage.test.ts`（或等效）和文档校验

宣布 merge-ready 前必须执行：

- 覆盖改动范围的根测试
- `npm run build`
- 若改了 web：`npm --prefix web run build`

---

## 失败处理（仅此可临时跳过子代理）

当子代理调用出现 `resource_exhausted`：

1. 短暂停顿后重试一次
2. 仍失败则进行手工 spec 对照审查：
   - 每个验收点映射到“代码位置 + 测试证据”
   - 缺口整理为 must-fix
3. 在资源恢复前可临时人工继续，但恢复后应回到子代理循环

---

## Prompt 模板

### 实现子代理（generalPurpose）

```text
Execute spec-driven fixes in INLINE mode (single run).

Repo/worktree: <PATH>
Branch: <BRANCH>
Spec: <SPEC_PATH>
Plan (optional): <PLAN_PATH>

Must-fix items from last CR:
- ...

Constraints:
- Inline mode; commit logically
- Run targeted tests/builds
- Do not revert unrelated work

Return exactly:
1) Implemented items and remaining gaps
2) Commits (sha + message)
3) Verification commands + pass/fail
4) Blockers (if any)
```

### 评审子代理（code-reviewer）

```text
Review conformance against spec.

Repo/worktree: <PATH>
Spec: <SPEC_PATH>
BASE_SHA: <SHA>
HEAD_SHA: <SHA>

Output:
1) Findings by severity with file refs
2) Completion matrix
3) Must-fix list
4) Verdict: merge-ready or not
```

---

## 备注

- spec 是唯一事实来源；若实现要偏离，先更新 spec 再实施
- 每轮优先小而可回滚的提交
- inline-loop 产出的实现代码默认应具备可读注释；若评审指出“可维护性差/难理解”，视为 must-fix
