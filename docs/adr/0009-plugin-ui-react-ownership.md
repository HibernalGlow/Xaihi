# ADR-0009 插件 UI 的 React 归属：自带 19 只在"独立 realm"下成立

状态：待接受（等使用者对"整个 Xaihi 用一份自己的文档、边界只放在 DSH↔Xaihi 那一刀"点头；
两条**不成立**的路线已经被实测否掉，那部分不再回头）
日期：2026-10-06
决策人：HibernalGlow
相关：ADR-0001（UI 传输，本文件改写它的第 5 条）、`docs/adr/0006-ui-source-is-xiranite.md`、
`docs/adr/0007-component-placement.md`（组件放置四层）与 `docs/adr/0008-shared-ui-package-and-l4-boundary.md`
（L2 走 MF2 `shared`、L4 每节点独立成 remote）——它们定"哪一层放什么、怎么共享"，本文件定
"**哪一份 React 渲染**"。复核结论：可以共存，只有措辞要改（见「后果」第 5 条）；
真冲突的只剩 ADR-0001 第 5 条。
搬运源仓的 `src/entrypoints/plugin-host.html`、`src/plugin-host-main.tsx`（形状与词汇的出处）

## 背景

使用者的节点 UI 与工作台都是按 **React 19** 写的（`@opentui/react@0.4.5` + `react@19.2.4`，
上游依赖的 peer 也普遍收 19），而 DSH 宿主的模块表给的是 **React 18.3.1**（实机读到
`React.version` 18.3.1）。使用者的判断是"允许插件自带 React 不就完了"。

方向没错，但**"自带 React"只是必要条件**。决定成败的不是组件 `import` 到哪个 React，
而是**谁来渲染**：元素对象与 hook 都绑定在具体那一份 React 上。

**这条已经不是假设，本仓里已经撞上了（22:5x 实测）**：搬运批次正在往 `packages/ui-host/src/` 落，
其中 `lib/pie-menu/primitive.tsx:16` 逐字 `import { createContext, use, useCallback, … } from "react"`，
用的是 React **19 才有**的 `use()`；而这一档尺是——
`@types/react@19.2.10/index.d.ts:1956` 有 `export function use<T>(usable: Usable<T>): T;`，
`@types/react@18.3.31/index.d.ts` 里**一个裸 `use` 都没有**（同文件里只有 `useContext` / `useState` 那一族），
且 `packages/ui-host` 现读的正是 `react@18.3.1` + `@types/react@18.3.31`。
⇒ 这份 vendored 文件的头注释写着"Third-party surface is react / react-dom / radix-ui only,
all of which this repo already carries"与"Departures from upstream: none"——**两句在 18 下都不成立**。
（另：`pnpm --filter @hibernalglow/xaihi-ui typecheck` 现在先红在别处
——`tsconfig.json(5,5): error TS5101: Option 'baseUrl' is deprecated`，
搬运批的 tsconfig 还没跟上，所以 `use()` 这一条**尚未被类型检查暴露**，别把"没报"读成"没问题"。）

## 实测（一次隔离宿主上的探针，两条都失败，且失败点不同）

探针包 `plugins/r19spike`（一次性，已删；未进主线，profile 已卸载）。

| 试法 | 结果 | 读数 |
|---|---|---|
| **V1**：不共享 react，把 React 19 整体打进 remote，面板直接返回 19 创建的元素 | **崩** | 宿主 React 18 报 `Minified React error #31`（`objects with keys {$$typeof, type, key, ref, props}` 不是合法子节点）——19 的元素 `$$typeof` 与 18 不同，**宿主根本不认**；同时 observatory 记到 `reactVersion: "19.2.4"`、`sameReactAsHost: false` |
| **V2**：桥那一层仍用共享的宿主 react（18）创建元素，React 19 走 `resolve.alias` 的另一个说明符 `react19`，`react-dom/client` 也指到 19 | **仍然崩** | `Cannot read properties of undefined (reading 'S')`——`react-dom@19` 内部 `require('react')` 被 MF 共享解析成**宿主的 18**，于是 19 的 renderer 拿着 18 的 internals |

**结论（实测得出，不是推理）**：同一次编译里做不到"外面是宿主 18、里面是自带 19"。
19 的 `react` + `react-dom` 必须是**一整张闭合的图**；而那张图**不能把元素交回宿主渲染**。
=> 桥只能是 **DOM 级**（宿主 18 只负责放一个容器元素）或 **跨文档**（独立 realm）。

