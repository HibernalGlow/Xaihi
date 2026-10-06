# ADR-0006 UI 的真源是 Xiranite 现成实现，不自建组件层

状态：接受（2026-10-06）
决策人：HibernalGlow
相关：ADR-0001（UI 传输）、ADR-0002（自包含与自带 patch）、**ADR-0007（组件放置：四层落点）**、
`docs/service-mapping.md`、
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
| 终端面**不是**网页组件的第二渲染器，而是**同一核心的另一个前端**（实测：`packages/cli/**` 与 `packages/cli-runtime/**` 里没有任何一处 import `src/nodes` 的 React 组件，唯一命中是句注释；共享点在 `contract`/`api`/节点核心那层） | `packages/cli/package.json`（`@xiranite/cli`，带 `bin`，依赖里逐个点名节点包如 `@xiranite/node-linku`）与 `packages/cli-runtime/package.json` 都吃 `@opentui/react@0.4.5` + `react@19.2.4` |
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

## 分发形状：三面同一个 npm 包（2026-10-06 用户纠正，我上一条写错了）

我写过"节点核心必须拆成 `packages/nodes/<id>`，否则 CLI/TUI 拿不到它"——**那是我凭空造的约束，在此收回**。
真实要求是：网页面、CLI、TUI **装在同一个 npm 包里**，三面各自独立安装、同一个仓一起维护。核心本来就是
同包内的相对 import，不存在"CLI 拿不到"。所以**不拆包、不新增跨包运行时依赖**。

支持这个判断的三条实测：

1. **带 `bin` 的包能被当 DSH bundle 装上**：临时给 `plugins/sleept/package.json` 加
   `"bin": {"xaihi-sleept": "./bin/probe.js"}` ⇒ `dsh plugin --profile xaihi add file:…` **rc=0**，
   没有 "only bundles are managed" 那类拒绝；测完把该文件退回（`bin` 已不在包内）。
2. **依赖不会被装 N 份**（我上一条写"每个使用者吞 20 MB"是错的，按用户纠正复核后收回）：
   pnpm 是**内容寻址单一 store + 每个包链接/克隆过去**，本机实测
   `~/Library/pnpm/store/v11` 只有一份（1.6 GB 装下全部：仓 + 两个 profile + 所有 `@deepseek-ai/*`），
   而今天每一次装机日志都是 `reused NNN, downloaded 0`（如 `resolved 0, reused 639, downloaded 0`、
   `resolved 249, reused 245, downloaded 0`）——**装了 6 个节点包也只下一份依赖**。
   ⇒ 结论反过来了：TUI 依赖就放普通 `dependencies`（与 Xiranite 的 `@xiranite/cli` /
   `@xiranite/cli-runtime` 一致），**不要**为了省磁盘做 `optionalDependencies`；
   自用场景里那 20 MB 只会落在 store 里一次。平台原生件仍按 ADR-0004 走 `/<pkg>-<platform>-<arch>`，
   那是"内核可执行文件"的问题，与依赖去重无关。
3. **全局 `npm i -g` 要等发布**：走 registry 与 ADR-0005 是同一条前提（`workspace:*` 只在
   `pnpm publish` 时被改写成真实版本）；开发期只能 `npm i -g file:…/plugins/<node>` 或 tarball。

React 那条不变：只有网页面受 DSH 的 **React 18.3.1** 约束，CLI/TUI 自带 **React 19.2.4** 不受影响；
TUI 也不需要 DSH 提供 tui 宿主（本机 `dsh --profile tui --dump-config` 报 `profile "tui" does not exist`，
与本路无关）。上游对"三面共享核心"这件事自己也记过账：
`<Xiranite>/docs/adr/0069-keep-node-cli-tui-gui-triad-with-clap-ratatui-react.md`。

## 修正（移植第二轮，2026-10-06）：UI 半边只认一个基线 = 移植时点的 Xiranite 工作树

第一轮把 L1/L2/L3/L4 按 tag `noxide` 搬、把设计语言按工作树搬（`noxide` 里根本没有
`src/lib/design-theme/`，实测 `ENOENT`），结果**上游自己那条尺把混基线判红了**：
`design-theme/registry.test.ts` 要求「每一份被注册的配方，中英两份 i18n 里都要有 label 与 description」，
而 `swiss` / `lonestar` 的标签既不在 noxide（连配方都没有）也不在 Xiranite 的
HEAD `2694975`（`node -e` 逐键探：`designTheme.swiss.label` 与 `designTheme.lonestar.label` 两份 JSON 全 `MISS`，
native/md3/mondrian/wuling 都在），**只活在用户的工作树里**（`git status --porcelain src/i18n` 三条 `MM`）。

