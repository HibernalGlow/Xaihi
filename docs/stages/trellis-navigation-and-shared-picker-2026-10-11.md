# 阶段报告：Trellis 导航、共享拖动选择器与主题入口

日期：2026-10-11。范围：工作台顶栏、视图/动作/应用菜单、主题快速入口，以及 Trellis 第五种卡片子布局的接线与回归。

## 改了什么

- 将 Trellis 接入 cards 视图的第五种布局，保留 Focus 与 Free Zoom 两种导航，并把返回上级、前进、后退放入顶栏。
- 视图、动作、右上角动作入口、应用菜单统一使用 `CompactPressPicker`；循环切换默认关闭，菜单支持连续跨轴拖动、键盘方向键、Esc 取消和 reduced motion。
- 应用菜单与设置菜单保留原命令和二级设置步骤；仪表盘改成独立覆盖层，进入后不再覆盖实际视图模式。
- 主题入口也接入共享组件。主题菜单采用二维选择面：上下切换设计语言、配色、明暗模式三行；左右切换当前行的选项；一次按住可跨行和跨选项拖动，松手才提交。打开主题设置作为底部独立操作。
- 主题选择继续使用既有设计主题注册表、预设、自定义主题和 `next-themes`；没有增加第二套主题存储或配置通路。

## 为什么

主题和视图的操作频率都低，但需要在窄顶栏中保持可达。二维面板把模式和选项同时露出，避免为了选一个主题反复进入和退出子菜单，也避免把设计语言、颜色选择、明暗模式混成一个不可读的列表。拖动只改变预览，释放才写入状态，因此误划不会改变主题。

Focus 适合按当前卡片层级聚焦，系统负责把注意力放在当前面板；Free Zoom 允许在 Trellis 画布上自由缩放和平移，适合跨层级查看整体结构。两者共享同一个布局树和节点实例，只改变导航方式。

## 与 DSH API 的关系

- 主题和工作区偏好沿用已有 store 与 DSH 设置桥，没有新增配置文件或 SSE。
- 设置读写仍由 [`appConfigSections.ts`](/Users/glow/Base/Code/Freya/Xaihi/packages/ui-host/src/backend/appConfigSections.ts:148) 通过 `config.getUi` 读取 revision，并由 `config.save` 携带 `expectedRevision` 写回；冲突继续保留为可读状态。
- 浏览器侧设置能力的边界仍由 [`bridge-shell.ts`](/Users/glow/Base/Code/Freya/Xaihi/packages/node-sdk/src/bridge-shell.ts:39) 的 `SettingsFace` 描述；本次没有伪造 `settings/document-updated` 订阅，也没有另开 SSE。

## 验证与后续扩展

- `pnpm --filter @hibernalglow/xaihi-ui exec vitest run --config vitest.workspace-navigation.config.mjs`：rc=0，7 files，77 tests passed。
- `pnpm --filter @hibernalglow/xaihi-ui exec vitest run --config vitest.trellis.browser.config.mjs`：rc=0，5 files，34 tests passed；覆盖二维主题键盘导航、跨轴拖动、取消和主题设置路由。
- `pnpm check:pins`：rc=0；`pnpm check:installable`：rc=0。
- `build:document` 的失败来自当前工作区已有的 `@hibernalglow/xaihi-kisaki/*` 多个入口无法解析（例如 `activity-log`、`workspace-layout`、`tool-options`），不是主题或共享选择器模块；本次没有把这些无关入口改成假依赖。
- 后续可以继续把主题矩阵的选项卡片换成项目统一的色板缩略图组件，并在真实桌面壳中补一轮触摸屏惯性手势验收。
