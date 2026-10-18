# 阶段报告：MD3E Expressive 对话快照恢复与接线

日期：2026-10-19。范围：按照 `Xaihi-Material-3-Expressive-Implementation.json` 恢复近几天已经实现的 MD3E 工作台、节点控件和设置同步；不恢复对话中明确属于其他 lane 的节点删除。

## 改了什么

1. 恢复 MD3E 界面形态与设置工作台：
   - `WorkspaceAppearance` 根据 `uiFace` 写入 `data-ui-face`，MD3E 面使用 MD3 Token，切回 Legacy 时保留原设计语言配置（`packages/ui-host/src/components/workspace/WorkspaceAppearance.tsx:70-130`）。
   - `TopBar` 增加 Legacy / MD3E 两套可读回的顶栏分区与 320px 紧凑退化（`packages/ui-host/src/components/workspace/TopBar.tsx:260-470`）。
   - `Md3eSettingsView` 按“视觉与取色、控件与形状、布局与工作台、宿主与存储”四个目的域组织设置，宽屏使用 35/65 主从布局，窄屏降级为 chips/select（`packages/ui-host/src/components/views/settings/Md3eSettingsView.tsx:232-1450`）。
2. 恢复表达性控件：
   - `Button` 在图标尺寸下接入节点级形状上下文，写入 `data-md3e-*` 状态并在能力不足时退化；文字按钮保持胶囊形态（`packages/ui-host/src/components/ui/button.tsx:8-95`）。
   - `Switch`、`Progress`、`Select` 增加 MD3E 的尺寸、波形、分段和交互状态变体（`packages/ui-host/src/components/ui/switch.tsx:7-44`、`packages/ui-host/src/components/ui/progress.tsx:1-90`、`packages/ui-host/src/components/ui/select.tsx:1-90`）。
   - `Md3eShapeContext` 提供连接式分组、形状状态回读、节点表面样式与 320px / 高对比退化视觉（`packages/ui-host/src/nodes/shared/Md3eShapeContext.tsx:250-960`）。
3. 恢复形状策略与持久化接缝：
   - `md3eShapeSystem` 提供 18 种表达性形状、启动随机稳定种子、固定策略、DOM 可读回状态和 `xaihi-core.nodeUi[nodeId]` 的读写兼容（`packages/ui-host/src/nodes/shared/md3eShapeSystem.ts:1-390`）。
   - `uiFace`、工作区 action、持久化和 DSH `appUi` 同步字段恢复到 `workspace` store（`packages/ui-host/src/types/workspace.ts:15-27`、`packages/ui-host/src/store/workspace/uiSlice.ts:1-80`、`packages/ui-host/src/components/workspace/AppConfigSync.tsx:1-120`）。
4. 恢复 Findz / Kisaki 与共享节点面中的 MD3E 工作台、表格空间和共享控件适配，并保留当前并行 lane 的 `shellect`、`dissolvef`、`node-sdk` 改动。

## 为什么

对话快照已经包含完整的 MD3E 半边实现，恢复动作的目标是把同一份 `uiFace`、形状上下文和 DSH settings seam 接回当前主线，而不是另起一套视觉系统。视觉参考中的 Rossi 异形形状、连接式分组、厚轨道和 Rhythm 的紧凑色块，分别落在形状系统、`Md3eConnectedGroup`、滑杆/进度样式和设置页主从布局中。

## 与 DSH API 的关系

- 配置值仍由 DSH 标准 settings 面承载：工作区级 `uiFace` 通过 `AppConfigSync` 同步 `xaihi-core.appUi.ui`（`packages/ui-host/src/components/workspace/AppConfigSync.tsx:35-92`）；节点级形状策略通过 `NodeUiConfigStore` 读写 `xaihi-core.nodeUi[nodeId]`（`packages/ui-host/src/nodes/shared/md3eShapeSystem.ts:250-315`）。
- 远程配置只读回脱敏状态，写入按已有 settings seam 执行；本轮没有新增配置文件、SSE 或第二套存储。DOM 的 `data-ui-face`、`data-md3-*` 和 `data-md3e-shape-*` 是界面事实源的可读回层。
- 形状能力不足时返回 `status="degraded"` 和原因，符合桌面壳 / `dsh web` 下可见退化要求；没有伪造原生能力。

## 验证与后续扩展

- `pnpm --filter @hibernalglow/xaihi-ui exec vitest run tests/progress-md3e.spec.tsx tests/switch-md3e.spec.tsx src/components/workspace/WorkspaceAppearance.test.tsx tests/kisaki-findz-md3e-switch.spec.tsx src/lib/design-theme/md3e-workbench.test.ts` → **rc=0，4 files / 23 tests passed**。
- `node scripts/check-brand.mjs` → **rc=1**，现有搬运树报告 1265 个未点名旧品牌；本轮没有扩大这条已知债务。`node scripts/check-pins.mjs --self-check` → **rc=0**；`node scripts/check-installable.mjs --self-check` → **rc=0**。
- `pnpm --filter @hibernalglow/xaihi-ui typecheck` → **rc=1**，统一脚本输出 `tsconfig.json own=41, ported=2357, otherPackages=40`；首批 own 错误集中在既有 `src/client` 与浏览器测试契约，本轮没有把这批搬运债务扩展为全仓修复。
- 尚未完成真 DSH 宿主与 Chromium 截图验收；下一轮应验证 320px 下设置页文字、Kisaki / Findz 表格内部滚动，以及背景透明度、模糊、颗粒和氛围参数的实时回读。
