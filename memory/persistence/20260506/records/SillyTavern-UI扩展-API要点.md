# SillyTavern UI 扩展 API 要点

## 日期

2026-05-06（迁移整理）

## 背景

本项目作为 SillyTavern 的第三方扩展，需要依赖 ST 的扩展机制（`manifest.json`）与浏览器侧 API（`SillyTavern.getContext()`、事件系统、提示拦截器等）。把关键点沉淀到 memory，方便开发时快速查阅与对齐最佳实践。

## 结论 / 事实

- **扩展入口**：通过 `manifest.json` 声明 `display_name/js/css/loading_order/dependencies/...` 等。
- **核心上下文**：`SillyTavern.getContext()` 提供 `chat/characters/extensionSettings/chatMetadata/saveChat/saveMetadata/...`。
- **持久化与绑定范围**：
  - 扩展设置：`extensionSettings[MODULE_NAME]` + `saveSettingsDebounced()`
  - 绑定聊天：`chatMetadata[...]` + `saveMetadata()`
  - 绑定角色卡：`writeExtensionField(characterId, key, data)`
- **事件系统**：`eventSource.on(event_types.XXX, handler)` 监听消息、聊天切换、设置更新等事件。
- **UI 交互**：`Popup`、`toastr`、以及直接 DOM/jQuery 操作。
- **生成相关**：
  - `generateRaw`（无聊天上下文）
  - `generateQuietPrompt`（在当前聊天上下文静默生成）
  - JSON Schema 结构化输出（依赖后端能力）
  - **提示拦截器**：`manifest.json` 注册 `generate_interceptor`，在发送前修改 `chat` 或 `abort()`。
- **最佳实践**：
  - 不要把密钥存 `extensionSettings`
  - 大数据用 `localforage`
  - 及时清理事件监听器避免泄漏
  - 优先使用 `getContext()` 而非内部模块 import（稳定性更好）

## 影响 / 下一步

- 在本项目开发中，所有 ST 交互优先基于 `getContext()` 与事件系统封装，减少对 ST 内部实现细节的耦合。
- 若要实现“生成前注入/拦截”，统一走提示拦截器方案，并记录拦截器对 chat 的修改规则，避免与其他扩展冲突。

---

## 附录：原文（从 `docs/sillytavern/Api文档.md` 迁移）

(原文较长，已完整迁移；以下为原文内容。)

# SillyTavern UI 扩展 API 文档

## 概述

UI 扩展通过接入 SillyTavern 的事件和 API 来增强其功能。它们运行在浏览器环境中，可以几乎无限制地访问 DOM、JavaScript API 以及 SillyTavern 的核心上下文。扩展可以修改 UI、调用内部 API 并与聊天数据交互。本指南将解释如何创建您自己的扩展（需要 JavaScript 知识）。

## 核心概念：`manifest.json`

每个扩展都必须在其位于 `data/<user-handle>/extensions` 的文件夹中包含一个 `manifest.json` 文件。该文件包含了扩展的元数据，并指定了作为入口点的 JS 脚本文件。

```json
{
    "display_name": "扩展的显示名称",
    "loading_order": 1,
    "js": "constant.js",
    "css": "style.css",
    "author": "你的名字",
    "version": "1.0.0",
    "dependencies": [],
    "generate_interceptor": "myCustomInterceptorFunction",
    "minimum_client_version": "1.0.0",
    "i18n": {
        "zh-cn": "i18n/zh-cn.json"
    }
}
```

### 主要清单字段

*   `display_name` (必需): 显示在“扩展管理”菜单中的名称。
*   `js` (必需): 主要的 JavaScript 入口文件。
*   `css` (可选): 样式的 CSS 文件。
*   `author` (必需): 作者的名称或联系信息。
*   `loading_order` (可选): 加载顺序，数字越大加载越晚。这会影响事件监听器和拦截器的执行顺序。
*   `dependencies` (可选): 一个字符串数组，指定此扩展所依赖的其他**扩展**的**文件夹名称**。如果依赖项缺失或被禁用，此扩展将不会加载。
*   `generate_interceptor` (可选): 一个字符串，指定一个在文本生成请求时调用的全局函数名称（详见“提示拦截器”部分）。
*   `minimum_client_version` (可选): 运行此扩展所需的最低 SillyTavern 版本。
*   `i18n` (可选): 一个对象，指定支持的语言及其对应的翻译文件路径（详见“国际化”部分）。

