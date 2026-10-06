# ADR-0009 插件 UI 的 React 归属：自带 19 只在"独立 realm"下成立

状态：**接受**（2026-10-06，使用者原话："整个xaihi一个窗口 节点它本身支持独立打开窗口"。
选项 (a)「整个 Xaihi 用一份自己的文档、边界只放在 DSH↔Xaihi 那一刀」成立，落点与原生多窗见
ADR-0011 决定 3；两条**不成立**的路线已经被实测否掉，那部分不再回头）
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


## 落地进度（2026-10-06 23:35，按此方案执行之后）

| 面 | 落点 | 状态 |
|---|---|---|
| 文档的装载位置 | `packages/core` 新前缀路由 `/xaihi/ui/<rev>/index.html`，配置项 `core.uiBundleDir` | 已落 + 已测（core 60 passed；三条守卫各做过减法跑测） |
| 文档缺失时的可见失败 | 清单 `ui` 面（`documentUrl` / `rev` / `problems`）；产物没配 ⇒ 路由 **503 点名配置项**，不是 404 也不是空白面板 | 已落 + 已测 |
| 节点各自成窗 | 同一份文档 + `?node=<清单 id>`（形状闸 `[a-z0-9][a-z0-9_-]{0,63}`，不合法 400 且**不回显**收到的值） | 已落 + 已测（ADR-0011 决定 3） |
| 桥的契约 | `packages/node-sdk/src/host-bridge.ts`：`xaihi.bridge/1`、九组与 41 条方法名逐字搬上游、版本不匹配整桥拒绝、256KB / 30s 上界 | 已落 + 已测（node-sdk 50 passed） |
| 谁能兑现哪条动词 | `SHELL_SERVED_METHODS` + `providerOf` 那张表；DSH 的 settings 面实测只有五个动词 ⇒ 18 条 `config.*` 里 **13 条今天没人能提供** | 已落 + 钉成测试（关守卫即红）；缺的那批走提案 **P7** |
| 两半桥 | `bridge-shell.ts`（在 DSH realm 那一侧）与 `bridge-document.ts`（文档那一侧），加 13 条两半互发的往返测 | 已落 + 已测（36 passed） |
| 节点 UI 一行不改的关键 | `document-host.ts`：给得出上游那九组形状的 `host`；`state`/`workspace`/`downloads`/`localFiles.getUrl` 留在文档本地不过桥 | 已落 + 已测（12 passed） |
| 文档的构建目标 | `packages/ui-host/rspack.document.mjs`（第三份产物 `dist-ui/main.js` + `main.css`，`react` **别名到本包的 `react-19`**，无 MF、无共享表）+ 入口 `src/document/main.tsx` + `build:document` 脚本 | 入口这一侧**已经干净**（`main.tsx` 零错）；整包 `rspack build` rc=1、**34 条错**（从 110 降下来，全部分类在下表，剩下的都在搬运树里，不在这份配置里） |
| 装配那一刀（slot 里放什么） | `src/client/surface.tsx` 的 `MainSurface` 接管 `main` 槽：按清单事实选文档面或退化面；`index.ts` 那侧换成 `createElement(MainSurface, { …, caps })`，**不再把 `WorkspaceRoot` 交给壳**，产物缺席时显示同文件里的 `NoDocumentFace`（纯 DOM、不 import 移植树） | **已落 + 已测**（6 条组件测）。这一刀的由来见下面两行：壳那一格改成"只显示原因"之后，移植树在壳里的渲染路径整条消失 |
| 壳那一格不许渲染移植树（2026-10-06 真宿主实测） | 症状：DSH 客户端控制台 `slot entry crashed in 'main': Minified React error #300`，#300 原文 = "Rendered fewer hooks than expected"（取自 React 官方 `scripts/error-codes/codes.json`） | **成因不是 React 版本**：`MainSurface` 当时用 `{inRealm(root)}` **当函数调** `WorkspaceRoot`，于是被调组件的 3 个 hooks 记在调用方身上；清单从 pending 变 document 的那次重渲染不再调它 ⇒ 父组件少一整层 hook ⇒ 槽入口崩 ⇒ **整格连同那座桥一起消失**。回归测试 `tests/surface.spec.tsx`「外壳那一面自己带 hooks 时…」在改法之前实测红（vitest 里读到的就是那句 "Rendered fewer hooks than expected"，栈顶 `updateFunctionComponent` 落在 `MainSurface`），改法（`const InRealm = inRealm` + `<InRealm … />`）之后绿。旧测没抓到的原因写进了那条测的注释：假件 `fallback` 不带 hooks，只有真组件上屏才暴露 |
| **③ 在真 DSH 父页里跑同一条跨文档往返** | 独立隔离宿主：`DSH_HOME=../.scratch/dsh-xaihi-realm-home` + 独立端口 **3399**（不与日常开发宿主 3199 共用 home ⇒ 不共享 credentials/sessions/storages），profile `xaihi-realm` 只装 base/web-app/xaihi-core/xaihi-ui 四行，`core.uiBundleDir` 指向 `dist-realm`；起法 `dsh --profile xaihi-realm --no-open`，stdout 那行 `dsh web: …?token=…` 就是带令牌的入口（`dsh-web-app/lib/index.js:194-206`，`printUrl` 默认 true） | **已实机读回**（真 Chrome、真 DSH 客户端当父页）：父页 `main` 槽里出现 `<iframe class="xaihi-document-frame" data-xaihi-surface="document" src="/xaihi/ui/7eeeee48075c/index.html">`；同源子文档可读，页面上三行因果依次是「等宿主握手」→`React=19.2.4 granted=[contract, config, env] refused=[state, workspace, runner, clipboard, downloads, localFiles]`→**`config.get` 往返成功 21ms**，回来的值是 DSH 真设置文档的描述子（`writable/hasDocument/namespaces[session-log-deepseek]` 带 schemastery schema）。父侧那份 bundle 的 React 版本按产物读数：`assets/index-5SrrfWpU.js`（633,245 B）里 `version="18.3.1"` ⇒ 壳 18.3.1 / 文档 19.2.4，穿桥的只有 DOM 与消息。控制台残留一条：`main.css` 以 404/`text/plain` 被拒（探针不产 CSS，路由按"目录里没有就 404"如实回答） |
| 跨文档那条桥的真往返 | `scripts/bridge-live.mjs`：起一个 http 服务，外壳页与 iframe 里的文档页各装载一份 `@hibernalglow/xaihi-sdk` 的**产物 ESM**（不是源码），跑握手 + 四类调用，判据由页面自己算成 `RESULT: PASS/FAIL` | **已在真浏览器跑通**（happy-dom 的 postMessage 不算跨文档语义）：正常模式 10 条判据全 ok；`--sabotage` 把设置面摘掉后转 `RESULT: FAIL`，5 条点名红、红处读回的是 `"refused"` 而不是空白；页面里另有一条故意做错的自证判据，用来证明这把尺看得见违规 |
| 文档 realm 本身（真浏览器、真路由） | `src/document/realm.ts`（管道）+ `realm-entry.tsx`（探针）+ `rspack.realm.mjs` → `dist-realm/`；`scripts/ui-realm-live.mjs` 用**构建产物里的真路由**（`packages/core/lib/routes.js` 的 `uiBundleHandler` + `computeRev`）把这份文档端起来 | **已实机读回**：文档在 `http://127.0.0.1:<port>/xaihi/ui/f58846442be8/index.html` 打开，页面上写 `React=19.2.4` 且探针块是 `createRoot` 挂上去的（第一版用 appendChild，把要证的事绕过去了，产物里没有 react-dom —— 改成真挂载后 8.7 KB → 196 KB 且含 `createRoot`）。同一次核对里：正常文档 200 + boot 对象带 rev、陈旧 rev 404、目录里没有的 main.css 404、`../../../../etc/passwd` 404。没有父级时那行写的是「等宿主握手（没应答=这条桥还没人接）」，是可见退化不是空白 |
| **还没做** | ① 把 `dist-ui/main.js`（真工作台那份）建出来：44 条错，全在搬运树 | ①属搬运批（`docs/port/debt-2026-10-06.txt` 同源：16 条未声明依赖/缺文件、12 条 `@xiranite/*` 缺符号、3 条浏览器 realm 里 import `node:*`）。②（桥与外壳）与 ③（真 DSH 父页）都已经实机读回；①完成之后同一台隔离宿主（3399）就是它的验收台：把 `core.uiBundleDir` 从 `dist-realm` 换成 `dist-ui`、`?node=` 那条寻址与九组能力面的表都不用再动 |


