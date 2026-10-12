# 阶段报告：分形视图的画布面 + 节点右键「关闭这个节点」

日期：2026-10-11。范围：`packages/ui-host` 的 Trellis（分形）视图本身，不动节点内容、不动库。

## 改了什么

1. **分形视图支持纹理画布**（使用者口径原话）
   - `TrellisView.tsx` 的视图根挂上 `.ws-canvas-bg`（`src/components/workspace/TrellisView.tsx:270`）——
     与经典卡片 / 流程 / 泳道三个视图同一条画布层；背景图、网格、点阵、覆盖到顶栏都从那一层来。
   - `trellis.css` 里把库自己的底色与舞台背板让开：`--trellis-bg` / `--trellis-stage` 由
     `var(--background)` / `var(--muted)` 改成 `transparent`（`src/components/workspace/trellis.css:5-9`）。
     它们不透明时，分形视图是唯一看不见纹理画布的视图（`--trellis-stage` 就是截图里那块平底）。
2. **节点右键的「关闭这个节点」**，两条右键路径共用同一项：
   - 节点内容区：`.xaihi-trellis-node` 声明 `data-context-menu="trellis-node"`，视图里注册该作用域
     （`TrellisView.tsx:250-253`）。按仓里既有形状，节点作用域出现时画布菜单不再叠加。
   - 库自己的面板菜单（标签栏右键 / 面板「⋯」按钮）：在 `renderMenu` 里追加（`TrellisView.tsx:262-268`），
     追加而不是替换，库的 Maximize / Float / Hide 等原样保留。
   - 关闭动作 = `actions.removeComponent(componentId)`，带确认（面板 id → 面板 → selected 视图 →
     `params.componentId`，`panelOf` 同时看根树与浮到画布上的面板）。
3. 两份词典各加 2 个键（`view.trellis.closeNode` / `closeNodeConfirmTitle`），确认描述复用
   `contextMenu:deleteConfirmDescription`。

## 为什么

- 画布那一半是**复用**而不是新造：`ws-canvas-bg` 是既有层（`src/index.css:262-311`），新造一套会把
  「哪些模式算什么」变成第二真源。
- 关闭那一半**不能交给库自己的 `close`**：它只删视图记录（`dist/index.js:4380` →
  `closeView`），而 `reconcileTrellisDocument` 会把还在 store 里的实例再挂回来；`ViewType` 因此
  一直是 `closable={false}`。使用者确认过的设计口径是 `docs/trellis-grid-design.md:86`
  「关闭节点走既有实例生命周期和关闭确认规则」⇒ 走 `removeComponent` + 确认，与卡片右键的「删除」
  是同一条生命周期（标签不同：分形语境里叫「关闭」）。
- 两条右键路径都接，是因为「分形视图的右键」在真机上落在两处：节点卡片本体（作用域路），
  与标签栏/面板菜单（库的路）。

## 与 DSH API 的关系

没有新增任何宿主通路：关闭用的是既有 store action（`store/workspace/componentSlice.ts:18` 的
`removeComponent`），画布层用的是既有 CSS 变量（`--ws-bg-*` 由 `WorkspaceLayout.tsx:43-47` 写），
词典走既有 i18n 文件。不新增配置文件、不新增 SSE、不碰 storage domain。

## 验证与后续扩展

尺：`packages/ui-host/vitest.trellis-surface.browser.config.mjs` +
`tests/trellis-surface.browser.test.tsx`（真 Chromium，吃文档那条 vite 解析与 CSS 管线）。

- `pnpm --filter @hibernalglow/xaihi-ui exec vitest run --config vitest.trellis-surface.browser.config.mjs`
  → **rc=0，1 file / 6 tests passed**。六条：背景图（像素回读 = 纯红）、纯色对照（同点不是红）、
  覆盖到顶栏（这一档画布层的图是关的，靠根那层透上来）、点阵层非空、节点右键关闭（确认后节点从画布消失）、
  标签栏右键（同一个入口且不顶掉库的项）。
- **阳性对照跑了四轮，每轮改完立刻回原样**：
  ① 把 `--trellis-bg/--trellis-stage` 还原成不透明 ⇒ 三条画布判据红（实测底色
  `oklch(0.981 0.006 180)` / `oklch(0.945 0.008 180)`，覆盖到顶栏那点实测 `rgb(231,239,237)`）；
  ② 去掉视图根的 `ws-canvas-bg` ⇒ 两条红（类名为假、`::before` 的 `backgroundImage` = `none`）；
  ③ 节点作用域返回 `null` ⇒ 节点右键那条红（`Unable to find role="menuitem" and name "关闭这个节点"`）；
  ④ 去掉 `renderMenu` 里的追加 ⇒ 标签栏那条红、节点那条保持绿（两条路互不冒充）。
- 别人那条尺未受影响：`exec vitest run --config vitest.trellis.browser.config.mjs` → 34/34 passed。
- **实机（真宿主）未验**：`build:document` 当前红在无关的未解析入口上，没有重建 `dist-ui`；
  本次只是浏览器尺 + 编译期。别把这句读成"在 dsh 里验过了"。

未做（有意留着，都不在本次口径里）：

- **丝绸噪点/晕影根本还没有渲染者**：`grainEnabled` / `vignetteDepth` 会被持久化，但全仓没有消费者
  （`components/ui/noise.tsx` 零引用）⇒ 本次「纹理画布」只接了背景图/网格/点阵那一层。真要出噪点，
  那是所有视图一起的事，另开一轮。
- 库自己的面板菜单项仍是英文（`view:trellis.menu.*` 词典没建）；本次没顺手加，避免动到别人正在改的 i18n。
- 空的分形工作台没有空态提示：文档根永远是 `stage`，库只在 `root` 为空时显示 `empty` 槽
  ⇒ 屏上是一片空白（`stage-empty` 是空 div）。这是独立缺口。
- 这条尺没接进任何编排（根 `test` 只跑 `test:unit` / `typecheck`），与其它三条 slice 浏览器尺一样手动跑。
