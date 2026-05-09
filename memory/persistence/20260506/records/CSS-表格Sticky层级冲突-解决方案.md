# 表格 Sticky 布局层级冲突解决方案

## 日期

2026-05-06（迁移整理）  
原文日期：2026-02-13

## 背景

表格同时做“Sticky 表头（垂直固定）+ 固定列（水平固定）”时，常见左上角单元格失效、表身遮挡表头、表头不可点击等问题，本质是 **sticky 方向声明 + z-index/堆叠上下文** 没处理好。

## 结论 / 事实

- **关键原则**：
  - 左上角单元格必须同时具备 `top` 与 `left`（或继承 top、显式 left），并且 `z-index` 最高
  - 表头整体层级 > 表身固定列层级 > 普通单元格
  - 避免在表头 `th` 上用 `position: relative` 覆盖 sticky（会破坏 sticky 行为/层级）
- **推荐层级金字塔（示例值）**：
  - 左上角单元格：`z-index: 32`
  - 表头整体：`z-index: 30`
  - 表身固定列：`z-index: 20`
- **可维护性增强**：用 CSS 变量定义这些 z-index 常量，或用嵌套结构把表头/表身分层渲染。

## 影响 / 下一步

- 以后新增“固定表头 + 固定列”需求时，直接套用“层级金字塔结构”和“验证清单”，优先保证左上角单元格与点击命中。
- 若现有布局复杂（多层容器、transform 等），优先采用“嵌套结构分离层级”的方案降低堆叠上下文干扰。

---

## 附录：原文（从 `docs/knowledge/表格Sticky布局层级冲突解决方案.md` 迁移）

# 表格 Sticky 布局层级冲突解决方案

## 问题概述
在表格中同时实现 Sticky 表头（垂直滚动固定）和固定列（水平滚动固定）时，出现层级冲突问题：
- 左上角单元格在水平滚动时失去 sticky 效果
- 表身第一列遮挡表头内容
- 点击表头元素时无法触发（被遮挡）

## 通用原因分析

### 原因1：position: relative 覆盖 sticky
当父元素或同级元素使用 `position: relative` 时，由于 CSS 优先级规则，`relative` 会覆盖 `sticky`，导致 sticky 失效。

### 原因2：z-index 层级关系混乱
需要同时考虑垂直滚动和水平滚动的场景，如果 z-index 设置不当，会导致层级错乱。

### 原因3：sticky 方向声明不完整
左上角单元格需要同时声明 `top` 和 `left`，如果缺少其中任何一个，sticky 效果会不完整。

## 解决方案

### 方案1：正确的层级设置（推荐）

**问题代码：**
```css
/* 错误：使用 relative 覆盖了 sticky */
.table-head th {
  position: relative;  /* 这会覆盖 .sticky-col 的 sticky */
  z-index: 31;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 20;
}
```

**修复代码：**
```css
/* 表头整体 - 垂直滚动时固定 */
.table-head {
  position: sticky;
  top: 0;
  z-index: 30;  /* 表头整体层级 */
}

.table-head th {
  padding: 12px;
  /* 不要使用 position: relative */
}

/* 表身第一列 - 水平滚动时固定 */
.sticky-col {
  position: sticky;
  left: 0;
  background: #1f2133;
  z-index: 20;  /* 低于表头，但高于普通单元格 */
  border-right: 1px solid #363a55;
  width: 80px;
  text-align: center;
  box-shadow: 4px 0 8px -2px rgba(0,0,0,0.3);
}

/* 左上角单元格 - 同时垂直和水平固定 */
.table-head th.sticky-col {
  z-index: 32;  /* 最高层级 */
  position: sticky;  /* 显式声明，避免被覆盖 */
  left: 0;
}
```

### 方案2：使用 CSS 变量动态计算 z-index

**适用场景：** 需要灵活调整层级关系

```css
:root {
  --z-sticky-col: 20;
  --z-table-head: 30;
  --z-sticky-head-col: 32;
}

.sticky-col {
  z-index: var(--z-sticky-col);
}

.table-head {
  z-index: var(--z-table-head);
}

.table-head th.sticky-col {
  z-index: var(--z-sticky-head-col);
}
```

