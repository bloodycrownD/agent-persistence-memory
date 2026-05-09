# `tableStatusContainer` 挂载实现调研

## 日期

2026-05-06（迁移整理）

## 背景

需要明确 `demo1.js` 如何把 `#tableStatusContainer` 挂载到聊天区域最底部，以及它在消息接收/编辑/滑动/删除等事件下如何更新，便于后续维护与避免 UI/事件泄漏问题。

## 结论 / 事实

- **事件驱动更新**：监听 `MESSAGE_RECEIVED / MESSAGE_EDITED / MESSAGE_SWIPED / MESSAGE_DELETED / CHAT_COMPLETION_PROMPT_READY`，触发解析并更新表格状态。
- **核心链路**：
  - `handleEditStrInMessage` → `parseTableEditTag` → `executeTableEditTag` → `updateSystemMessageTableStatus` → `replaceTableToStatusTag`
- **挂载位置本质**：不是插到“最后一条消息内部”，而是插到 `#chat` 容器的末尾（`insertAdjacentHTML('beforeend', ...)`），因此视觉上始终在最底部。
- **清理与隔离**：
  - 更新前移除旧的 `#tableStatusContainer` 并解绑触摸事件，避免重复监听与内存泄漏
  - 通过 `touchstart/touchmove/touchend` 的 `stopPropagation()` 阻止触摸影响聊天滚动
- **安全处理**：`escapeIframeContent` 通过 `srcdoc` 转义 iframe 内容，降低 XSS 风险。

## 影响 / 下一步

- 若后续要把状态栏改成更“贴近某条消息”的渲染方式，需要调整挂载点（从 `#chat` beforeend 改为目标消息节点内部/之后），同时重做事件清理策略。
- 建议把“事件监听器注册/注销”封装成可复用生命周期函数，确保扩展禁用/切换聊天时能彻底清理。

---

## 附录：原文（从 `docs/sillytavern/状态栏挂载原理.md` 迁移）

﻿# tableStatusContainer 挂载实现调研报告

## 概述

本文档详细说明了 `demo1.js` 文件中如何将 `#tableStatusContainer` 挂载到最后一条消息上的完整实现流程。

---

## 核心实现流程

### 1. 事件监听器注册

**位置**: `src/components/demo/demo1.js:3563-3567`

在插件初始化时注册了四个关键事件监听器：

```javascript
eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
eventSource.on(event_types.MESSAGE_EDITED, onMessageEdited);
eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
eventSource.on(event_types.MESSAGE_DELETED, onMessageDeleted);
```

这些事件监听器会在以下情况触发：
- **MESSAGE_RECEIVED**: 收到新的 AI 回复消息时
- **MESSAGE_EDITED**: 用户编辑消息内容时
- **MESSAGE_SWIPED**: 用户滑动切换不同版本的 AI 回复时
- **MESSAGE_DELETED**: 用户删除消息时
- **CHAT_COMPLETION_PROMPT_READY**: 聊天完成提示词准备就绪时

---

### 2. 事件处理函数

#### 2.1 onMessageReceived

**位置**: `src/components/demo/demo1.js:1739-1748`

```javascript
async function onMessageReceived(chat_id) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.isAiWriteTable === false) return
    const chat = getContext().chat[chat_id];
    console.log("收到消息", chat_id)
    try {
        handleEditStrInMessage(chat)
    } catch (error) {
        toastr.error("记忆插件：表格自动更改失败\n原因：", error.message)
    }
}
```

**功能**：当收到新消息时，解析并执行其中的表格编辑标签，然后更新表格状态显示。

#### 2.2 onMessageEdited

**位置**: `src/components/demo/demo1.js:1710-1718`

```javascript
async function onMessageEdited(this_edit_mes_id) {
    const chat = getContext().chat[this_edit_mes_id]
    if (chat.is_user === true || extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.isAiWriteTable === false) return
    try {
        handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
    } catch (error) {
        toastr.error("记忆插件：表格编辑失败\n原因：", error.message)
    }
}
```

**功能**：当消息被编辑时，重新处理其中的表格编辑标签，并更新状态显示。

#### 2.3 onMessageSwiped

**位置**: `src/components/demo/demo1.js:2464-2473`

```javascript
async function onMessageSwiped(chat_id) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.isAiWriteTable === false) return
    const chat = getContext().chat[chat_id];
    if (!chat.swipe_info[chat.swipe_id]) return
    try {
        handleEditStrInMessage(chat)
    } catch (error) {
        toastr.error("记忆插件：swipe切换失败\n原因：", error.message)
    }
}
```

