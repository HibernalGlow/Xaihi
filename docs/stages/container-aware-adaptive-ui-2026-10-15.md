# 节点嵌入式容器自适应体系（Container-aware Adaptive UI）落地（2026-10-15）

## 改了什么

1. **确立「视口管工作台，容器管节点」的核心架构纪律（ADR-0034）**：
   - 起草并落地 `docs/adr/0034-container-aware-adaptive-nodes.md`：节点不再依赖窗口全局视口，而是作为嵌入式组件建立自己的尺寸上下文。
   - 在 `.dsh/skills/xaihi-node-ui/SKILL.md` 增补「节点容器自适应纪律（ADR-0034）」，规定流式排版优先、CSS Container Queries 第一防线、JS ResizeObserver 仅作第二防线、动作保底可视槽与双向防塌陷约束。
2. **样式基础设施升级（`index.css` / `ModuleRenderer.tsx` / `Md3eShapeContext.tsx`）**：
   - 在 `packages/ui-host/src/components/modules/ModuleRenderer.tsx:272` 为节点表面输出类名追加 `min-w-0` 与品牌规范名 `xaihi-node-surface`（保持 `xiranite-node-surface` 兼容）。
   - 在 `packages/ui-host/src/index.css:146-180` 为 `.xaihi-node-surface`、`.xiranite-node-surface` 与 `[data-slot="md3e-node-surface"]` 声明：
     ```css
     width: 100%;
     height: 100%;
     min-width: 0;
     min-height: 0;
     display: flex;
     flex-direction: column;
     overflow: hidden;
     container: node / size;
     ```
     并注入容器宽度断点 `@container node (width < 20rem)`（折叠次要文本 `[data-adaptive-hide="compact"]`、单列化 `[data-adaptive-grid="auto"]`）与容器高度断点 `@container node (height < 17.5rem)`（收纳 Banner 装饰头 `[data-adaptive-hide="short"]`）。
   - 在 `packages/ui-host/src/nodes/shared/Md3eShapeContext.tsx:455-460,733-745` 的 `MD3E_NODE_SURFACE_CSS` 与 `Md3eNodeSurface` 挂载 `container: node / size`、`min-w-0 min-h-0` 与 `data-slot="md3e-node-surface"`。
   - 经 `packages/ui-host/scripts/build-css.mjs` 重新编译 Tailwind v4 与 `client.css`，产物通过无层泄露整形（canary 13/13 · 命中宿主无层规则 0 · 泄露 0）。
3. **标准化节点容器验证矩阵落地（`nodeSurfaceTestUtils.ts` & `node-adaptive-container.spec.tsx`）**：
   - 在 `packages/ui-host/src/nodes/shared/nodeSurfaceTestUtils.ts` 导出 `ADAPTIVE_CONTAINER_MATRIX`，标准化定义 4 档典型极端容器规格：
     - `tall-narrow`: 240 × 720（极窄侧栏 / 竖屏工作区）
     - `short-wide`: 960 × 280（宽矮横向工具条 / 短视窗）
     - `square`: 480 × 480（近方形浮动面板 / 分屏节点）
     - `workspace`: 1440 × 900（完整工作区全展视图）
   - 新增 `packages/ui-host/tests/node-adaptive-container.spec.tsx`（6 条用例全部通过）：
     - 验证 4 档极端尺寸下主执行操作 `[data-slot="primary-action"]` 始终在视口内可交互；
     - 验证极窄与极矮容器下自适应辅助属性正确响应；
     - 配备阳性对照（500px 定宽不可断行子节点放入 240px 容器时敏锐检出溢出）；
     - 验证节点容器尺寸与全局 `window.innerWidth` 完全解耦。

## 为什么

1. **解决视口媒体查询（`@media`）在分屏与侧栏工作区下的失效**：
   - Xaihi 支持分形视图（Trellis）、泳道（Lane）与悬浮窗（FloatingWindow）。当用户在 1920×1080 桌面拖动分栏将节点压至 240px 宽度时，传统的 `@media (min-width: 768px)` 依然以为是在桌面端，导致表单溢出、文字被截断、按钮被挤走。
   - 通过在节点根建立 `container: node / size`，节点内部样式直接响应宿主分配给它的实际物理长宽，做到真正的容器内自适应。
2. **解决把所有自适应逻辑塞进 React State 带来的抖动与性能开销**：
   - 过去依靠 `ResizeObserver` 算出 `mode` 并通过 JSX 条件分支渲染，每次拖动分隔条都引发 React 树整棵重新 mount/unmount，容易导致表单丢失焦点和闪烁。
   - 新架构确立 CSS Container Queries + Intrinsic Layout 为第一防线，React 仅在必须推翻 DOM（如 ECharts/Canvas 重绘）时介入。

## 与 DSH API 的关系及证据

- **宿主工作台嵌入模型**：DSH 客户端为插件渲染的槽位（`dsh-client-ui-layout` / `dsh-client-ui-slots`）提供任意尺寸的容器包裹。Xaihi 在 `packages/ui-host/src/components/modules/ModuleRenderer.tsx:217` 通过 `data-module-id`、`data-component-id` 与 `xaihi-node-surface` 挂载节点，所有自适应计算限定在插件受控沙箱内，不干扰宿主顶层视口。
- **验证证据**：
  ```text
  /opt/homebrew/bin/node ../../node_modules/vitest/vitest.mjs run tests/node-adaptive-container.spec.tsx src/nodes/shared/useNodeSurface.test.ts src/lib/design-theme/
  rc=0 | Test Files 17 passed (17); Tests 177 passed (177)
    - tests/node-adaptive-container.spec.tsx: 6 passed (6)（含 4 档矩阵、防塌陷、核心动作保底、阳性对照、视口解耦）
    - src/nodes/shared/useNodeSurface.test.ts: 16 passed (16)
    - src/lib/design-theme/md3e-workbench.test.ts: 9 passed (9)

  node scripts/build-css.mjs (cwd: packages/ui-host)
  rc=0 | build-css: PASS（canary 13/13 · 命中宿主无层规则 0 · 候选 18546 条）

  node scripts/check-pins.mjs && node scripts/check-skills.mjs && node scripts/check-installable.mjs
  rc=0 | check-pins OK (90 @deepseek-ai deps 0.2.0-rc.2); check-skills OK (6 skills); check-installable OK (26 packages)
  ```

## 后续扩展

1. **节点面板全面应用 `@container` 语法优化内部工具条**：
   - 后续将 `classf`, `findz`, `gifu`, `repacku`, `trename` 等各节点的内部顶部工具栏从固定 flex 升级为带有 `minmax(0, 1fr)` 与 `@container node (width < 20rem)` 的自适应结构；
2. **将 `node-adaptive-container.spec.tsx` 的测试夹具推广至全节点冒烟矩阵**：
   - 可对全部 31 个领域节点批量执行 4 档极限尺寸挂载扫描，作为 CI 自动溢出探测门禁。