### 方案3：使用嵌套结构分离层级

**适用场景：** 复杂表格布局，需要更精细的控制

```html
<div class="table-wrapper">
  <!-- 表头单独一层 -->
  <div class="table-header-layer">
    <table>
      <thead>
        <tr>
          <th class="sticky-col"><input type="checkbox"></th>
          <th>姓名</th>
        </tr>
      </thead>
    </table>
  </div>
  
  <!-- 表身单独一层 -->
  <div class="table-body-layer">
    <table>
      <tbody>
        <tr>
          <td class="sticky-col"><input type="checkbox"></td>
          <td>张三</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

```css
.table-wrapper {
  position: relative;
  height: 500px;
  overflow: auto;
}

.table-header-layer {
  position: sticky;
  top: 0;
  z-index: 30;
}

.table-body-layer {
  z-index: 10;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 20;
}

/* 表头的固定列需要更高层级 */
.table-header-layer .sticky-col {
  z-index: 32;
}
```

## 层级金字塔结构

```
                    ┌─────────────────┐
                    │  左上角单元格     │ z-index: 32
                    │ (sticky head-col) │
                    └─────────────────┘
                    ┌─────────────────┐
                    │     表头整体      │ z-index: 30
                    │   (sticky top)  │
                    └─────────────────┘
        ┌───────────┴───────────┐
        │                        │
┌───────┴───────┐      ┌───────┴───────┐
│  表身第一列    │      │  表身其他列    │
│ (sticky left)  │      │  (normal)     │
│ z-index: 20   │      │  (default)    │
└───────────────┘      └───────────────┘
```

**层级说明表：**

| 元素 | z-index | sticky 方向 | 作用 |
|------|---------|-------------|------|
| 左上角单元格 | 32 | top + left | 同时垂直和水平固定，最高层级 |
| 表头整体 | 30 | top | 垂直滚动时固定 |
| 表身第一列 | 20 | left | 水平滚动时固定 |
| 表身其他列 | default | - | 普通流，不固定 |

## 常见场景示例

### 场景1：单列固定（操作列）
```html
<div class="table-wrapper">
  <table>
    <thead>
      <tr>
        <th class="sticky-col" style="left: 0">操作</th>
        <th>姓名</th>
        <th>年龄</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="sticky-col" style="left: 0">
          <button>编辑</button>
        </td>
        <td>张三</td>
        <td>25</td>
      </tr>
    </tbody>
  </table>
</div>
```

```css
.table-wrapper {
  overflow: auto;
  max-height: 500px;
  max-width: 800px;
}

/* 表头固定 */
thead {
  position: sticky;
  top: 0;
  z-index: 30;
  background: white;
}

/* 第一列固定 */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 20;
  background: white;
  border-right: 1px solid #ddd;
}

/* 表头第一列需要更高层级 */
thead th.sticky-col {
  z-index: 32;
}
```

### 场景2：多列固定（复选框 + 操作列）
```html
<div class="table-wrapper">
  <table>
    <thead>
      <tr>
        <th class="sticky-col-1" style="left: 0">
          <input type="checkbox">
        </th>
        <th class="sticky-col-2" style="left: 40px">
          操作
        </th>
        <th>姓名</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="sticky-col-1" style="left: 0">
          <input type="checkbox">
        </td>
        <td class="sticky-col-2" style="left: 40px">
          <button>编辑</button>
        </td>
        <td>张三</td>
      </tr>
    </tbody>
  </table>
</div>
```

```css
/* 表头固定 */
thead {
  position: sticky;
  top: 0;
  z-index: 30;
  background: white;
}

/* 第一列：复选框 */
.sticky-col-1 {
  position: sticky;
  left: 0;
  z-index: 20;
  background: white;
  width: 40px;
  border-right: 1px solid #ddd;
}

/* 第二列：操作 */
.sticky-col-2 {
  position: sticky;
  left: 40px;  /* left = 第一列宽度 */
  z-index: 19;  /* 低于第一列 */
  background: white;
  border-right: 1px solid #ddd;
  width: 100px;
}

/* 表头的固定列需要更高层级 */
thead th.sticky-col-1 {
  z-index: 32;
}

