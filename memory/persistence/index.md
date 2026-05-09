# 持久记忆总索引

按日期归档的长期知识库，提供“关键词 + 摘要 + 入口”快速检索。

---

## 2026-05-07

### 当日摘要

- **主题**：VFS 扩展挂载故障排查与修复闭环；文档归档与迭代索引
- **关键词**：`VFS` `挂载失败` `process is not defined` `SillyTavern` `dist/index.js`
- **结论**：根因是浏览器环境缺失 `process`，修复后扩展入口、挂载点和配置页均可正常生效。

### 记录入口

- [VFS 挂载失败与修复原因复盘](./20260507/records/VFS-挂载失败与修复原因复盘.md)
  - 关键词：`运行时异常` `process shim` `挂载链路`
  - 摘要：记录从“脚本已加载但界面不显示”到“定位根因并恢复 `manifest -> dist/index.js`”的完整过程。

- [VFS 文档归档结构与迭代索引](./20260507/records/VFS-文档归档结构与迭代索引.md)
  - 关键词：`docs/archive` `Iterations` `spec-plan`
  - 摘要：`docs/archive/20260507` 下三类需求快照路径及与 `Iterations` 的关系。

- [项目结构 - VFS 序列化实现后](./20260507/records/项目结构-VFS序列化实现后.md)
  - 关键词：`项目结构` `VFS Core` `Repository` `Serialization`
  - 摘要：记录序列化实现完成后的分层目录与职责边界，明确后续 ST 适配与版本能力扩展路径。

- [当日索引（2026-05-07）](./20260507/index.md)
  - 关键词：`日索引`
  - 摘要：05-07 当天全部持久记忆入口。

---

## 2026-05-09

### 当日摘要

- **主题**：虚拟工作树 UI（所见即所得）迭代交接；spec/plan/task 治理与关键决策定版
- **关键词**：`虚拟工作树UI` `Iterations` `spec-plan-task` `extraMesButtons` `toastr` `sanitize loose` `分页日志` `回滚记提交`
- **结论**：形成可复用的“拆分 spec + 3 plan + 并发 task + inline-loop 收敛”工作流，并将关键产品/工程约束写入交接记录，便于清空上下文后快速恢复。

### 记录入口

- [VFS 虚拟工作树 UI 迭代交接记录（2026-05-09）](./20260509/records/VFS-虚拟工作树UI迭代-交接记录.md)
  - 关键词：`交接` `决策` `路径索引`
  - 摘要：总结本次会话新增的关键决策、文档产出位置、重要代码触点与注意事项。

- [VFS Iterations 全量归档（2026-05-09）](./20260509/records/VFS-Iterations全量归档-20260509.md)
  - 关键词：`docs/archive` `Iterations` `全量归档` `索引维护`
  - 摘要：记录将 Iterations 中全部需求目录归档到 `docs/archive/20260509/` 并清空 Iterations 冗余副本的事实与约定。

- [当日索引（2026-05-09）](./20260509/index.md)
  - 关键词：`日索引`
  - 摘要：05-09 当天全部持久记忆入口。

---

## 2026-05-06

### 当日摘要

- **主题**：SillyTavern UI 扩展基础能力与常见前端问题沉淀
- **关键词**：`UI Extensions` `事件系统` `挂载原理` `CSS Sticky` `移动端弹窗`
- **结论**：形成了可复用的 API/事件认知与样式问题解法，为后续扩展开发提供基础知识库。

### 记录入口

- [SillyTavern UI 扩展 API 要点](./20260506/records/SillyTavern-UI扩展-API要点.md)
  - 关键词：`API` `扩展上下文` `设置保存`
  - 摘要：整理扩展开发常用上下文能力和接口调用方式。

- [SillyTavern 事件系统](./20260506/records/SillyTavern-事件系统.md)
  - 关键词：`eventSource` `事件订阅`
  - 摘要：归纳消息流与事件监听机制，便于功能触发设计。

- [`tableStatusContainer` 挂载实现调研](./20260506/records/SillyTavern-tableStatusContainer挂载原理.md)
  - 关键词：`挂载点` `DOM结构` `注入时机`
  - 摘要：说明页面中的容器结构和扩展 UI 注入位置。

- [SillyTavern 官方文档：UI Extensions（归档）](./20260506/records/SillyTavern-官方文档-UI-Extensions.md)
  - 关键词：`官方文档` `规范`
  - 摘要：归档官方资料要点，作为实现参考基线。

- [Sticky 定位失效问题解决方案](./20260506/records/CSS-Sticky定位失效-解决方案.md)
  - 关键词：`sticky` `滚动容器` `布局`
  - 摘要：定位 Sticky 不生效的典型条件与修复路径。

- [表格 Sticky 布局层级冲突解决方案](./20260506/records/CSS-表格Sticky层级冲突-解决方案.md)
  - 关键词：`z-index` `层级冲突` `table`
  - 摘要：处理表格场景下 Sticky 与层叠上下文冲突问题。

- [移动端弹窗溢出问题解决方案](./20260506/records/UI-移动端弹窗溢出-解决方案.md)
  - 关键词：`mobile` `弹窗` `overflow`
  - 摘要：给出移动端弹窗布局与边界控制方案。

- [原始项目结构（归档）](./20260506/records/项目结构-原始项目结构.md)
  - 关键词：`项目结构` `基线`
  - 摘要：保存项目初始结构，用于后续演进对照。

- [当日索引（2026-05-06）](./20260506/index.md)
  - 关键词：`日索引`
  - 摘要：05-06 当天全部持久记忆入口。

---

> 维护规则：新增日期时创建 `memory/persistence/<yyyyMMdd>/index.md`，并在本文件追加“当日摘要 + 记录入口（关键词/摘要）”。
