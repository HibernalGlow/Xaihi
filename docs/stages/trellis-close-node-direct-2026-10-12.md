# 阶段报告：分形视图关闭节点去掉二次确认

日期：2026-10-12。范围：`packages/ui-host` 的 Trellis（分形）视图节点右键关闭逻辑。

## 改了什么

1. **分形视图中右键关闭节点去掉二次确认**：
   - 在 `packages/ui-host/src/components/workspace/TrellisView.tsx:268-274` 中，移除了 `closeNodeItem` 里的 `confirm` 配置块（包含 `title: t('view:trellis.closeNodeConfirmTitle')` 及相关描述与确认按钮）。
   - 用户在节点内容区右键或标签栏/面板菜单中选择「关闭这个节点」时，不再弹出二次确认对话框，直接调用 `actions.removeComponent(componentId)` 移除实例。
2. **测试尺回归更新**：
   - 更新 `packages/ui-host/tests/trellis-surface.browser.test.tsx:134-171` 中的两条节点关闭用例，断言点击「关闭这个节点」后不弹出对话框（`expect(screen.queryByRole('dialog')).toBeNull()`），节点实例立即从 store 及画布 DOM 中移除。

## 为什么

- 上一阶段（`docs/stages/trellis-canvas-and-node-close-2026-10-11.md`）接入右键「关闭这个节点」时，按通用卡片删除口径带上了二次确认弹窗。
- 实际使用中，分形（Trellis）工作台的节点关闭属于高频布局整理操作，二次确认弹窗造成不必要的阻断；按使用者最新要求移除二次确认，使点击直接关闭。

## 与 DSH API 的关系

没有引入任何新的 DSH API 通路。关闭动作继续沿用 store action `actions.removeComponent(componentId)`（`packages/ui-host/src/store/workspace/componentSlice.ts:18`），不增加配置文件或外部存储。

## 验证与后续扩展

- 测试尺：`pnpm --filter @hibernalglow/xaihi-ui exec vitest run -c vitest.trellis-surface.browser.config.mjs`
  - **rc=0，1 file / 6 tests passed**。
  - 节点右键关闭与标签栏右键关闭两条用例均断言无 dialog 弹窗且组件立即销毁。
- **阳性对照验证**：
  - 在改动前或保留 `confirm` 时，由于未点击确认按钮，`useWorkspaceStore.getState().components` 保持 1，测试超时并报错退出（`rc=1`，`Tests 2 failed | 4 passed`）。
  - 去掉 `confirm` 后测试直接通过（`rc=0`，`Tests 6 passed`）。
- 门禁检查：
  - `pnpm check:pins`：**rc=0**
  - `pnpm check:installable`：**rc=0**