## 核心 API：`SillyTavern` 全局对象

所有核心功能都通过全局的 `SillyTavern` 对象暴露出来。

### 1. 上下文与状态管理 (Context & State Management)

#### `SillyTavern.getContext()`

这是获取 SillyTavern 核心状态和功能的最主要方式。它返回一个上下文对象，其中包含：

*   `chat`: 当前聊天记录数组 (可变)。
*   `characters`: 角色列表。
*   `characterId`: 当前角色的索引。
*   `groups`: 分组列表。
*   `groupId`: 当前分组的 ID。
*   `extensionSettings`: 用于存储所有扩展持久化设置的对象。
*   `chatMetadata`: 用于存储与当前聊天绑定的元数据。
*   `saveChat()`: 保存聊天状态的方法。
*   ...以及更多。

```javascript
const context = SillyTavern.getContext();
console.log(context.chat); // 打印当前聊天记录
```

#### 修改聊天记录 (Modifying Chat History)

扩展可以直接读取和修改 `context.chat` 数组中的消息。这是一个强大的功能，可用于实现自定义的编辑、过滤或内容增强。

**请注意：** 直接修改聊天数据后，UI **不会**自动更新。您可能需要采取额外措施（例如，重新渲染相关消息）来反映这些变化。

```javascript
// 获取聊天上下文
const context = SillyTavern.getContext();

// 假设我们要修改索引为 5 的消息
const messageIndex = 5;
const message = context.chat[messageIndex];

if (message) {
    // 修改消息正文
    message.mes = "这是通过扩展修改后的内容。";

    // 如果需要修改当前选中的“滑动”（swipe）内容
    // chat.swipes 是一个包含所有备选消息的数组
    if (message.swipes && message.swipe_id !== undefined) {
        message.swipes[message.swipe_id] = "修改后的 swipe 内容";
    }

    // !! 非常重要：修改完成后，必须调用 saveChat() 来持久化更改
    context.saveChat();

    toastr.success(`消息 #${messageIndex} 已更新！`);
}
```

#### 持久化设置 (Persistent Settings)

扩展应使用 `extensionSettings` 对象来存储其配置。为避免冲突，请使用一个唯一的键（通常是你的扩展名）。

```javascript
const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();

// 为你的扩展定义一个唯一的名称
const MODULE_NAME = 'my_awesome_extension';

// 定义默认设置
const defaultSettings = {
    enabled: true,
    someOption: 'default_value',
};

// 初始化或获取设置
if (!extensionSettings[MODULE_NAME]) {
    extensionSettings[MODULE_NAME] = { ...defaultSettings };
}
const settings = extensionSettings[MODULE_NAME];

// 修改设置
settings.someOption = 'new_value';

// 保存设置（函数已做防抖处理，可频繁调用）
saveSettingsDebounced();
```

#### 聊天元数据 (Chat Metadata)

如果你需要将某些数据与**特定聊天**绑定，请使用 `chatMetadata`。

**注意：** 当切换聊天时，`chatMetadata` 的引用会改变。请始终通过 `SillyTavern.getContext().chatMetadata` 访问。

```javascript
const { chatMetadata, saveMetadata } = SillyTavern.getContext();

// 为当前聊天设置元数据
chatMetadata['my_extension_data'] = { progress: 50 };

// 保存元数据
await saveMetadata();
```

#### 角色卡数据 (Character Card Data)

扩展可以将数据直接写入角色卡的 `extensions` 字段，这样数据就可以随角色卡一起导出和分享。

```javascript
const { writeExtensionField, characterId, characters } = SillyTavern.getContext();

// 仅在非群聊且有角色选中时 characterId 才有效
if (characterId !== undefined) {
    // 写入数据到当前选定角色的卡片
    await writeExtensionField(characterId, 'my_extension_key', { someData: 'value' });

    // 读取数据
    const character = characters[characterId];
    const myData = character.data?.extensions?.my_extension_key;
}
```

### 2. 事件系统 (Event System)

SillyTavern 拥有一个强大的事件系统，允许扩展对应用内的各种行为做出反应。

*   `eventSource`: 事件发射器实例，用于监听和触发事件。
*   `event_types`: 包含所有可用事件类型的枚举对象。

#### 监听事件

```javascript
const { eventSource, event_types } = SillyTavern.getContext();

