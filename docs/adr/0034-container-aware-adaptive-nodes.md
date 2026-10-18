# ADR-0034: 节点界面走容器级自适应体系（Container-aware Adaptive UI）

- **状态**: 已采纳（Accepted）
- **日期**: 2026-10-15
- **决策者**: Xaihi 架构小组
- **相关 ADR**:
  - `docs/adr/0006-ui-source-is-xiranite.md`（UI 源头与搬运纪律）
  - `docs/adr/0010-brand-is-xaihi.md`（品牌一律 Xaihi）
  - `docs/adr/0011-desktop-shell-is-a-sibling-vendor-repo.md`（降级铁律：可见可读回）
  - `docs/adr/0033-md3e-ui-redesign.md`（MD3 Expressive 界面重设计）

---

## 1. 背景与问题诊断

Xaihi 是运行在宿主（DeepSeek Harness / DSH）上的工作台框架，其前端展示形态高度动态：
- 支持**分形视图（TrellisView / 分屏）**、**泳道视图（LaneView）**、**流式画布（FlowCanvas）**与**自由浮动窗（FloatingComponentWindow）**；
- 同一个节点在浏览器窗口（Viewport）完全不变（如 1920×1080）的情况下，可能被用户拖动分隔条从 `1200px` 宽度的全展面板骤缩至 `240px` 的极窄侧栏，或是被压缩成 `960×280px` 的宽矮横条。

在旧有实现中，存在两个明显的结构性缺陷：
1. **视口媒体查询（`@media`）彻底失效**：传统的 `@media (min-width: 768px)` 依据的是浏览器全局视口（Window），节点被嵌入在窄侧栏或分屏格时，依然会命中桌面端规则，导致表单横向溢出、文字被切断、操作按钮被挤出可视区。
2. **过度依赖 JavaScript（`ResizeObserver` / `useNodeSurface`）驱动布局**：
   - 过去依靠 `useNodeSurface` 测量像素并在 React state 中记录 `mode`（`compact | regular | expanded...`）；
   - 拖拽工作区分隔条时，每个尺寸变化事件都会迫使整个 React 组件树重渲染，容易发生边界抖动，甚至摧毁表单内部焦点与滚动条状态。

---

## 2. 核心决定

### 决定 1：视口管工作台，容器管节点

1. **节点宿主表面必须确立尺寸上下文**：
   所有承载节点的根容器（包括 `ModuleRenderer.tsx` 渲染的 `.xiranite-node-surface` 以及 `Md3eNodeSurface`）统一施加如下核心规则：
   ```css
   .xiranite-node-surface,
   [data-slot="md3e-node-surface"] {
     width: 100%;
     height: 100%;
     min-width: 0;
     min-height: 0;
     display: flex;
     flex-direction: column;
     overflow: hidden;
     container: node / size;
   }
   ```
2. **双向防塌陷约束（`min-w-0 min-h-0`）**：
   启用 `container-type: size` 时，容器的计算尺寸不再由子元素内容支撑。外层工作区框架必须提供确定的宽高约束，而节点根元素及内部的直接子级必须显式挂载 `min-width: 0; min-height: 0;`，杜绝 Flex/Grid 嵌套中的隐式最小内容膨胀。

### 决定 2：分层自适应阶梯（CSS 第一防线，JS 第二防线）

界面的空间自适应严格按照如下阶梯执行，严禁把所有响应式判断都塞入 React state：

| 层级 | 技术手段 | 适用场景 |
| :--- | :--- | :--- |
| **第一级：内在布局 (Intrinsic Layout)** | CSS Grid `auto-fit` / `minmax()`、Flexbox `flex-wrap`、`clamp()` | 列表网格列数自适应、操作栏自适应折行、文字流式缩放（锁定最小字号） |
| **第二级：容器查询 (Container Queries)** | `@container node (width < ...)` / `@container node (height < ...)` | 隐藏次要辅助文本、表单单列化、工具栏溢出收纳、矮视窗下收起 Hero Banner |
| **第三级：容器相对单位 (CQ Units)** | `cqi`, `cqb`, `cqmin` | 卡片内边距、装饰性几何图形相对缩放（禁止字号裸用 `cqi` 导致无限缩小） |
| **第四级：JavaScript 状态 (JS Observer)** | `useNodeSurface` (`ResizeObserver`) | **仅用于必须推翻 DOM 的结构重构**：如 Canvas / ECharts 尺寸同步重绘、虚拟列表可见窗口计算 |

### 决定 3：视觉令牌与结构响应分离

1. **M3 Expressive（M3E）视觉规范保持恒定**：
   - 色彩种子、动态生成的高对比色系、表达性多边形几何遮罩（`clip-path`）、按钮按压形态（`9999px -> 10px`）属于视觉语言，**不因容器变窄变小而降级**。
2. **空间响应只作用于信息密度与布局模式**：
   - 随尺寸变化的是间距（padding/gap）、列数、次要信息折叠；
   - 核心执行动作（Primary Action / `ExecuteButton` / `SlingButton`）永远设立**保底可视槽**，在极窄（240px）或极矮（280px）下自动收缩为纯图标按钮，但绝对不可被隐藏或挤出可视区。

### 决定 4：建立标准「节点容器测试矩阵」

不再只通过 `page.setViewportSize()` 调整浏览器视口进行测试，必须通过独立调整节点外层容器尺寸进行物理验证：

1. **极窄高（Tall-Narrow, 240 × 720）**：验证极窄侧栏下，表单无横向溢出（`scrollWidth <= clientWidth`），主要动作可点击；
2. **极宽高（Short-Wide, 960 × 280）**：验证横向工具条模式下，大标题/大 Banner 自动折叠，表格与核心控件未被纵向裁切；
3. **近方形（Square, 480 × 480）**：验证浮动面板或四分屏下，双列向单列或均衡两列的平滑过渡；
4. **宽屏（Workspace, 1440 × 900）**：验证全展视图下，间距与网格充分展开，无大面积空白脱节。

---

## 3. 证据与可验证性

1. **样式层验证**：
   - 经 `packages/ui-host/scripts/build-css.mjs` 编译后，`.xiranite-node-surface` 包含 `container: node / size`，且在所有现代浏览器中受基线支持。
2. **测试层验证**：
   - 在 `packages/ui-host/src/nodes/shared/node-adaptive-container.test.tsx` 中挂载测试容器，使用 `ADAPTIVE_CONTAINER_MATRIX` 跑四种极限尺寸，断言 `scrollWidth <= clientWidth`，并配阳性对照（强行注入 400px 不可换行元素时断言红）。
3. **降级保障（ADR-0011 决定 4）**：
   - 即使运行在极老或不支持 Container Queries 的宿主环境，通过 Flex/Grid Intrinsic 布局也能实现可用性保底。
