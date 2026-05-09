# VFS 虚拟工作树 UI 迭代交接记录（2026-05-09）

本记录用于在清空上下文/换人协作时快速恢复关键上下文，聚焦“已确认决策、产出物、实现状态与下一步”。

## 迭代主题

- **需求**：虚拟工作树 UI 所见即所得（移动端为主，桌面端增强映射）
- **入口**：`.extraMesButtons` 挂载按钮 → 弹窗 3 Tabs（文件管理器 / 提交记录 / 日志）

## 已确认的关键决策（需要长期记住）

- **挂载与生命周期**：`.extraMesButtons` + jQuery，幂等挂载检查，`on/off` 成对清理（避免重复事件、内存泄漏）。
- **渲染与安全**：阅读页与预览页共用渲染链路；sanitize 默认 `loose`，禁用高风险能力（如 `style/iframe/object/embed/form`），移除内联事件与危险协议。
- **日志**：仅分页，默认 20/页；默认手动刷新；消息编辑/收到消息触发自动刷新一次。
  - **补充澄清（重要）**：若事件发生时 Tab3 未激活，可延迟到 Tab3 首次激活时执行一次刷新（仅一次）。
- **错误反馈**：统一 `toastr`；仅 `toastr.error` 展示错误码；格式 `[E_<REASON>] 人类可读错误信息`；不提供重试按钮。
- **回滚语义**：不做前置冲突拦截，以执行结果为准；回滚成功视为一次新提交并记录来源版本信息。

## 需求/设计文档产出（唯一事实来源）

位于 `docs/Iterations/虚拟工作树UI所见即所得/`：

- `spec.md`：总览索引（精简版）
- `spec-ui-ia.md`：交互与信息架构
- `spec-state-history.md`：状态机与提交回滚
- `spec-engineering-mount.md`：挂载与工程实现
- `plan-*.md`：三份可执行实现方案
- `task.md`：并发/子代理任务拆分与共享契约（接口/事件/错误码/目录边界）

## 实现与验证（工程层面）

- **开发方式**：采用 `subagent-inline-loop`（实现子代理 → 评审子代理 → 循环收敛），以 spec 为唯一事实来源。
- **验证命令**：
  - `npm run test:run -- test/vfs-ui-contracts.spec.ts test/vfs-ui-cr-loop.spec.ts test/rollback-actions.provenance.spec.ts`
  - `npm run build`
- **测试覆盖方向**：More 菜单动作可见性、编辑未保存退出提示、日志分页/刷新、回滚 provenance 等。

## 重要代码触点（便于快速定位）

- **挂载入口**：
  - `src/app/composables/screens-composables/useVfsEntryMount.ts`
  - `src/app/bootstrap/mountVfsEntry.ts`
  - `src/app/bootstrap/unmountVfsEntry.ts`
  - `src/main.ts`
- **弹窗与 Tabs**：
  - `src/app/screens/pure-screens/VfsTabShellScreen.vue`
- **Tab1 文件管理器/阅读/编辑/幻灯片**：
  - `src/app/screens/business-screens/VfsMainScreen.vue`
  - `src/app/components/business-components/VfsActionMenu.vue`
  - `src/app/screens/pure-screens/ReaderScreen.vue`
  - `src/app/screens/pure-screens/EditorScreen.vue`
  - `src/app/screens/pure-screens/SlideshowScreen.vue`
- **Tab2 提交记录与回滚**：
  - `src/app/screens/business-screens/VfsHistoryScreen.vue`
  - `src/app/components/business-components/VfsCommitTab.vue`
  - `src/app/composables/components-composables/useVfsRollbackActions.ts`
- **Tab3 日志**：
  - `src/app/components/business-components/VfsLogPanel.vue`
  - `src/app/composables/components-composables/useVfsMessageHooks.ts`
- **渲染与 sanitize**：
  - `src/app/services/vfs/renderPipeline.ts`
  - `src/app/services/vfs/sanitizeConfig.ts`
- **错误码/Toast 统一格式**：
  - `src/app/constants/vfsErrorCodes.ts`
  - `src/app/utils/vfsErrorMapper.ts`

## 风险与注意事项（清空上下文后最容易踩坑的点）

- **PowerShell**：链式命令不要用 `&&`，用 `;`。
- **Tabs3 刷新语义**：默认手动刷新 != 不允许自动刷新；允许“延迟到进入 Tab3 执行一次”的策略。
- **回滚 provenance**：批量回滚需记录“应用目标版本”与“选择列表”，避免来源版本含混。
- **一致性**：回滚后需要触发多视图刷新（文件树/阅读/编辑/历史），避免 UI 仅局部更新造成错觉。