function handleMessage(data) {
    console.log('AI message received:', data.message);
}

// 监听 AI 消息接收事件
eventSource.on(event_types.MESSAGE_RECEIVED, handleMessage);
```

**常用事件类型:**

*   `APP_READY`: 应用完全加载并准备就绪时触发。
*   `MESSAGE_SENT`: 用户发送消息后触发。
*   `MESSAGE_RECEIVED`: AI 生成消息后触发。
*   `MESSAGE_EDITED`: 消息被编辑后触发。
*   `MESSAGE_DELETED`: 消息被删除后触发。
*   `CHAT_CHANGED`: 切换角色或聊天时触发。
*   `SETTINGS_UPDATED`: 应用设置更新后触发。
*   `GENERATION_STOPPED`: 用户停止生成时触发。

#### 触发事件

你也可以从扩展中触发自定义或内置事件。

```javascript
const { eventSource } = SillyTavern.getContext();

// 触发自定义事件，并传递数据
await eventSource.emit('myCustomEvent', { detail: 'some data' });
```

### 3. UI 与交互 (UI & Interaction)

#### 弹窗 (Popups)

SillyTavern 提供了一个灵活的弹窗系统。

```javascript
const { Popup } = SillyTavern.getContext();

// 1. 简单的确认弹窗
const confirmed = await Popup.show.confirm('确认', '你确定要删除吗？');
if (confirmed) {
    console.log('User confirmed.');
}

// 2. 输入弹窗
const userInput = await Popup.show.input('输入', '请输入你的名字：', '默认值');
if (userInput) {
    console.log('User entered:', userInput);
}

// 3. 自定义 HTML 内容弹窗
const htmlContent = '<div><h1>自定义标题</h1><p>这是一个自定义弹窗。</p></div>';
const customPopup = new Popup(htmlContent, {
    title: '自定义弹窗',
    buttons: [
        {
            text: '自定义按钮',
            class: 'primary',
            action: (popup) => {
                console.log('Custom button clicked');
                popup.close();
            },
        },
    ],
});
await customPopup.show();
```

#### 通知 (Notifications)

使用 `toastr` 来显示短暂的、非阻塞性的通知。

```javascript
// 成功通知
toastr.success('设置已成功保存！');

// 错误通知
toastr.error('连接服务器失败。');

// 警告通知
toastr.warning('这个功能仍在实验中。');

// 信息通知
toastr.info('正在处理，请稍候...');
```

### 4. AI 文本生成 (AI Text Generation)

#### `generateRaw(options)`

在没有任何聊天上下文的情况下生成文本。你可以完全控制提示。

```javascript
const { generateRaw } = SillyTavern.getContext();

const result = await generateRaw({
    prompt: '写一个关于勇敢骑士的故事。',
    systemPrompt: '你是一个故事大师。',
    prefill: '从前，', // 预填充内容，AI 会接着写
});

console.log(result);
```

#### `generateQuietPrompt(options)`

在当前聊天上下文中，静默地（即不在 UI 中显示）添加一个提示并生成回复。非常适合用于生成摘要、图像提示等。

```javascript
const { generateQuietPrompt } = SillyTavern.getContext();

const summary = await generateQuietPrompt({
    quietPrompt: '请总结以上对话。',
});

console.log('Chat summary:', summary);
```

#### 结构化输出 (Structured Outputs)

你可以提供一个 JSON Schema，强制模型输出符合该格式的 JSON 字符串。**（注意：目前主要由聊天补全 API 支持，且可用性取决于后端模型）**

```javascript
const { generateRaw } = SillyTavern.getContext();

const jsonSchema = {
    name: 'CharacterState',
    description: '描述角色的当前状态',
    value: {
        '$schema': 'http://json-schema.org/draft-04/schema#',
        'type': 'object',
        'properties': { 'location': { 'type': 'string' }, 'mood': { 'type': 'string' } },
        'required': ['location', 'mood'],
    },
};

const resultString = await generateRaw({
    prompt: '根据对话，分析角色当前的位置和心情，并以 JSON 格式输出。',
    jsonSchema,
});