**功能**：当用户滑动切换不同版本的 AI 回复时，更新表格状态。

#### 2.4 onMessageDeleted

**位置**: `src/components/demo/demo1.js:1724-1733`

```javascript
async function onMessageDeleted() {
    const { index } = findLastestTableData(true)
    const chat = getContext().chat[index]
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) return
    try {
        handleEditStrInMessage(chat, -1, true)
    } catch (error) {
        toastr.error("记忆插件：消息删除时表格更新失败\n原因：", error.message)
    }
}
```

**功能**：当消息被删除时，重新处理最新的表格数据。

---

### 3. 表格编辑处理函数

#### 3.1 handleEditStrInMessage

**位置**: `src/components/demo/demo1.js:1413-1420`

```javascript
function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    if (!parseTableEditTag(chat, mesIndex, ignoreCheck)) {
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        return
    }
    executeTableEditTag(chat, mesIndex)
    updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
}
```

**功能**：
1. 解析消息中的 `<tableEdit>` 标签
2. 执行表格编辑操作（插入/更新/删除行）
3. 调用 `updateSystemMessageTableStatus()` 更新显示

---

### 4. 状态更新函数

#### 4.1 updateSystemMessageTableStatus

**位置**: `src/components/demo/demo1.js:2748-2765`

```javascript
function updateSystemMessageTableStatus(eventData) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.isTableToChat === false) {
        window.document.querySelector('#tableStatusContainer')?.remove();
        return;
    }

    const tables = findLastestTableData(true).tables;
    let tableStatusHTML = '';
    for (let i = 0; i < tables.length; i++) {
        const structure = findTableStructureByIndex(i);
        if (!structure.enable || !structure.toChat) continue;
        // 如果有自定义渲染器，则使用自定义渲染器，否则使用默认渲染器
        tableStatusHTML += structure.tableRender
            ? parseTableRender(structure.tableRender, tables[i])
            : tables[i].render().outerHTML;
    }
    replaceTableToStatusTag(tableStatusHTML);
}
```

**功能**：
1. 检查扩展是否启用以及是否需要显示表格到聊天中
2. 查找最新的表格数据
3. 遍历所有启用的表格，生成 HTML 内容
4. 调用 `replaceTableToStatusTag()` 将 HTML 挂载到聊天界面

---

### 5. 核心 DOM 挂载函数

#### 5.1 replaceTableToStatusTag

**位置**: `src/components/demo/demo1.js:2707-2743`

这是**最核心的函数**，负责将 `#tableStatusContainer` 挂载到聊天界面的最后位置。

```javascript
function replaceTableToStatusTag(tableStatusHTML) {
    // 1. 使用模板字符串将表格 HTML 嵌入到 to_chat_container 模板中
    const r = extension_settings.muyoo_dataTable.to_chat_container.replace(/\$0/g, `<tableStatus>${tableStatusHTML}</tableStatus>`);

    // 2. 获取聊天容器
    const chatContainer = window.document.querySelector('#chat');

    // 3. 查找现有的 tableStatusContainer
    let tableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');

    // 4. 定义具名的事件监听器函数（用于阻止触摸事件冒泡）
    const touchstartHandler = function (event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function (event) {
        event.stopPropagation();
    };
    const touchendHandler = function (event) {
        event.stopPropagation();
    };

    // 5. 使用 setTimeout 确保在下一个事件循环中执行
    setTimeout(() => {
        // 6. 如果存在旧的 tableStatusContainer，先移除它及其事件监听器
        if (tableStatusContainer) {
            tableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            tableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            tableStatusContainer.removeEventListener('touchend', touchendHandler);
            chatContainer.removeChild(tableStatusContainer); // 移除旧的 tableStatusContainer
        }

        // 7. 【关键步骤】使用 insertAdjacentHTML 将新的 tableStatusContainer 插入到聊天容器的末尾
        chatContainer.insertAdjacentHTML('beforeend', `<div class="wide100p" id="tableStatusContainer">${escapeIframeContent(r)}</div>`);

        // 8. 获取新创建的 tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');

        // 9. 为新元素添加触摸事件监听器（阻止事件冒泡，防止触摸操作影响聊天滚动）
        if (newTableStatusContainer) {
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }

        // 10. 更新 tableStatusContainer 变量指向新的元素，以便下次移除
        tableStatusContainer = newTableStatusContainer;
    }, 0);
}
```

**关键点说明**：

