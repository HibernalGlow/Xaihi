# ADR-0006 工作台与节点 UI 一律移植 Xiranite 现成实现，不自建组件层

状态：接受（2026-10-06）
决策人：HibernalGlow
提出人：Claude（本 ADR 记录的是用户对我的纠正）
相关：ADR-0001（传输）、ADR-0002（自包含包）、`docs/roadmap.md`、`docs/stages/step-4.md` §18/§20/§22/§24

## 背景

我在批准过的计划里写了两句：**"第一套风格 = Material You"** 与 **"token alias 层 + 自建 M3 UI Kit 现在做"**
（D6 / D12）。这两句是我对用户意图的转述，不是他说的话。然后我按自己写的计划一路执行，落了：

- `packages/ui-kit`（我凭空写的 `XPanel` / `XButton` / `XField` + 一份 `KIT_CSS`）
- `scripts/check-panels.mjs`（强制"面板只能 import 我这个包"的门禁）
- 五个节点面板 + 脚手架生成模板改成引 kit
- Material You 别名层 `packages/ui-host/src/client/theme/material-you.ts`

2026-10-06 用户叫停：**"整个工作台的 UI 就是直接引用我原本那个项目的工作台，然后每个节点它自己有一套自己的 UI"**。

### 实测到的现成 UI（`Xiranite`，只读，未改动）

| 事实 | 出处与数字 |
|---|---|
| 工作台是 React，不是 Svelte | `src/` 下 **558 个 `.tsx`**、**0 个 `.svelte`**；入口 `src/App.tsx`（82 行） |
| 工作台 UI 主体 | `src/components/{workspace,views,modules,ui}` 共 **231 个 `.tsx`**；另有 `context-menu/`、`niko-table/`、`data-table/`、`help/`、`theme-provider.tsx`、`use-theme.ts` |
| 每个节点自带一套 UI | `src/nodes/<id>/`，**31 个**，形状一致：`entry.ts` / `Component.tsx` / `controls.tsx` / `constants.ts` / `types.ts` + `Component.test.tsx` + `*.browser.test.tsx` |
| 单节点体量 | `src/nodes/sleept/` **1671 行**（`Component.tsx` 27 KB、`controls.tsx` 15 KB、两份测试） |
| 注册表已经是现成的 | `src/components/modules/packageModules.generated.ts`：`sleept: () => import("@/nodes/sleept/entry") as Promise<{ default: AppNodeEntry }>`；类型来自 `@xiranite/contract`，并区分 `HeadlessNodePackage`（有内核无 UI） |
| 节点间共享的形状已经是现成的 | `src/nodes/shared/`：`ExecuteButton`、`LocalImagePreview(Dialog)`、`LocalAudioPreviewDialog`、`LocalVideoPreview(Dialog)`、`LocalMediaPreview(Panel)`、`NodeConfigPopover`、`NodeConfigSourceView(.css)`、`NodeRunHistoryPopover`、`NodeConfigHistoryPanel`、`NodeRuntimeContext` |
| 设计语言已经是现成的、而且是多套 | `src/lib/design-theme/`：`contract.ts` 476 行、`registry.ts` 100、`apply.ts` 163、`contrast.ts` 49、`domColor.ts` 74；语言各一目录 `swiss/ lonestar/ mondrian/ wuling/ md3/`，每份 `spec.ts` + `resolve.ts` + 测试；主题 id 表 `native \| md3 \| mondrian \| wuling \| swiss \| lonestar`，另有 `DESIGN_DIMENSIONS` 按维度开关 |

结论：**形态早就定了，在我动手之前就以代码形式存在。** 我要做的是搬运，不是设计。

## 决定

1. **UI 的真源是 Xiranite 的实现**：工作台外壳与每个节点面板都从上面那些路径移植过来，
   不改设计风格、不另立组件层、不"顺手优化"形状。搬运的判据是**保真**，不是好看。
2. **共享形状只能从 `src/nodes/shared/` 搬**，不许新写。节点需要的预览/配置/运行历史/危险确认
   这些口子，那份目录里已有名字，照搬并保留其测试。
3. **UI 层契约以 `AppNodeEntry` / `HeadlessNodePackage` 为准**。Xaihi 现在的 `PanelProps` + `Probe`
   是我自己起的小子集，要按用户那份补齐（预览、配置、历史、headless 区分），不是反过来。
4. **`packages/ui-kit` 与 `scripts/check-panels.mjs` 停掉并退回**：包括把它们接进
   根脚本 / CI / 五个面板 / 脚手架模板的那部分。`check-panels` 的错误不只是内容错，
   而是**形状错**：它把"我自己发明的包"定义成唯一出口，于是任何后来的真实 UI 都会被它判违规。
5. **门禁不许建立在未经确认的形态上**。这条是本 ADR 的可执行教训：任何"禁止 X"的尺，
   落尺之前必须能回答"X 的反面是不是用户已经写好并批准的东西"。
6. Material You 那层不废弃但**降级**：搬 `design-theme` 时它就是 `md3` 那一份语言，
   与 `swiss` / `lonestar` / `mondrian` / `wuling` 平级，由 `registry` + `DESIGN_DIMENSIONS` 管，
   不再是工作台的默认长相。