const resultObject = JSON.parse(resultString); // 需要自行解析和验证
console.log(resultObject.location, resultObject.mood);
```

### 5. 提示拦截器 (Prompt Interceptors)

拦截器允许扩展在生成请求发送前，对即将用于构建提示的聊天数据进行修改、添加注入内容或中止生成。

1.  在 `manifest.json` 中注册拦截器函数名：
    ```json
    "generate_interceptor": "myCustomInterceptorFunction"
    ```
2.  在你的 JS 文件中定义一个同名的全局函数：
    ```javascript
    globalThis.myCustomInterceptorFunction = async function(chat, contextSize, abort, type) {
        // chat: 用于生成提示的消息数组（可直接修改）
        // contextSize: 当前上下文大小（token 数）
        // abort(preventOthers): 调用此函数可中止生成。若参数为 true，后续拦截器将不执行。
        // type: 生成类型 ('quiet', 'regenerate', 'impersonate' 等)

        // 示例：在最后一条用户消息前插入一条系统笔记
        const systemNote = {
            is_user: false,
            name: "系统笔记",
            send_date: Date.now(),
            mes: "这是由我的扩展添加的内容！"
        };
        chat.splice(chat.length - 1, 0, systemNote);

        // 示例：如果聊天内容包含特定词语，则中止生成
        if (chat[chat.length - 1].mes.includes('stop')) {
            abort(true);
        }
    }
    ```

### 6. 自定义宏 (Custom Macros)

你可以注册在角色卡、提示模板等处使用的自定义宏。

```javascript
const { registerMacro, unregisterMacro } = SillyTavern.getContext();

// 注册一个简单的字符串宏 {{fizz}} -> "buzz"
registerMacro('fizz', 'buzz');

// 注册一个动态函数宏
registerMacro('tomorrow', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toLocaleDateString();
});

// 不再需要时，注销宏
unregisterMacro('fizz');
```

### 7. 共享库 (Shared Libraries)

SillyTavern 将一些常用的 npm 库共享在 `SillyTavern.libs` 对象中，方便扩展直接使用，无需自行引入。

*   `lodash`: 功能强大的工具库。
*   `localforage`: 简单的浏览器存储库（IndexedDB/LocalStorage 封装）。
*   `Fuse`: 轻量级的模糊搜索库。
*   `DOMPurify`: HTML 清理库，防止 XSS 攻击。
*   `Handlebars`: 模板引擎。
*   `moment`: 日期/时间处理库。
*   `showdown`: Markdown 到 HTML 的转换器。

```javascript
const { lodash, DOMPurify } = SillyTavern.libs;

// 使用 lodash
const uniqueArray = lodash.uniq([1, 2, 2, 3]);

// 使用 DOMPurify
const sanitizedHtml = DOMPurify.sanitize('<script>alert("xss")</script><b>clean</b>');
```

### 8. DOM 操作

SillyTavern 内部使用 jQuery，你可以直接使用全局的 `$` 对象进行 DOM 操作。

```javascript
// 在扩展设置面板中添加一个按钮
const myButton = $('<button class="primary_button">点击我</button>');
myButton.on('click', () => {
    toastr.success('按钮被点击了！');
});
$('#extensions_settings2').append(myButton); // extensions_settings2 是扩展设置面板的容器
```

## 最佳实践

*   **安全**:
    *   **绝不**在 `extensionSettings` 中存储 API 密钥等敏感信息。
    *   在将用户输入用于 DOM 操作或 API 调用前，务必使用 `DOMPurify` 等工具进行清理。
*   **性能**:
    *   **不要**在 `extensionSettings` 中存储大量数据，应使用 `SillyTavern.libs.localforage`。
    *   在扩展不再需要时，及时清理事件监听器以防内存泄漏。
    *   对于耗时操作，使用 `async/await` 或将任务分解，避免阻塞 UI 线程。
*   **兼容性**:
    *   优先使用 `SillyTavern.getContext()` 而不是从 ST 内部模块直接 `import`，因为前者是更稳定的 API。
    *   为你的设置、宏等使用唯一的、有描述性的名称，避免与其他扩展冲突。
*   **用户体验**:
    *   使用 `toastr` 或 `Popup` 为用户的操作提供清晰的反馈。
    *   在控制台输出日志时，添加统一的前缀，方便调试，但在生产环境中避免输出过多信息。

---