⇒ 事实：使用者点名的那套界面（"swiss-lonestar 那种设计语言"）**比任何一条已提交历史都新**。
"master 在重构、别取实现"这句对**宿主半边**成立（Rust/Tauri/extism 那一坨），
对 **UI 半边**不成立——被不满意的是执行侧，不是他写好的 React 面。

### 决定

- **UI 半边**（L1 外壳 / L2 原子 / L3 `nodes/shared` / L4 `nodes/<id>` / `lib/design-theme` / `styles` /
  `index.css` / `backend` 接缝）真源 = **移植时点的 Xiranite 工作树快照**。
- **宿主半边**（节点的 `core.ts` / 算法 / 平台判定）真源仍是 tag `noxide`（D13 不变）。
- 快照必须**可 diff、可复核**，所以搬运是脚本而不是手抄：`scripts/port-ui.mjs` 把 572 个文件按
  同一张表原样复制（不改别名、不改格式、不删注释），并把每个来源的 `sha256` 记进
  `docs/port/xiranite-ui.json`。`node scripts/port-ui.mjs --check` 是尺：
  目标与快照逐字节不同即红（实测 `check: 572 tracked file(s), 0 copied, 0 out of sync, 0 missing`）。
- 上游那批 `*.test.ts` 跟着搬，并且**就是这一层的保真判据**——不另写"我想象中的期望值"。
  统一基线后 `pnpm exec vitest run` 在 `packages/ui-host` 是 **155/155 绿（17 个文件）**，
  其中 **135 条是上游原样的尺**、20 条是本仓自己的（`tests/*.spec.ts` 四个文件）。
  `*.browser.test.tsx` 仍不带：那类夹具要 Playwright/真 DOM 接线，形状还没定（清单见 `docs/port/`）。

### 这一轮顺手钉住的两个坑

1. **终端面包一进 workspace 就把全仓 pnpm 弄瘫**：`packages/{api,cli,cli-runtime,contract,logging,shared}`
   的依赖里写着 `@xiranite/*` + `workspace:*`，本仓没有那些包名，pnpm 连依赖树都解不出来——
   症状不是"那个包坏了"而是**每一条 `pnpm` 命令**（含所有门禁）报
   `Failed to resolve dependency tree: In …/packages/api: "@xiranite/file-operations@workspace:*" …`。
   与 ADR-0002 那条是同一类失败（`workspace:*` 解析不了），只是这次发生在仓内。
   落点：`pnpm-workspace.yaml` 里逐条 `!packages/<name>` 负模式，**放行条件写在文件注释里**
   （依赖图换成真实存在的包名，或改成构建期内联）。不是把包删了，也不是把规则放宽。
2. **`environment` 也是基线的一部分**：上游测试默认环境逐字是 `environment: "happy-dom"`，
   把它退回 node 会让 `domColor.ts`（canvas 解析 CSS 颜色）与 `resolve.test.ts`（getComputedStyle）
   红成一片，症状写着 "document is not defined" 而原因在配置里。换环境的连带后果也记下来了：
   happy-dom 下 `import.meta.url` 不再是 `file:` 形态，`fileURLToPath` 直接抛
   "The URL must be of scheme file"，所以本仓自己的 spec 改成以 `import.meta.dirname` 为基准。

### 品牌这条尺在这一批之后是红的（不藏，也不加白名单）

`node scripts/check-brand.mjs` ⇒ **rc=1，1003 处**，其中 **740 处落在本轮搬进来的
`packages/ui-host/src/`**，另 263 处来自终端面那几棵同样按原样搬的包。

- 为什么留着：`@xiranite/*` 与 `@/…` 这两种 import 边是**可 diff 性**的载体（ADR-0007 事实 1：
  2219 条）。搬运与改名分两批，症状才可归因——一起动，红的时候没人知道是搬错了还是改错了。
  台账已按类计数：`@xiranite/*` 的 **value 边只有 43 条**（另有 86 条是 type-only，产物里不存在），
  所以那 740 处里绝大多数是标识符与文案，不是依赖边。
- 为什么不改门禁：ADR-0010 自己写了"不许加白名单、不许靠 skip 变绿"，所以这里**不加例外**；
  `check-brand` 目前也**没有**接进根 `test` 链（实测 `package.json#scripts.test` 只有
  `check:pins`、`check:skills`、`check:installable` + build/typecheck/test:unit），
  红的是这条尺自己的读数，不是流水线。
- 改名的批次边界：`packages/ui-host/**` 与 `packages/{api,cli,…}/**` 一旦能构建，
  就按 ADR-0010 "与消费者同批"把包名/类名前缀/`data-*`/错误文案换成 Xaihi。
  **唯一要先问使用者的**是那 9 处跨语言判别符与落盘路径（`/_xiranite/backend/…`、
  `x-xiranite-token`、`XiraniteApp`）——那些改名等于数据迁移。