### 文档构建的账（23:42 首测 106 条 → 23:48 复测 **34 条**，`rspack build -c rspack.document.mjs`）

| 成因 | 条数 | 归谁 |
|---|---|---|
| `Can't resolve` / `Module not found` | 63 | 其中 **52 条来自同一个文件** `src/components/modules/packageModules.generated.ts`：那份注册表是从上游**整份拷来**的 56 个懒装载项，而本地 `src/nodes/` 只有 9 个目录（含 `shared`），**40 个节点界面还没搬**。剩下的散在 `LaneView`(6)、`FlowCanvasView`(2)、`xiraniteApiClient`(2)、`RuleTreeEditor`(2)、`sleept/Component`(2) 等，与 `docs/port/debt-2026-10-06.txt` 那份台账同源 |
| `export ... was not found` | 10 | 搬运批（`@xiranite/contract` 里缺 `checkContractVersion` 那一类） |
| `Reading from "node:fs" / "node:module" / "node:os" is not handled` | 3(+3 Unhandled scheme) | 浏览器 realm 里的 Node 依赖，属端口设计题（要走桥还是走我们已有的 SSE），不是配置开关能糊的 |



读数变化全部有出处：首测 106 → 批次 E 落下四个节点界面后 110（注册表那条从 52 降到 48，但新文件带进 9 条新的）
→ 修掉我自己配置里的三条 bug 后 56 → 再修两条后 **34**，且入口 `src/document/main.tsx` 现在**零错**。

