# 阶段报告：MD3E Expressive 对话快照恢复与接线

日期：2026-10-19。范围：按照 `Xaihi-Material-3-Expressive-Implementation.json` 恢复近几天已经实现的 MD3E 工作台、节点控件和设置同步；不恢复对话中明确属于其他 lane 的节点删除。

## 改了什么

1. 恢复 MD3E 界面形态与设置工作台：
   - `WorkspaceAppearance` 根据 `uiFace` 写入 `data-ui-face`，MD3E 面使用 MD3 Token，切回 Legacy 时保留原设计语言配置（`packages/ui-host/src/components/workspace/WorkspaceAppearance.tsx:70-130`）。
   - `TopBar` 增加 Legacy / MD3E 两套可读回的顶栏分区与 320px 紧凑退化；两种界面都在首屏提供双向切换，紧凑容器保留图标入口与明确的 `aria-label`（`packages/ui-host/src/components/workspace/TopBar.tsx:237-433`）。
   - `Md3eSettingsView` 按“视觉与取色、控件与形状、布局与工作台、宿主与存储”四个目的域组织设置，宽屏使用 35/65 主从布局，窄屏降级为 chips/select（`packages/ui-host/src/components/views/settings/Md3eSettingsView.tsx:232-1450`）。
2. 恢复表达性控件：
   - `Button` 在图标尺寸下接入节点级形状上下文，写入 `data-md3e-*` 状态并在能力不足时退化；文字按钮保持胶囊形态（`packages/ui-host/src/components/ui/button.tsx:8-95`）。
   - `Switch`、`Progress`、`Select` 增加 MD3E 的尺寸、波形、分段和交互状态变体（`packages/ui-host/src/components/ui/switch.tsx:7-44`、`packages/ui-host/src/components/ui/progress.tsx:1-90`、`packages/ui-host/src/components/ui/select.tsx:1-90`）。
   - `Md3eShapeContext` 提供连接式分组、形状状态回读、节点表面样式与 320px / 高对比退化视觉（`packages/ui-host/src/nodes/shared/Md3eShapeContext.tsx:250-960`）。
3. 恢复形状策略与持久化接缝：
   - `md3eShapeSystem` 提供 18 种表达性形状、启动随机稳定种子、固定策略、DOM 可读回状态和 `xaihi-core.nodeUi[nodeId]` 的读写兼容（`packages/ui-host/src/nodes/shared/md3eShapeSystem.ts:1-390`）。
   - `uiFace`、工作区 action、持久化和 DSH `appUi` 同步字段恢复到 `workspace` store（`packages/ui-host/src/types/workspace.ts:15-27`、`packages/ui-host/src/store/workspace/uiSlice.ts:1-80`、`packages/ui-host/src/components/workspace/AppConfigSync.tsx:1-120`）。
4. 恢复 Findz / Kisaki 与共享节点面中的 MD3E 工作台、表格空间和共享控件适配，并保留当前并行 lane 的 `shellect`、`dissolvef`、`node-sdk` 改动。
5. 收口 Shellect 的窄容器与启动行为：
   - `XMd3eSection`、`XMd3eOptionCard`、Shellect action article 和 slider ticks 统一 `min-width: 0`、`box-sizing`、内部裁剪与刻度省略，240px 宽度不再产生横向溢出（`packages/ui-kit/src/tokens.ts:115-144`、`plugins/shellect/frontend/Md3eManager.tsx:14-32`）。
   - Vite、workspace service 和 DSH profile 的 web runtime 都关闭自动打开浏览器；workspace restorer 只在用户开启恢复且能力为 `native` 时恢复窗口，浏览器 popup 不再在启动阶段被创建（`packages/ui-host/vite.config.ts:134-143`、`scripts/serve-workspace.mjs:1-112`、`desktop/dev-shell.mjs:98-121`、`packages/ui-host/src/components/workspace/WorkspaceWindowRestorer.tsx:7-52`）。