**类型层再钉一颗钉子（22:4x，读 DSH 装好的槽契约）**：
`@deepseek-ai/dsh-client-ui-slots` 的 `lib/types/renderer.d.ts` 第 1 行自述是
"React-free contracts between the slot host and an installed renderer"，而它给渲染器的唯一入口是
`SlotRenderer.renderRoot(host, ownerProps): ReactNode`（`:244-252`）。
⇒ 插件侧唯一能交回去的是 **ReactNode**，而那个类型由**装好的那份渲染器**解释——这台装配上是宿主的 React 18。
（`ui-renderer` 那一格能否由插件占据我**没验**；但无论谁装，返回类型都是被宿主侧解释的 `ReactNode`，）
所以 **19 的元素不可能穿过这一层**（V1 的 `#31` 就是穿过时的症状）。
⇒ 能穿过去的只有 **DOM**：`<iframe>`（(a)）或"宿主只放一个容器元素 + 我们命令式挂载"（(b)）。
这不是选择，是这一层的形状定的。

DSH 的插槽每条目都有独立错误边界，所以两次崩溃都只吃掉那个面板，外壳与其余面板无恙
（读到 `slot entry crashed in 'main'` 后工作台继续可用）——这条边界是这次能连续试错的前提。

## 更正（22:3x，逐字读完他那份装载器之后；推翻我上一条对它的归因）

我原本写"用使用者自己已经写好的那条 ⇒ 它天然满足插件自带 React 19，因为它隔离了插件"。
读完 643 行的 `src/plugin-host-main.tsx` 之后，**方向对、归因错**，逐条更正：

1. **它不是"隔离装载器"，是同一个应用的第二个顶层文档。** 它自己的头注释（`:2`、`:12-14`、`:18`）原话是
   "Dev/POC entry point for a frontend plugin built **outside this repository**"，
   "The page registers the remote with **the host's** Module Federation instance and renders it through
   `ModuleRenderer` — **the same component the product workspace uses** — so what this proves is the
   integration path, not a bespoke preview"，并且 "**Deliberately absent**: the plugin manager
   (install/update/registry/`.xplugin`) and `manifest.toml`"。
   ⇒ React 19 之所以成立，是因为**它是一份自己的文档**（自己的 JS 上下文），不是因为它有沙箱。
2. **他合同里本来就有这四档隔离，词是他写的**：`packages/contract/src/index.ts:468`
   `NodeIsolationMode = "trusted" | "contained" | "iframe" | "worker"`，挂在
   `NodeHostRequirements.isolation?`（`:504`）。语义在 `docs/node-host-capability-contract-plan.md:322-328`：
   `trusted` = 直连 React 渲染 + Error Boundary；`contained` = 再加 CSS containment
   （`contain: layout paint style; isolation: isolate`）；**`iframe` = "third-party node rendered in
   iframe bridge"**；`worker` = 非 UI 内核走 worker/RPC。
   同一份计划文档原话 **"Do not implement iframe/worker in the first PR unless explicitly requested"**，
   而 `docs/plugin-architecture.md:102` 自己记账："`NodeIsolationMode`（trusted|contained|iframe|worker）
   **全仓零消费者**"。我复核过：`rg isolation src packages` 除 CSS 的 `isolation: isolate` 外没有一处读它。
   ⇒ **词是他的，桥不是他写的。** 所以本 ADR 的 (a) 要说成：
   **采纳他的 `iframe` 档命名 + 他的 `AppNodeEntry`/`NodeHostApi` 契约 + 他的装载器外壳，
   而 DSH 侧那半边（放 `<iframe>` 与走 `postMessage`）是 Xaihi 要新写的第一份消费者**——
   这正是他留的那个口子（"unless explicitly requested"），而 V1/V2 的实测冲突就是 request 的理由。
   把它写成"照搬他已有的东西"就又是 ADR-0006 记过的那个错。

## 规模（实测，只读搬运源仓，未改动它）

两种口径都要记，因为结论随口径变。尺：正则扫 `import … from "…"` + `import("…")` + `require("…")`，
只解析 `@/` 与本目录相对路径，不含 CSS 与依赖图，模板串路径不解析 ⇒ 都是**下界**。

| 口径 | 工作台入口 `src/App.tsx` | 装载器 `src/plugin-host-main.tsx` | 装载器**独有**（差集） |
|---|---|---|---|
| 只算静态 `import` | 81 文件 / 15,144 行 | 73 文件 / 11,990 行 | **26 文件 / 4,400 行** |
| 静态 + 动态 | 469 文件 / 87,818 行 | 366 文件 / 65,753 行 | **8 文件 / 2,305 行** |

8 份独有文件逐行：`plugin-host-main.tsx` 643、`plugins/pluginRegistry.ts` 518、
`plugins/pluginManifestInstall.ts` 414、`components/niko-table/hooks/use-generated-options.ts` 316、
`niko-table/lib/format.ts` 182、`components/theme-provider.tsx` 101、`plugins/frontendApi.ts` 66、
`niko-table/lib/filter-rows.ts` 65。

