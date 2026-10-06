# ADR-0006 UI 的真源是 Xiranite 现成实现，不自建组件层

状态：接受（2026-10-06）
决策人：HibernalGlow
相关：ADR-0001（UI 传输）、ADR-0002（自包含与自带 patch）、`docs/service-mapping.md`、
`<Xiranite>/docs/adr/0069-keep-node-cli-tui-gui-triad-with-clap-ratatui-react.md`

## 背景

用户两次纠正同一件事之后落这篇。第一次纠正后，我把"工作台 UI"理解成"要在 DSH 宿主里自建
一套"；第二次纠正后，我又把它降级成"自建一个 ui-kit 组件层 + 一条上色门禁"。两次都**没有
先去读 Xiranite 里已经写好的那一份**，而是从零发明一套，再用自己发明的尺去量自己。

真源是现成的。以下数字本次逐项复核（只读 `<Xiranite>`，未改动它）：

**工作台是 React，不是别的。**
- `src/` 下 `.tsx` **558** 个、`.svelte` **0** 个。
- `src/components/{workspace,views,modules,ui}` 共 **231** 个（73 / 40 / 14 / 104）。

**每个节点自带一套 GUI，这件事上游已经在做。**
- `src/nodes/<id>/` 共 **31** 个节点目录；单节点最重的一份是 `src/nodes/sleept/`
  （该目录 `.tsx` 合计 **1671** 行，其中 `Component.tsx` 692、`controls.tsx` 391）。
- 注册表 `src/components/modules/packageModules.generated.ts`（生成物，96 行）**已经在做
  逐节点懒装载**，形态逐字为
  `bandia: () => import("@/nodes/bandia/entry") as Promise<{ default: AppNodeEntry }>`。
  也就是说"每节点一套 UI、按 id 动态取"上游已经有了，不需要我设计。

**共享形状与设计语言也都是现成的。**
- `src/nodes/shared/`（40 项）：`ExecuteButton`、`Local*Preview` 与 `Local*PreviewDialog`、
  `NodeConfig*`、`NodeRunHistoryPopover`、`NodeRuntimeContext` 等。
- `src/lib/design-theme/`：`contract.ts` 476 行、`registry.ts` 100、`apply.ts` 163、
  `contrast.ts` 49、`domColor.ts` 74。
- 六套设计语言，`contract.ts:28` 逐字为
  `AppDesignThemeId = "native" | "md3" | "mondrian" | "wuling" | "swiss" | "lonestar"`。
  **一处更正**（复核时发现，口述里"各带 spec.ts/resolve.ts"不成立）：`native` 没有自己的
  目录，它是 `registry.ts:31` 里一条**真实注册项**，语义是显式 no-op，**不是**"没找到主题"的
  兜底分支；`md3` 是完整模块（`color` / `mapper` / `resolve` / `seed` / `space` /
  `tokens.generated`）；`mondrian` 是 `palette.ts + resolve.ts`；只有 `wuling` / `swiss` /
  `lonestar` 三套是同形的 `spec.ts + resolve.ts`。
- 维度开关 `DESIGN_DIMENSIONS = [color, shape, elevation, typography, motion, states,
  geometry]`（`contract.ts:35`，7 个）：关掉某个维度即回落到颜色主题，是逃生阀不是装饰。

Xaihi 这边与之对应的东西**全是我自己造的**：`packages/ui-kit`（11 个文件）、
`scripts/check-panels.mjs`（179 行）、以及 `PanelProps` + `Probe`
（`packages/ui-host/src/client/loader/probe.ts` 往 `globalThis.__XAIHI__` 上写的观测对象）。

## 决定

1. **UI 一律移植，判据是保真不是好看。** 工作台与每个节点的那套 UI 都从 `<Xiranite>` 搬，
   逐文件对齐。"更好看"不是理由，"我重写一版更干净"更不是。
2. **共享形状只从 `src/nodes/shared/` 搬。** 不在 Xaihi 里另立一套"通用组件"；要新增共享
   形状，先回到上游问它该不该在那里长出来。