thead th.sticky-col-2 {
  z-index: 31;
}
```

### 场景3：响应式表格（移动端隐藏非固定列）
```html
<div class="table-wrapper">
  <table>
    <thead>
      <tr>
        <th class="sticky-col">
          <input type="checkbox">
        </th>
        <th>姓名</th>
        <th class="mobile-hidden">年龄</th>
        <th class="mobile-hidden">地址</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="sticky-col">
          <input type="checkbox">
        </td>
        <td>张三</td>
        <td class="mobile-hidden">25</td>
        <td class="mobile-hidden">北京</td>
      </tr>
    </tbody>
  </table>
</div>
```

```css
thead {
  position: sticky;
  top: 0;
  z-index: 30;
  background: white;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 20;
  background: white;
  border-right: 1px solid #ddd;
}

thead th.sticky-col {
  z-index: 32;
}

.mobile-hidden {
  display: none;
}

@media (min-width: 768px) {
  .mobile-hidden {
    display: table-cell;
  }
}
```

## 最佳实践

### 1. 避免使用 position: relative
```css
/* ❌ 错误 */
.table-head th {
  position: relative;
}

/* ✅ 正确 */
.table-head th {
  /* 不设置 position */
}
```

### 2. 显式声明 sticky 方向
```css
/* 左上角单元格需要同时声明 top 和 left */
.table-head th.sticky-col {
  position: sticky;
  top: 0;  /* 继承自 .table-head */
  left: 0;  /* 显式声明 */
}
```

### 3. 合理设置 z-index
- 普通单元格：不设置（默认）
- 表身固定列：10-20
- 表头：30
- 表头固定列：32（最高）

### 4. 设置背景色和阴影
```css
.sticky-col {
  background: white;  /* 重要：避免透明遮挡 */
  box-shadow: 4px 0 8px -2px rgba(0,0,0,0.3);  /* 增强视觉层次 */
}
```

## 常见误区

### 误区1：提高表头所有单元格的 z-index
```css
/* ❌ 错误：会导致 sticky 失效 */
.table-head th {
  position: relative;
  z-index: 31;
}
```

### 误区2：只在 .sticky-col 上设置 z-index
```css
/* ❌ 不完整：左上角单元格 z-index 仍然是 20 */
.sticky-col {
  z-index: 20;
}
```

### 误区3：使用 !important 强制覆盖
```css
/* ❌ 不推荐：治标不治本 */
.table-head th.sticky-col {
  z-index: 40 !important;
}
```

### 误区4：忽略背景色
```css
/* ❌ 错误：固定列透明时，会看到下方滚动的内容 */
.sticky-col {
  position: sticky;
  left: 0;
  /* 缺少背景色 */
}
```

## 调试技巧

### 1. 使用浏览器 DevTools 检查层级
- 右键检查元素
- 在 Computed 面板查看 `position` 和 `z-index`
- 检查是否有其他样式覆盖

### 2. 临时添加边框检查
```css
.sticky-col {
  border: 2px solid red;
  z-index: 999;  /* 临时提高层级测试 */
}
```

### 3. 测试不同滚动场景
- 只垂直滚动
- 只水平滚动
- 同时垂直和水平滚动
- 确保左上角单元格始终固定

## 验证清单

在实现表格 sticky 布局时，确保满足以下所有条件：

- [ ] 垂直滚动时，表头固定在顶部
- [ ] 水平滚动时，固定列保持在左侧
- [ ] 同时滚动时，左上角单元格固定在左上角
- [ ] 表头固定列不被表身第一列遮挡
- [ ] 点击表头元素可以正常触发（不被遮挡）
- [ ] 固定列设置了背景色（避免透明遮挡）
- [ ] 没有使用 `position: relative` 覆盖 sticky
- [ ] z-index 层级关系正确

## 相关文档
- [MDN - position: sticky](https://developer.mozilla.org/zh-CN/docs/Web/CSS/position)
- [MDN - z-index](https://developer.mozilla.org/zh-CN/docs/Web/CSS/z-index)
- [CSS Stacking Context](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context)

## 日期
2026-02-13