**决定性的那条：`ModuleRenderer.tsx`（312 行）与 `hostApi.ts`（422 行）不在这个差集里。**
它们本来就在工作台闭包内 ⇒ R10 搬工作台时顺路就搬进来了，选 (a) **不额外要一套渲染器**。
差集里那三份 `plugins/*`（518 + 414 + 66 = 998 行）是他的**插件管理器**，在 DSH 里由
bundle/profile 那套取代（ADR-0002），**不该搬**；`theme-provider.tsx` 与 `niko-table` 那 563 行属 R10
的 UI 体量，也不是 (a) 的增量。
⇒ (a) 的净新增 ≈ **装载器外壳那一份文档**（643 行里还要减去 manifest/install/lifecycle/preview 各支），
不是几千行的第二套系统。

## 决定（推荐，不是既成）

**(a) 把边界只放在 DSH ↔ Xaihi 那一层**：DSH 的 slot 里放**一个** `<iframe>` 指向我们自己的
`/xaihi/workbench.html`（形状照他的 `plugin-host.html`：URL 参数决定装载什么、`type` 拼错就拒、
默认只给 `contract`、把 granted / refused / pin 覆盖率打印在页面上），
**Xaihi 这一份文档里 React 19 只有一份**，工作台 L1、L2 原子层与每节点的 remote 全在这一份文档内部，
节点 remote 仍按 ADR-0008 走 MF2 `shared`。跨 realm 只有最外面那一刀，节点之间不再有第二刀。

他那份装载器的 URL 形状逐字为
`/plugin-host.html?plugin=<id>&entry=<mf-manifest 或 remoteEntry.js>&type=module|var[&capabilities=…][&requiredApi=^1.0][&pin=<url>|<sri>][&origin=…]`。

对照另外两条：

- **(b) DOM 级桥**：外壳（宿主 18）只渲染 `<div>`，remote 导出 `mount(el, props)/unmount(el)` 命令式接口，
  整包 19 自成一图。它的对应物是他合同里的 `contained` 档，但 `contained` 原义只是 CSS containment，
  **不含"另一份 React"**，所以 (b) 是"借他的名字改他的语义"——比 (a) 更糟。
- **(c) 全仓退回 React 18**：V1 之外还要把 19 的写法降级；与"按 19 写的"直接冲突，排除。


## 后果

1. **ADR-0001 第 5 条要改写**：原条文是"React 由宿主模块表提供，远端 `shared.react.import:false`，
   拿不到就硬失败"——那是为"防双 React"写的；在新形态下**双 React 是设计**（DSH 外壳 18 一份、
   Xaihi 文档 19 一份），要求变成"**每一份文档内部只有一份**"。observatory 的断言随之反转：
   对 Xaihi 侧要断 `sameReactAsHost === false` 且 `xaihiReactVersion` 是 19.x，
   阳性对照是"把 Xaihi 的 remote 塞回 DSH 的树里渲染"必须报 `#31`（V1 已经实测过这条，它就是正控）。
2. **DSH 外壳与 Xaihi 文档之间是消息桥，不是 props**：locale / 主题变量 / 宿主调用（工具、命令、审批）
   都要过 envelope。要一并量的事：消息大小与频率上限、焦点与滚动（跨文档）、CSS 隔离
   （主题变量得**两边都写**：外壳 DOM 上一份、Xaihi 文档里一份）。
   **桥要搬的形状他给过**：`NodeHostCapabilities` 就是 9 个能力组
   （`contract` / `state` / `workspace` / `runner` / `clipboard` / `downloads` / `localFiles` /
   `config` / `env`，`packages/contract/src/index.ts:431-444`，其中 6 组可选），
   另有 11 条 `@deprecated` 的平铺方法（`:516-539`，`getData`/`patchData`/`listComponents`/
   `updateComponent`/`actions`/`downloadText`/`getNodeConfig`/`saveNodeConfig`/`getNodeUiConfig`/
   `saveNodeUiConfig`/`openConfigFile`）。⇒ **消息桥的动词表 = 他这 9 组**，不另立第二套；
   `hostApi.ts`（422 行）里那 9 组的**实现**要拆成"文档内直接实现"与"过桥问宿主"两半，
   拆到哪一格要逐组量，不能一次拍完。