6. 收口独立分发的 MD3E 基座：
   - `@hibernalglow/xaihi-ui-kit` 的 shape API 增加 `idle / pressed / expanded` 三相读回、统一 shape surface、icon button、chip、FAB；操作按钮补齐 `xs → xl` 五档。
   - 独立主题接入公开完整的 21 个 `XAIHI_UI_KIT_THEME_TOKENS` 语义槽，README 提供轻色映射示例、亮暗模式切换约定与前景/容器配对要求；测试逐槽确认样式表确实消费全部公开名称，避免外部 consumer 静默落入宿主或通用兜底色（`packages/ui-kit/src/tokens.ts`、`packages/ui-kit/README.md`、`packages/ui-kit/tests/tokens.spec.ts`）。
   - 新增可独立消费的 liquid glass、lens bar、navigation dock、popup 原语；它们只使用 `--xaihi-*` / DSH alias，不携带宿主色板。
   - 新增 field、search bar、list/list item、badge、progress ring、tabs、breadcrumb；tarball consumer 同时做 root/subpath 类型导入检查，从临时 consumer 读取入口、36 个形状和 `styles.css`，不依赖 workspace 路径（`packages/ui-kit/src/md3e.tsx:5-390`、`packages/ui-kit/src/shapes.ts:90-135`、`packages/ui-kit/tests/distribution.spec.ts`、`packages/ui-kit/scripts/verify-pack.mjs`）。
   - 再补齐 extended FAB、多选 chips、sheet、cover badge、gesture board、ray menu、collapsible card 七组表达性交互原语；polygon 形状在未提供显式路径时自动派生收缩 pressed 与放大 expanded 几何，显式路径仍优先（`packages/ui-kit/src/md3e.tsx`、`packages/ui-kit/src/shapes.ts:59-119`）。
   - 独立包的交互契约继续收口：Sheet 支持 Escape、Tab 环回与关闭后焦点恢复；GestureBoard 使用 `grid → row → gridcell` 语义、roving tabindex 与方向键/Home/End 导航，同时保留点选和拖绘；RayMenu 提供方向键、Home/End、Escape 导航；CoverBadge 暴露 tone/pulse 状态；`getXMd3eShapeStyle` 可直接给外部项目生成三相 CSS 变量（`packages/ui-kit/src/md3e.tsx`、`packages/ui-kit/src/tokens.ts`）。

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
- `pnpm --filter @hibernalglow/xaihi-ui-kit typecheck` → **rc=0**；`pnpm --filter @hibernalglow/xaihi-ui-kit test:unit` → **rc=0，5 files / 26 tests passed**；`build`、`verify-pack` 均 **rc=0**（打包读回 36 个形状，CSS 57244 B，root/subpath 类型 consumer 通过，并可导入完整主题 token 名称表）。测试覆盖 21 个公开色彩槽与样式消费一致、triangle 三相路径、Sheet 语义关系、GestureBoard 连线与键盘网格导航、RayMenu 菜单关系、CoverBadge 状态及竖向滑杆的输入/填充轨道几何（`packages/ui-kit/tests/tokens.spec.ts`、`packages/ui-kit/tests/components.spec.tsx`、`packages/ui-kit/tests/gesture-board.spec.tsx`）。
- 本次继续按 Rossi / Rhythm digest 补齐独立包 tabs 的键盘契约：`XMd3eTabs` 采用 roving tabindex，Left/Right 循环并跳过禁用项，Home/End 定位首末可用项，受控 `value` 同步自动激活；API 写入 `packages/ui-kit/README.md`。`pnpm --filter @hibernalglow/xaihi-ui-kit test:unit` → **rc=0，6 files / 28 tests passed**；`typecheck` → **rc=0**；`build` → **rc=0**；`verify-pack` → **rc=0**，真实 tarball consumer 读回 `shapes=36`、`cssBytes=57244`。
- 对照 digest 中 Rossi 单选分段与多选 chip 的不同契约，为 UI kit 的 `XMd3eSegmentedTrack` 增加 `radiogroup/radio` 语义、roving tabindex、方向键循环、Home/End 与禁用选项跳过；Shellect 已提供组标签并实际消费此组件（`plugins/shellect/frontend/Md3eManager.tsx:179-189`）。独立交互测试覆盖受控更新与缺失值恢复（`packages/ui-kit/tests/segmented-track.spec.tsx`）；tarball verifier 同时检查 components 子路径导出与外部 TSX consumer 用法。完成后 `pnpm --filter @hibernalglow/xaihi-ui-kit test:unit` → **rc=0，7 files / 30 tests passed**；`typecheck` / `build` / `verify-pack` 均 **rc=0**，consumer 读回 `shapes=36`、`cssBytes=57244`。
- Recycleu 的 MD3E 面完成业务专属拨盘迁移：`Md3eView.tsx` 新增 `RecycleuPulseDial`，用厚轨 SVG、12 刻度、状态中心和 `data-progress-arc` 读回替换 Legacy `AnimatedCircularProgressBar`；Recycleu 原有 ExecuteButton 引信/Hazard 语义保持不变。专项用例读回 `data-ui-variant="md3e"`、progressbar 的 42% 和首次危险点击的 `armed` 阶段（`Component.test.tsx`）。自定义配置单跑结果为 **rc=1，19 tests：16 passed / 3 个既有 Legacy 用例失败**（短卡遗留文案占位、两项配置弹层命名）；新 MD3E 专项单跑 **rc=0，1 passed / 18 skipped**。`pnpm --dir packages/ui-host exec vite build --config vite.config.ts` → **rc=0**，仅保留既有大 chunk 警告。
- 浏览器回归补齐 SDK 浏览器安全子路径别名（`packages/ui-host/vitest.browser.config.ts:8-17`），`pnpm --filter @hibernalglow/xaihi-ui test:browser` → **rc=0，1 file / 2 tests passed**；23 节点双形态挂载回归 → **rc=0，1 file / 23 tests passed**。
- `pnpm --filter @hibernalglow/xaihi-ui exec vitest run src/nodes/shellect/Component.test.tsx` → **rc=0，1 file / 6 tests passed**；`WorkspaceWindowRestorer`、`FloatingComponentWindow`、`workspaceBackendLifecycle` → **rc=0，3 files / 24 tests passed**。
- Cleanf 新增的 MD3E 动作链用例单独执行 → **rc=0，1 test passed**，覆盖预设切换、预演状态和 runner 输入；多选 chips 增加显式 `aria-label`，不依赖内部文本或图标推导名称（`packages/ui-host/src/nodes/shared/Md3eExpressiveKit.tsx`）。该文件保留在 Vitest 默认清单之外，因为其中既有 legacy 用例当前有失败；不能以新增用例为由把整份未稳定套件纳入默认回归。
- 实浏览器审查发现旧界面顶栏没有直接进入 MD3E 的控件，且原 MD3E 返回按钮在 380px 以下消失；修复后 `pnpm --dir packages/ui-host exec vitest run -c vitest.config.ts src/lib/design-theme/md3e-workbench.test.ts` → **rc=0，1 file / 9 tests passed**，覆盖 legacy→MD3E 点击、320px MD3E→Legacy 点击与 store 回读。
- `pnpm --dir packages/ui-host exec vite build --config vite.config.ts` → **rc=0**，production bundle 生成成功；仍有上游的大 chunk 警告（848.51 kB index、1598.37 kB flow view），本轮未改构建分包策略。
- 本轮 `pnpm --filter @hibernalglow/xaihi-ui typecheck` → **rc=1**，`check-types` 报 own=37、ported=2462、otherPackages=40；代表性错误在 `packages/contract/src/index.ts:209` 与 `versionRange.ts:70-71`，完整输出仍有 2534 条，不能作为本轮改动通过类型验证的证据。
- 浏览器现场 `http://127.0.0.1:5188/`：Shellect MD3E 在 240×720 截图中无绿色残留，`document/body.scrollWidth=240`；滚轮后 Shellect 内部 `scrollTop=159`、页面 `scrollTop=0`，证明滚动落在节点内部。证据：`/tmp/xaihi-md3e-audit/shellect-240-after.png`。
- 启动策略已有单测、配置读回和浏览器现场证据：Restorer 在 `componentWindows="browser-popup"` 时不恢复，profile dump 读回 `web-runtime.config.openBrowser=false`；Vite 和 workspace service 也不再自动拉起浏览器。无头浏览器打开 `http://127.0.0.1:5188/` 后仅有一个 `Xaihi` 页面标签，没有额外的 Shellect 浮窗标签。全仓 UI Host 测试仍有与本轮无关的 Rossi/compact browser 既有失败，未将其归因于本次改动。
- 另修复浏览器恢复旧地址时的 `?node=<id>` 误判：只有检测到 `dshDesktop.xaihiWindow.open` 的原生壳才按 `node` 进入独立节点窗；普通浏览器继续渲染工作台，明确的 `floatingComponent` popup 仍保留（`packages/ui-host/src/App.tsx`）。
- 继续修复浏览器会话恢复旧浮窗：`floatingComponent` 只有在同源工作台仍是当前 opener 时才进入浮窗面；孤立旧弹窗会清掉浮窗查询参数并回到工作台。针对性测试 **rc=0，8 tests passed**；真实浏览器验证：孤立 Shellect URL 自动回到 `/`，当前工作台 `window.open` 的 Shellect 浮窗仍正常渲染。
- 再收口一次浏览器恢复边界：孤立的 `?node=` / `?moduleId=` 地址也会在普通浏览器中清理，原生壳检测到 `dshDesktop.xaihiWindow.open` 时保留节点子窗语义；针对性恢复测试 **rc=0，2 files / 20 tests passed**。DSH profile 读回 `web-runtime.config.openBrowser=false`（`pnpm exec dsh --profile xaihi --dump-config` **rc=0**）。
- 再修复 Chrome 会话恢复把旧 BitV 浮窗误认成当前 popup：浏览器浮窗 URL 现在携带按组件生成的会话凭证，并由 opener 的 `sessionStorage` 校验；缺凭证或凭证过期的旧窗口会清掉 `floatingComponent`、`popupToken` 等地址并尝试关闭，当前工作台主动打开的 popup 仍可进入独立节点面（`packages/ui-host/src/backend/browserPopup.ts`、`packages/ui-host/src/backend/adapters/web.ts`、`packages/ui-host/src/App.tsx`）。针对性单测 **rc=0，3 files / 19 tests passed**；文档构建 **rc=0**。
- 当前缺少 `desktop/dsh` 子模块依赖与构建产物，`node desktop/dev-shell.mjs check` → **rc=1**；因此本轮桌面壳启动前校准逻辑仅通过 `node --check` 与 diff 检查，未声称完成桌面壳实机启动验证。
- 继续按 digest 的窄容器契约推进共享 MD3E 原语：英雄工具栏、色调区动作、命令坞在 360px 以下强制进入可收缩/换行轨道；Findz 底部扫描动作、Recycleu 间隔预设、Repacku 横向开关组和 Marku 状态摘要补齐 `min-width: 0`、容器级换行与可用宽度约束。全节点 Chromium 布局套件最终 **rc=0，3 files / 26 tests passed**（23 个节点 + 工作台渲染 + Shellect 240px 专项），并保留故意插入 500px 元素的阳性溢出对照。
- 23 节点双视图挂载专项补上 UI kit 测试解析别名后 **rc=0，3 files / 34 tests passed**；这验证了每个节点在 `uiFace=legacy` 与 `uiFace=md3e` 下都能独立挂载，MD3E 面不会依赖宿主运行时才解析。
- 独立 UI kit 分发链再次实跑：`test:unit` **rc=0，7 files / 31 tests passed**，`typecheck` **rc=0**，`build` **rc=0**，`verify-pack` **rc=0**；临时 tarball consumer 读回 `shapes=36`、`cssBytes=67063`，root、components、md3e、shapes、tokens 五个入口均可导入。
- 约束门禁同步复跑：`check:pins` **rc=0**（88 条 DSH 依赖核对到 `0.2.0-rc.2` 规则），`check:installable` **rc=0**（26 个 bundle 包可 `file:` 安装）；本轮修改 `git diff --check` **rc=0**。
- 继续按 Rossi / Rhythm 的窄面板与内部滚动契约补齐 Shellect Chromium 判据：240px 宽真实 Chromium 容器检查根面与全部子项边界、统计区宽度、内部滚动、独立主题 token 消费及关键动作控件；故意追加 500px 子项的阳性对照能被同一判据识别。`pnpm --filter @hibernalglow/xaihi-ui test:browser` → **rc=0，2 files / 3 tests passed**。
- 浏览器用例同时将旧 `?node=sleept` 浮窗假设更新为当前降级契约：普通浏览器继续显示工作台顶栏和画布，独立节点窗只由原生壳能力决定。`WorkspaceWindowRestorer` 与 23 节点双形态挂载专项 → **rc=0，2 files / 31 tests passed**；`pnpm check:pins` → **rc=0，88 条 DSH 依赖均核对到 0.2.0-rc.2**；`pnpm check:installable` → **rc=0，26 个 bundle 包可 file: 安装**。
- ui-kit 再次以实际 tarball consumer 验证分发入口：`test:unit` **rc=0，7 files / 31 tests passed**，`typecheck` **rc=0**，`verify-pack` **rc=0**，读回 `shapes=36`、`cssBytes=67063`；此证据覆盖包入口、root/subpath TSX consumer、22 个主题 token 和静态样式。
- Shellect 包级单测 **rc=0，1 file / 2 tests passed**。包级 `typecheck` 当前 **rc=1**：忽略的 `plugins/shellect/lib/native/*.mjs` 构建产物没有配套声明文件，继而产生服务端与 CLI 连锁类型错误；本轮没有生成或覆盖该忽略目录中的构建产物。全部节点仍需逐类浏览器视觉核验；本次仅对 Shellect 240px 布局做了真实 Chromium 几何验证，不将它外推为 23 节点完成验收。
