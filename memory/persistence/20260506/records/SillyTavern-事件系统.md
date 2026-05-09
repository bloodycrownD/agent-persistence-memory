### SillyTavern 事件系统

#### 核心事件类型

```javascript
export const event_types = {
    // 消息相关事件
    MESSAGE_SENT: 'message_sent',                    // 消息发送后
    MESSAGE_RECEIVED: 'message_received',            // AI消息接收后
    USER_MESSAGE_RENDERED: 'user_message_rendered', // 用户消息渲染完成
    CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', // AI消息渲染完成
    MESSAGE_UPDATED: 'message_updated',              // 消息更新
    MESSAGE_DELETED: 'message_deleted',              // 消息删除
    MESSAGE_SWIPED: 'message_swiped',               // 消息滑动切换

    // 生成相关事件
    GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS', // 生成前处理 (关键时机)
    GENERATION_STARTED: 'generation_started',        // 生成开始
    GENERATION_STOPPED: 'generation_stopped',        // 生成停止
    GENERATION_ENDED: 'generation_ended',            // 生成结束

    // 聊天相关事件
    CHAT_CHANGED: 'chat_id_changed',                 // 聊天切换
    CHAT_CREATED: 'chat_created',                    // 新聊天创建

    // 应用相关事件
    APP_READY: 'app_ready',                          // 应用就绪
    SETTINGS_LOADED_AFTER: 'settings_loaded_after'   // 设置加载完成
};
```

#### 事件监听方法

```javascript
import { eventSource, event_types } from '../script.js';

// 基本事件监听
eventSource.on(event_types.MESSAGE_SENT, (messageId) => {
    console.log('消息已发送:', messageId);
});

// 优先级监听 (最先执行)
eventSource.makeFirst(event_types.USER_MESSAGE_RENDERED, (messageId) => {
    console.log('用户消息渲染完成:', messageId);
});

// 最后执行的监听
eventSource.makeLast(event_types.CHARACTER_MESSAGE_RENDERED, (messageId) => {
    console.log('角色消息渲染完成:', messageId);
});
```

### 监听聊天发送事件

#### 关键事件时机

1. **MESSAGE_SENT** - 用户点击发送按钮后立即触发
2. **GENERATION_AFTER_COMMANDS** - AI生成前的最佳数据注入时机
3. **MESSAGE_RECEIVED** - AI回复接收后触发
4. **USER_MESSAGE_RENDERED** - 用户消息在界面显示完成后

#### 完整监听示例

```javascript
function registerEventListeners() {
    // 1. 监听用户消息发送 (发送按钮点击后)
    eventSource.on(event_types.MESSAGE_SENT, handleMessageSent);

    // 2. 监听AI生成开始前 (最佳注入时机)
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, handleGenerationAfterCommands);

    // 3. 监听AI消息接收
    eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);

    // 4. 监听聊天切换
    eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);
}

// 处理消息发送事件
async function handleMessageSent(messageId) {
    const message = context.chat[messageId];
    console.log('用户发送了消息:', message);
    // 在这里处理用户刚发送的消息
}

// 处理生成前事件 (关键时机)
async function handleGenerationAfterCommands(type, params, dryRun) {
    if (dryRun) return; // 跳过干运行

    console.log('AI生成即将开始:', { type, params });
    // 这是插入数据的最佳时机
    await performDataInjection();
}
```

### 获取聊天记录数据

#### 前端数据访问方法

```javascript
import { getContext } from '../scripts/st-context.js';
import { chat, characters, this_chid } from '../script.js';

// 方法1: 通过全局变量直接访问
function getChatData() {
    return {
        currentChat: chat,                    // 当前聊天记录数组
        currentCharacter: characters[this_chid], // 当前角色数据
        characterId: this_chid,               // 当前角色ID
        chatLength: chat.length               // 聊天消息数量
    };
}

// 方法2: 通过上下文获取
function getChatDataFromContext() {
    const context = getContext();
    return {
        chat: context.chat,
        characters: context.characters,
        characterId: context.characterId,
        groupId: context.groupId,
        chatId: context.chatId
    };
}

// 获取最近的N条消息
function getRecentMessages(count = 10) {
    const context = getContext();
    return context.chat.slice(-count);
}

// 按类型筛选消息
function filterMessagesByType(messages, types = ['user', 'assistant']) {
    return messages.filter(msg => {
        if (types.includes('user') && msg.is_user) return true;
        if (types.includes('assistant') && !msg.is_user && !msg.is_system) return true;
        if (types.includes('system') && msg.is_system) return true;
        return false;
    });
}
```

#### 聊天记录数据结构

```javascript
// 单条消息的数据结构
const messageStructure = {
    name: "发送者名称",           // 用户名或角色名
    is_user: false,             // 是否为用户消息
    is_system: false,           // 是否为系统消息
    send_date: 1640995200000,   // 发送时间戳
    mes: "消息内容",            // 消息文本
    swipe_id: 0,               // 滑动选择ID
    swipes: ["消息内容"],       // 所有滑动选项
    extra: {                   // 扩展数据
        api: "openai",         // 使用的API
        model: "gpt-4",        // 使用的模型
        image: "图片URL",       // 附加图片
        file: "文件信息",       // 附加文件
        // 插件可以在这里存储自定义数据
        my_plugin_data: {}
    }
};
```

### 