3. **"DSH 能不能装独立文档"这条已经量掉了（22:2x，隔离宿主 pid 15264，
   `--profile xaihi --no-open --port 3199`）**，答案是**能，而且不是 DSH 的缺口，不用提 proposal**：

   | 证据 | 读数 |
   |---|---|
   | 实时表头 `GET /` | 只有 `cache-control: no-store` + `content-type` + node 默认，**没有** `content-security-policy` / `x-frame-options` / `permissions-policy`（带错 token 也一样，401 那趟就是同一套头） |
   | 实时表头 `GET /xaihi/debug.json`、`/xaihi/manifest.json` | 200，头同上（manifest 多一条 `x-content-type-options: nosniff`）⇒ 我们自己的具名路由也不带 CSP |
   | 构建好的客户端文档 `@deepseek-ai/dsh-web-frontend/dist/index.html`（825 B） | `<meta>` 只有 `charset` 与 `viewport`，**没有 `http-equiv` 的 CSP** |
   | `@deepseek-ai/dsh-host-frontend-static/lib/index.js:73` | 索引响应只写 `res.writeHead(200, { "content-type": type })`；`renderIndex` 只做 `<head>` 注入与加 `<base href="./">` |
   | 全量安装目录搜 `Content-Security-Policy\|frame-ancestors\|X-Frame-Options` | 只有两处命中，且都与我们无关：`dsh-api-session-controller/lib/index.js:2342` 给**不可信媒体预览**发 `sandbox; default-src 'none'`；`dsh-client-ui-sidebar-documentpreview/lib/client.js:3845` 是它**自己那份预览文档**里设的 meta |
   | `dsh-client-ui-sidebar-browser/README.md:107` | DSH 自己的侧栏就在框**外部站点**，并讨论对方 `X-Frame-Options`/CSP 会静默失败 ⇒ 客户端文档本身没被沙箱化 |

   ⇒ 剩下的不是"DSH 让不让"，而是下面两条**我们自己的代价**，必须写进契约：

   3a. **`/xaihi/*` 具名路由不经 `authorizeIndex`**：`dsh-client-connection/lib/index.js:388` 只在
       `pathname === "/"` 且查询里恰好 1 个 launch token 时才放行索引。所以 plugin-host 文档与它的
       JS **本机任何进程都能取到**——文档里不许有密钥，`capabilities` / `requiredApi` / `pin`
       只表达"允许装载什么"，任何有副作用的调用都要回到宿主侧再鉴权。
   3b. **同 origin 的 iframe 会带着操作者的会话 Cookie**：会话是 `dsh-auth-<sha256(authority)>`，
       属性为 `Path=/; HttpOnly; SameSite=Strict`（`index.js:297`），Strict 只挡跨站、**不挡同源嵌套**；
       `authorizeIndex` 认这个 Cookie（`:380-381` 原话"a valid cookie lets [it] through"）。
       ⇒ framed 文档里发出的请求会被当成**操作者发言**。DSH 的 `webServer.host` 只有
       `127.0.0.1` / `0.0.0.0` 两种值，给不出第二个 origin，所以只能立规矩：
       **插件文档内不许直接打 DSH 的 API**，一切宿主调用走 `postMessage` 由外壳那半边发起
       （外壳才是 launch token / Cookie 的正当持有者）。这条正好和后果 2 的"消息桥不是 props"是同一条。

4. 本 ADR 只是**记账 + 建议**：V1/V2 的两次失败已经把"看起来能省事的两种做法"排掉了，
   但落哪一条要使用者点头，因为 (a) 会改掉插件 UI 契约（连带 `xaihi.manifest/1` 的
   `panels[].remote/export` 字段形状），而那正是刚判定"以 `AppNodeEntry` / 他的契约为准"的东西。
5. **与 ADR-0008 的关系：边界只放在最外面那一刀之后，那份 ADR 基本不用改。**
   ADR-0008 决定 3 让 L2 走 MF2 `shared`、决定 2 让 L4 每节点各自成 remote —— 在 (a) 的形态下，
   L1 / L2 / L4 **全在同一份 Xaihi 文档里**，`shared` 照常生效，节点之间**没有第二道 realm 边界**。
   要改的只有两条措辞：
   - `probe.ts` 那条 `sameUiAsHost` 的**主语**：判据是"和**这份文档**的 React/L2 一致"，
     不是"和 DSH 宿主一致"（和 DSH 必然不一致，且那正是设计意图）。
   - 决定 5 第一条"主题变量只能由宿主出一次"里的"宿主"要分成两个角色：
     **DSH 外壳**出一次给外壳自己的 DOM，**Xaihi 文档**再出一份到文档的 `:root`
     （两边都写，见后果 2）。变量名与算色逻辑仍然只有一份实现。
   ⇒ 结论：(a) 与 ADR-0008 **可以共存**，我先前写的"正面冲突、L2 只能每文档一份"是按
   "每个节点一个文档"算的，那个形状更贵也更散，已经换成"整个 Xaihi 一份文档"。
   真冲突的只剩一处：**ADR-0001 第 5 条的 React 单例硬断言**（后果 1），那条必须改写而不是并存。