3. **UI 层契约以 `AppNodeEntry` / `HeadlessNodePackage` 为准**
   （`<Xiranite>/packages/contract/src/index.ts:571` 与 `:555`）。Xaihi 现在的
   `PanelProps` + `Probe` 是它的**子集**，要补齐到能表达上游那套，而不是与之并列的第二套契约。
4. **`packages/ui-kit` 与 `scripts/check-panels.mjs` 停掉退回。** 后者不只是"不再需要"，是
   **形状错**：它把"我发明的那个包"定义成唯一合规出口，于是"什么算对"由我自己的实现说了算
   —— 一个自证循环的尺。
5. **Material You 降级成 `md3` 这一份语言，不再默认。** 六套语言里 `md3` 只是其中一套；
   把一个候选提成默认值，等于替使用者选了设计语言。

## 后果

### 逐文件退回清单

| # | 路径 | 处置 | 现状（2026-10-06 21:30 复核） |
|---|---|---|---|
| 1 | `scripts/check-panels.mjs` | 删（179 行） | **已删**（`D`） |
| 2 | `packages/ui-kit/` | 删（11 个文件） | **仍在**，待删 |
| 3 | 根 `package.json` 的 `check:panels` 行 | 删 | **已去**（现 `test` = pins → skills → installable → build → typecheck → test:unit） |
| 4 | `.github/workflows/ci.yml` | 同步去门禁 | **已改** |
| 5 | `plugins/linedup/frontend/Panel.tsx` | 退回 | **已改** |
| 6 | `plugins/sleept/frontend/Panel.tsx` | 退回 | **已改** |
| 7 | `plugins/dissolvef/frontend/Panel.tsx` | 退回 | **已改** |
| 8 | `plugins/hello/frontend/Panel.tsx` | 退回（脚手架样例） | **已改** |
| 9 | `plugins/findz/frontend/Panel.tsx` | 退回 | **待改**（该包未进 git，不在 `status` 里） |
| 10 | 各 `plugins/*/package.json` 的 ui-kit devDep | 删 | 4 个已删 1 行，#9 待改 |
| 11 | `packages/create-xaihi-plugin/{src/index.ts,tests/scaffold.spec.ts}` | 退回（不再生成 kit 用法） | **已改** |
| 12 | `packages/ui-host` 的 `PanelProps` + `Probe` | 补齐到上游契约（决定 3） | **待改** |
| 13 | `pnpm-lock.yaml` | 随依赖变化 | **已改** |

### 不跟着退回的部分

退回的是"自建组件层"，不是所有结论。下面这些与"谁是真源"无关，继续有效：

- **实测到的 `--dsw-alias-*` 真名**（这台装配的 CSSOM 里有 107 个；照前缀规律拼出来的一律
  `unset`）。上游的 `native` 语言同样要吃 DSH 的变量，这份名单对移植有用。
- **`ctx.theme.overrideTokens(source, tokens)` 的边界**：主题进不了远程模块，只能由宿主半边
  叠上去。这与"几套设计语言"无关，是 DSH 给的通路。
- **对比度（AA）的判法**：判定本身保留，但**归口改到语言契约**（`design-theme` 的
  `contrast.ts` 已经有一份 49 行的实现），不再由 Xaihi 自己扛一条门禁。
- **与 UI 无关的切片**（`/xaihi/*` 路由、operation stream、ledger、节点契约与迁移纪律）
  一行不动。

### 要显式作废的文档段落

不删原文（"当初为什么这么想"要能被读到），但必须**逐处标注作废**并指向本 ADR：

- `docs/stages/step-4.md` §18、§20、§22、§24（UI Kit、面板上色、状态层与对比度门禁、入口文档里的门禁行）
- `.dsh/skills/xaihi-node-ui/SKILL.md` 的"上色只有一个出口"一节
- `CONTEXT.md` 的 **UI Kit（上色出口）** 词条，以及 `layered fallback` / `state layer` 两条里
  以 kit 为出口的措辞
