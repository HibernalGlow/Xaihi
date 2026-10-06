# ADR-0009 插件 UI 的 React 归属：自带 19 只在"独立 realm"下成立

状态：待接受（等使用者对"用他自己那套 plugin-host"点头；两条**不成立**的路线已经被实测否掉，那部分不再回头）
日期：2026-10-06
决策人：HibernalGlow
相关：ADR-0001（UI 传输，本文件改写它的第 5 条）、`docs/adr/0006-ui-source-is-xiranite.md`、
`docs/adr/0007-component-placement.md`（组件放置四层）与 `docs/adr/0008-shared-ui-package-and-l4-boundary.md`
（L2 走 MF2 `shared`、L4 每节点独立成 remote）——它们定"哪一层放什么、怎么共享"，本文件定
"**哪一份 React 渲染**"。两条在 L4 上正面相遇，见「后果」第 5 条。
`<Xiranite>/src/entrypoints/plugin-host.html`、`<Xiranite>/src/plugin-host-main.tsx`

## 背景

使用者的节点 UI 与工作台都是按 **React 19** 写的（`@opentui/react@0.4.5` + `react@19.2.4`，
上游依赖的 peer 也普遍收 19），而 DSH 宿主的模块表给的是 **React 18.3.1**（实机读到
`React.version` 18.3.1）。使用者的判断是"允许插件自带 React 不就完了"。

方向没错，但**"自带 React"只是必要条件**。决定成败的不是组件 `import` 到哪个 React，
而是**谁来渲染**：元素对象与 hook 都绑定在具体那一份 React 上。

## 实测（一次隔离宿主上的探针，两条都失败，且失败点不同）

探针包 `plugins/r19spike`（一次性，已删；未进主线，profile 已卸载）。

| 试法 | 结果 | 读数 |
|---|---|---|
| **V1**：不共享 react，把 React 19 整体打进 remote，面板直接返回 19 创建的元素 | **崩** | 宿主 React 18 报 `Minified React error #31`（`objects with keys {$$typeof, type, key, ref, props}` 不是合法子节点）——19 的元素 `$$typeof` 与 18 不同，**宿主根本不认**；同时 observatory 记到 `reactVersion: "19.2.4"`、`sameReactAsHost: false` |
| **V2**：桥那一层仍用共享的宿主 react（18）创建元素，React 19 走 `resolve.alias` 的另一个说明符 `react19`，`react-dom/client` 也指到 19 | **仍然崩** | `Cannot read properties of undefined (reading 'S')`——`react-dom@19` 内部 `require('react')` 被 MF 共享解析成**宿主的 18**，于是 19 的 renderer 拿着 18 的 internals |

**结论（实测得出，不是推理）**：同一次编译里做不到"外面是宿主 18、里面是自带 19"。
19 的 `react` + `react-dom` 必须是**一整张闭合的图**；而那张图**不能把元素交回宿主渲染**。
=> 桥只能是 **DOM 级**（宿主 18 只负责放一个容器元素）或 **跨文档**（独立 realm）。

DSH 的插槽每条目都有独立错误边界，所以两次崩溃都只吃掉那个面板，外壳与其余面板无恙
（读到 `slot entry crashed in 'main'` 后工作台继续可用）——这条边界是这次能连续试错的前提。

## 决定（推荐，不是既成）

**用使用者自己已经写好的那条**：`<Xiranite>/src/entrypoints/plugin-host.html` +
`src/plugin-host-main.tsx` —— 按
`/plugin-host.html?plugin=<id>&entry=<mf-manifest 或 remoteEntry.js>&type=module|var[&capabilities=…][&requiredApi=^1.0][&pin=<url>|<sri>][&origin=…]`
装载插件。它天然满足"插件自带 React 19"，因为整个插件运行在**另一个文档**里，不存在跨渲染器；
而且它已经带了能力清单（`capabilities`）、API 版本闸（`requiredApi`）与来源/完整性钉（`pin` = URL 或 SRI）。

对照另外两条：

- **(b) DOM 级桥**：外壳（宿主 18）只渲染 `<div>`，remote 导出 `mount(el, props)/unmount(el)` 命令式接口，
  整包 19 自成一图。可行，但**要新造契约**——而他那份 plugin-host 里已经有 envelope 了，没必要再造第二个。
- **(c) 全仓退回 React 18**：V1 之外还要把 19 的写法降级；与"按 19 写的"直接冲突，排除。

> 一条待查的旁证：`<Xiranite>/src/plugins/frontendRuntime.ts:106` 写的是"在宿主 realm 里跑插件，
> 而不是 iframe"——即他默认形态是 host realm（那时全站只有一份 React 19），
> `plugin-host.html` 是给**外部插件**用的隔离装载器。移植到 DSH 之后"全站一份 React"这个前提
> 被宿主拿走了（DSH 给 18），所以才必须走独立 realm。这一条要向他确认，别由我替他解释自己的设计。

## 后果

1. **ADR-0001 第 5 条要改写**：原条文是"React 由宿主模块表提供，远端 `shared.react.import:false`，
   拿不到就硬失败"——那是为"防双 React"写的；在新形态下**双 React 是设计**（宿主 18 一份、
   插件文档里 19 一份），要求变成"每个 realm 内部只有一份"。observatory 的断言随之反转：
   对插件侧要断 `sameReactAsHost === false` 且 `pluginsReactVersion === 19.x`，
   阳性对照是"把它塞回宿主树渲染"必须报 `#31`。
2. **外壳与面板之间是消息桥，不是 props**：locale / 主题变量 / 宿主调用（工具、命令、审批）
   都要过 envelope。要一并量的事：消息大小与频率上限、焦点与滚动（跨文档）、CSS 隔离
   （主题变量得**两边都写**：外壳 DOM 上一份、iframe 文档里一份）。
3. **未证的一条，下一步先量**：DSH 的 web 宿主能不能把这种独立文档装进来——它的浏览器信任栅栏
   （`--trusted-host`）与 `/plugins` 前缀独占都还没对 iframe/srcdoc 这条路过一遍；
   判据挂在 `docs/roadmap.md` 的 R12，量不出来就先提 proposal，不许绕。
4. 本 ADR 只是**记账 + 建议**：V1/V2 的两次失败已经把"看起来能省事的两种做法"排掉了，
   但落哪一条要使用者点头，因为 (a) 会改掉插件 UI 契约（连带 `xaihi.manifest/1` 的
   `panels[].remote/export` 字段形状），而那正是刚判定"以 `AppNodeEntry` / 他的契约为准"的东西。
5. **与 ADR-0008 决定 3 正面冲突，冲突点要说清**：那份 ADR 让 L2（原子组件层）走 **MF2 `shared`**，
   并要求所有 remote 共享同一份 L2（`probe.ts` 加 `sameUiAsHost`）。`shared` 只在**同一个 realm 的
   MF 容器**内生效——独立文档拿不到宿主的那一份，于是 (a) 之下 L2 只有两种落法：
   - **每个插件文档各带一份 L2**：`sameUiAsHost` 这条断言在那里恒为 `false`，要换成
     "同一文档内只有一份 L2"；重复的是字节，不是 hooks 状态（跨文档没有共享 hook 实例，
     所以 ADR-0008 担心的"双 L2 随机崩"在 (a) 下不成立——它成立的前提是同一 realm）。
   - **主题与样式仍由宿主出一次**（ADR-0008 决定 5 的第一条不变），靠后果 2 的"两边都写"落地。
   这条要么由使用者裁定后写回 ADR-0008，要么在 (a) 被否时随本 ADR 一起作废；
   **不许两份 ADR 各自默认自己对**。