| 步骤 | 说明 | 代码位置 |
|------|------|----------|
| 获取聊天容器 | 使用 `querySelector('#chat')` 获取聊天主容器 | 2709 行 |
| 查找旧元素 | 使用 `querySelector('#tableStatusContainer')` 查找现有元素 | 2710 行 |
| 移除旧元素 | 使用 `removeChild()` 移除旧元素 | 2729 行 |
| 挂载新元素 | **使用 `insertAdjacentHTML('beforeend', ...)` 插入到容器末尾** | 2731 行 |
| 添加事件监听 | 添加触摸事件监听器阻止事件冒泡 | 2736-2738 行 |

**insertAdjacentHTML 方法详解**：
- `beforeend`：将 HTML 字符串插入到目标元素的**最后一个子元素之后**
- 这确保了 `#tableStatusContainer` 始终显示在聊天内容的最下方

---

### 6. 辅助函数

#### 6.1 escapeIframeContent

**位置**: `src/components/demo/demo1.js:2683-2702`

```javascript
function escapeIframeContent(input) {
    // 匹配 <iframe> 标签及其内容
    return input.replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe>/gi, (match, attributes, content) => {
        // 转义内容中的特殊字符
        const escapedContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // 如果已有 srcdoc 属性，保留原属性并添加转义内容
        if (/<iframe\b[^>]*\bsrcdoc=/i.test(match)) {
            return match; // 已有 srcdoc，不做处理
        }

        // 返回新的 iframe，添加 srcdoc 属性
        return `<iframe${attributes} srcdoc="${escapedContent}"></iframe>`;
    });
}
```

**功能**：转义 iframe 内容中的特殊字符，防止 XSS 攻击。

---

## 完整调用链

```
事件触发
    ↓
onMessageReceived / onMessageEdited / onMessageSwiped / onMessageDeleted
    ↓
handleEditStrInMessage
    ↓
parseTableEditTag (解析表格编辑标签)
    ↓
executeTableEditTag (执行表格编辑操作)
    ↓
updateSystemMessageTableStatus (核心更新函数)
    ↓
findLastestTableData (查找最新表格数据)
    ↓
tables[i].render() (生成表格 HTML)
    ↓
replaceTableToStatusTag (核心挂载函数)
    ↓
chatContainer.insertAdjacentHTML('beforeend', ...) (挂载到聊天容器末尾)
```

---

## 挂载位置详解

### 为什么是"挂载到最后一条消息"？

实际上，`#tableStatusContainer` 并不是挂载到某条消息的内部，而是挂载到 `#chat` 容器的**末尾**（最后一个子元素之后）。

**实现原理**：
1. `#chat` 是整个聊天区域的主容器
2. 每条消息（用户消息或 AI 消息）都是 `#chat` 的子元素
3. 使用 `insertAdjacentHTML('beforeend', ...)` 将 `#tableStatusContainer` 插入到 `#chat` 的所有子元素之后
4. 因此，`#tableStatusContainer` 始终显示在聊天界面的最底部

**视觉效果**：
```
#chat (容器)
├── 第一条消息
├── 第二条消息
├── ...
├── 最后一条消息
└── #tableStatusContainer ← 挂载在这里，显示在所有消息下方
```

---

## 其他调用场景

除了事件触发外，`updateSystemMessageTableStatus` 还在以下场景被调用：

| 场景 | 位置 | 说明 |
|------|------|------|
| 设置修改 | 2209 行 | 修改表格设置后更新显示 |
| 粘贴表格 | 2505 行 | 粘贴表格数据后更新显示 |
| 导入表格 | 2554 行 | 导入表格文件后更新显示 |
| 聊天完成提示准备 | 1625 行 | 在生成新回复前更新状态 |
| 手动刷新 | 3202、3412、3434、3453 行 | 手动触发刷新操作 |

---

## 总结

`#tableStatusContainer` 挂载到最后一条消息的实现要点：

1. **事件驱动**：通过监听 SillyTavern 的事件系统（消息接收、编辑、滑动、删除）
2. **更新机制**：在事件触发后，查找最新的表格数据并重新生成 HTML
3. **DOM 操作**：使用 `insertAdjacentHTML('beforeend', ...)` 将新元素插入到聊天容器末尾
4. **清理机制**：每次更新前移除旧元素及其事件监听器，避免内存泄漏
5. **事件隔离**：为新元素添加触摸事件监听器，阻止事件冒泡，防止影响聊天滚动

这种设计确保了 `#tableStatusContainer` 始终显示在聊天界面的最底部，实时反映最新的表格状态。