- `docs/roadmap.md` 里 R1 / R2 的表述（它们是照着"kit 是唯一出口"写的）
- `README.md` / `README.zh.md` 的门禁行与"UI Kit"提法

## 裁定：终端面（CLI / TUI）纳入搬运，与 GUI 同批

用户 2026-10-06 直接下口径："命令行、tui 也要搬过来"。所以 `docs/service-mapping.md:16`
里"CLI / TUI 面不搬：节点动作经 `defineNode` 变成工具就是模型面"这条**作废**——那个理由只覆盖到
"命令能触发动作"，覆盖不到终端上那套交互设计（trename 的路径 diff、JSON 树、冲突面板、sleept 的倒计时视图）。
`xaihi-migration` 技能"已判定不搬的清单"里的 `CLI-TUI` 条目同步作废（那次提交由本文件所属 lane 一并处理）。

实测到的现成件（只读 `<Xiranite>`）：

| 事实 | 出处与数字 |
|---|---|
| 每个节点是**四面结构** | `<Xiranite>/packages/nodes/*/src/`：30 个节点各带 `core.ts` / `cli.ts` / `Tui.tsx` / `interaction.ts`（各 **30** 份）；判据原文在 `<Xiranite>/docs/adr/0069-keep-node-cli-tui-gui-triad-with-clap-ratatui-react.md`（"四面结构、GUI 统一不打散、禁止在 face 里重写业务逻辑"），0073/0074 只换掉了实现方式（Rust `clap`+`ratatui` → Node/Bun 的 `citty`/`Clack`/`OpenTUI`） |
| 终端面不是"另一套界面"，是同一棵 React 树的第二个渲染器 | `packages/cli/package.json`（`@xiranite/cli`，带 `bin`，依赖里逐个点名节点包如 `@xiranite/node-linku`）与 `packages/cli-runtime/package.json` 都吃 `@opentui/react@0.4.5` + `react@19.2.4` |
| TUI 运行时已成型 | `packages/cli-runtime/src/tui/` 共 **22 个 `.tsx`**（`app`、`help-screen`、`action-launcher`、`task-queue-screen`、`workbench-controls`、`chrome-actions`、`preview-table`、`slider`、`multiline-editor`、`text-input`、`theme.tsx`），另有 `termcn-registry/`、`components.json`、`scripts/` |
| 单节点体量 | `packages/nodes/sleept/src/cli.ts` **885** 行、`Tui.tsx` **544** 行 |
| Xaihi 现状 | 仓内 `cli.ts` 与 `Tui.tsx` 各 **0** 个 |

**因此搬运口径加一条**：搬节点 UI 时 DOM 面与终端面**一起走**，不许只搬 GUI 那份把 TUI 当"以后再说"。

**仍然未定的是落点**（本机实测，不猜）：`dsh --help` 的例子写着 `dsh tui --patch ./extra.yml` 与
`dsh tui --resume <session>`，但 `dsh --profile tui --dump-config` 报
`Error: dsh: profile "tui" does not exist; create it with 'dsh plugin --profile tui add <package>'`，
`@deepseek-ai/dsh@0.2.0-rc.2` 的 `lib/` 里也只解析到 `@deepseek-ai/dsh-app-boot` ——
这台机器上**没有随包发布的 tui profile 模板**，所以"DSH 的终端宿主能不能装载插件"是未证状态。
三条出路：(a) 提 proposal 要 TUI 开放插件贡献面；(b) 由 Xaihi 自带 OpenTUI 入口包（会碰"不做独立壳"那条原则，
要另开 ADR）；(c) 只搬 CLI 面不搬 TUI。**未定之前不许顺手做**，判据挂在 `docs/roadmap.md` 的 R11。

## 我认的错

这次不是"把迁移产物当设计"（那只是懒），而是**放着使用者已经写好的设计没去看，自己造了一份**。
两次纠正之间我还在同一条路上走得更远（给自造的组件层补门禁、补状态层、补对比度测试），
把"我自己定的规则"验得越来越绿。判据错的时候，越绿越危险。