我自己那五条 bug 逐条记着（都是「配置看着对、跑起来不对」那一类，不记就会再撞）：
① 块注释里写路径 glob `plugins/<星号>/…` 那个 `*/` 把注释提前关掉，rspack 报 `ParseError: Missing semicolon`；
② 别名 `react-dom` 指到包根目录后，`react-dom/client` 被**前缀规则吃掉**，报
   `Cannot find module 'react-dom/client' for matched aliased key 'react-dom'` ⇒ 整名匹配要写 `react-dom$`；
③ 用脚本生成配置时 `test: /\\.m?js$/` 那层转义写错，规则实际没生效（`fullySpecified` 那 10 条一次没动）；
④ `type: 'css/mini-extract'` 这台 rspack 直答 `No parser registered for 'css/mini-extract'` ⇒ 换 `css/auto` + `experiments.css`；
⑤ 别名表**从 `tsconfig.ported.json` 的 paths 现读**，不在配置里再抄一份——抄一份就会漂成「类型检查绿、构建红」。

另有一条装机事实要盯着：`react-dom-19` 被 pnpm 解析成 `react-dom@19.2.4_react@18.3.1`（peer 记的是 18）。
产物里 `react$` 别名指向真的 19，所以那张图仍应是一整张 19——但**这条只有真产出才证得了**，
而它现在还没产出（下面剩下的 34 条），所以本节把它写成待证而不是写成已证。

**剩下 34 条的归属（23:48 实测分类，全都不在这份配置里）**：
- 14 条 `Can't resolve`：未声明的 npm 依赖 `zod`(2)、`@radix-ui/react-tabs`(1)、`tldraw`(1) + `tldraw/tldraw.css`(1)；
  以及搬运树里缺的本地文件 `source-thumbnail-client.js` / `schema.js` / `jsonl.js` / `query.js` / `http-url.js` /
  `NodeMemoryProtectionSettings`（各 1）。
- 12 条 `export ... was not found`：`@xiranite/shared` 缺 `appendUrlPath`(3)、`@xiranite/logging` 缺
  `createLogEnvelope`(2) 与 `createLogSession`(1)、`@xiranite/contract` 缺 `isResourceOriginAllowed`(2)、
  `checkContractVersion`(1)、`classifyPluginArtifacts`(1)、`enumeratePluginArtifacts`(1)、
  `@xiranite/api/client` 缺 `createSourceThumbnailClient`(1)。
- 3 条 `Reading from "node:fs" / "node:os" / "node:module"`：浏览器 realm 里的 Node 依赖，属设计题（走桥还是走我们已有的 SSE）。

### 一条已经能证的"必炸"，不用等实机（23:43）

`packages/ui-host/lib/client.js`（跑在 **DSH realm** 里、那份 bundle 的 `react` 是 **external**，
实测产物里只有 `require("react")` 与 `require("react/jsx-runtime")` 两条外部化说明符，
1.28 MB）**已经把 `WorkspaceLayout` 与 `pie-menu` 打进去了**，而 `pie-menu/primitive.tsx:16` 用的是
React 19 才有的 `use()`。⇒ 这条路径一旦被渲染就是本 ADR 背景里那两个症状之一，
不需要等真界面点出来才发现。文档那一侧（`dist-ui/main.js`）之所以要别名 `react → react-19`，
正是为了让这张图闭合；两 realm 共用一个 `react` 说明符就是事故现场。

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