7. **CLI 与 TUI 同样在搬运范围内**（2026-10-06 用户补的口径，推翻 `docs/service-mapping.md` 里
   "CLI/TUI 面不搬、由 DSH 的 commands + agent tools 替"那条判断）。实测到的现成件：

   | 事实 | 出处 |
   |---|---|
   | 终端 UI 是**同一棵 React 树的第二个渲染器** | `packages/cli/src` 与 `packages/cli-runtime/src` 都依赖 `@opentui/react@0.4.5` + `react@19.2.4` |
   | TUI 运行时已成型 | `packages/cli-runtime/src/tui/`：`theme.tsx` + `tui/opentui/{app,help-screen,action-launcher,task-queue-screen,workbench-controls,chrome-actions,preview-table,slider,multiline-editor,text-input}.tsx`，共 **22 个 `.tsx`**，另有 `termcn-registry/`、`components.json`、`scripts/` |
   | CLI 是带 bin 的入口包，且**按节点接线** | `packages/cli/package.json`：`@xiranite/cli` 有 `bin`，依赖里逐个点名节点包（`@xiranite/node-linku` 等） |

   也就是说 TUI 不是"另一套界面"，而是 `src/nodes/<id>` 那套组件在终端里的渲染目标——搬运节点 UI 时
   它的两个渲染面（DOM 与 OpenTUI）要一起过去，不能只搬 DOM 那份。

   **DSH 侧未解决的一条**（本机实测，不猜）：`@deepseek-ai/dsh@0.2.0-rc.2` 的 `--help` 例子写着
   `dsh tui --patch ./extra.yml`、`dsh tui --resume <session>`，但
   `dsh --profile tui --dump-config` 直接报
   `Error: dsh: profile "tui" does not exist; create it with 'dsh plugin --profile tui add <package>'`
   ——这台机器上**没有随包发布的 tui profile 模板**，`lib/` 里也只解析到 `@deepseek-ai/dsh-app-boot`。
   所以"TUI 宿主能不能装载插件 UI"目前是**未证**状态：要么上游有 tui bundle 我们没装到，
   要么 TUI 入口得由 Xaihi 自己带（那就是一条新的 ADR，不能顺手做）。
   判据留在 `docs/roadmap.md` R11。

## 后果

### 要退的清单（按文件，不是按心情）

- 删：`packages/ui-kit/**`、`scripts/check-panels.mjs`
- 根 `package.json`：摘掉 `check:panels` 与 `pnpm test` 链里的那一段
- `.github/workflows/ci.yml`：摘掉 `pnpm check:panels` 那一步
- 面板回到搬 kit 之前的形状（或直接进 `src/nodes/<id>` 的移植版）：`plugins/{hello,linedup,dissolvef,sleept}/frontend/Panel.tsx`
  与 `plugins/findz/frontend/Panel.tsx`（最后这份属另一条 lane，改动前要打招呼）
- `packages/create-xaihi-plugin/src/index.ts`：生成模板里的 Panel 不再引 kit
- 文档里作废的段落要显式标注作废而不是删掉假装没发生：`docs/stages/step-4.md` 的 §18（UI Kit 整节）、
  §20（kit 收口与 `check-panels`）、§22（kit 状态层 + AA 尺，AA 的判法可以留给 design-theme 的
  `contrast.ts` 用）、§24 的四门禁表述；`.dsh/skills/xaihi-node-ui/SKILL.md` 的
  "上色只有一个出口（有门禁）"一节；`CONTEXT.md` 的 **UI Kit（上色出口）** 词条；
  `README.md` / `README.zh.md` 门禁表里的 `check-panels` 行。
  （涉及的 change-ID：`zkz`、`vox`、`mtw`、`ynq`、`qxz`、`mpp`。sha 会被 Butler 重写，别拿 sha 当锚。）

### 仍然有效、不必退的东西

- `--dsw-alias-*` 那批**实测名字**（`bg-layer-1` / `label-primary` / `label-secondary` /
  `border-l2` / `interactive-bg-hover` / `label-primary-inverted` / `state-error-primary`）：
  它们来自 CSSOM 现读，任何主题语言要落回宿主都得用真名。
- "主题只经 `ctx.theme.overrideTokens(source, tokens)` 写、DOM 由宿主 presenter 持有"这条边界。
- `contrast.ts` 之外我们那条 AA 尺的**判法**（配对表 + 明暗两侧 + 三条对照）可以照搬到 design-theme 的
  每种语言上，因为用户那份 `contrast.ts` 只有 49 行，是工具不是门禁。
- 与 UI 无关的切片全部保留：运行账本 / 耐久 ledger / 装机路径 / `check:pins` / `check:skills` /
  `check:installable` / 节点批次 A–D 的后端半边。

### 搬运的工作量（按实测报，不报"大概"）

工作台主目录 231 个 `.tsx` + 31 个节点目录（单节点示例 1671 行）+ `design-theme` 862 行核心契约。
这不是一次会话能做完的量，要按节点分批、每批带它自己的测试一起搬；顺序与批次划分待用户拍板
（我在会话里问了三个待决问题：退回时机、先工作台还是先一个节点、`node-definitions/*.json` 与
`AppNodeEntry` 谁当真源）。

### 我认错的一条

`docs/roadmap.md` 的 R1/R2（状态层、对比度门禁）现在看是**在为错误的层做收尾**：R1 直接撤，
R2 的判法转给 design-theme 的语言契约。教训与
[[feedback-migration-artifacts-are-not-design]] 同一族，但这次更糟：不是把迁移产物当成设计，
而是**放着用户已经写好的设计没去看，自己造了一份**。以后凡是"形态"问题，先去读真身再说话。
