# VFS 挂载失败与修复原因复盘

## 日期

2026-05-07

## 背景

`st-virtual-file-system` 初始已配置 `manifest.json -> dist/index.js` 并执行了 `vite build`，但在 SillyTavern 页面中看不到配置面板，且控制台最初没有出现预期日志，需定位“为何未生效”以及“为何后续生效”。

## 结论 / 事实

1. 首次失败的直接原因是运行时异常：`Uncaught ReferenceError: process is not defined`（来自 `shared.esm-bundler.js`）。
2. 该异常发生在 Vue 运行时代码执行早期，导致后续挂载逻辑未执行，表现为“没有挂载、没有业务日志”。
3. 通过增加 loader 诊断链路确认：
   - `manifest` 脚本确实被 SillyTavern 加载；
   - `dist/index.js` 也被请求并执行到入口；
   - 失败点不是扩展扫描或挂载节点缺失，而是 JS 运行时环境缺失 `process`。
4. 生效的关键修复有两层：
   - 临时阶段：在 loader 中注入 `globalThis.process = { env: {} }`，让 bundle 可执行；
   - 最终阶段：将兼容固化到构建产物（`vite` 输出中注入 `process` shim），并恢复 `manifest.json` 直接指向 `dist/index.js`。
5. 修复后日志链路完整：入口执行、`#extensions_settings` 存在、Vue app 成功 mount，页面配置开关可见。

## 影响 / 下一步

- 影响：
  - 确认 SillyTavern 扩展环境下，Vue/Vite bundle 可能需要显式处理 `process` 兼容，不能默认依赖 Node 风格全局对象。
  - 后续同类扩展可直接复用该兼容方案，减少“脚本加载但 UI 不显示”的排障时间。
- 下一步：
  - 保持 `manifest -> dist/index.js` 的最终形态；
  - 新扩展初始化时优先验证三件事：脚本是否加载、入口是否执行、挂载点是否存在；
  - 若再次出现“加载成功但页面不显示”，先检查控制台是否存在 `process` 或其他全局对象缺失错误。
