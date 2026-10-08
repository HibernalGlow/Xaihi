# ADR-0007 组件放置：四层落点，共享原子层只有一个出口

状态：接受（2026-10-06）。**决定 1–5 有效**（四层落点、L2 唯一出口、CSS 归宿主、`entry` 不带 core、
门禁跟着搬）。**决定 6（方案甲）已被 ADR-0008 取代** —— 用户 2026-10-06 提出 MF2 质疑后复核，甲的
必要性不成立，且会作废已落地的 loader / probe / 测试。本文件事实 2 另有一处定性更正（见该节末），
§决定 6 整节保留作留痕。
决策人：HibernalGlow
相关：ADR-0001（UI 传输）、ADR-0002（自包含与自带 patch）、ADR-0006（UI 真源是 Xiranite）、
`docs/roadmap.md` R10 / R11、`docs/service-mapping.md`

## 背景

用户问的是一个具体问题：**"前端的 web 界面，因为是 SHADCN 这种组件化的，它该怎么放置组件呢？"**

这不是"选个目录"，因为 shadcn 的组件不是包、DSH 对"组件放哪"有明文规定，而上游自己已经把
边界写成了两个门禁脚本。三条事实决定了答案，逐条给证据。

### 事实 1：shadcn 不是依赖，是源码 + 三个锚点；别名耦合 2219 条

`<Xiranite>/components.json` 逐字：

```json
{ "style": "new-york", "rsc": false, "tsx": true,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral",
                "cssVariables": true, "prefix": "" },
  "iconLibrary": "radix",
  "aliases": { "components": "@/components", "utils": "@/lib/utils",
               "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" } }
```

- `"config": ""` + 仓内**没有** `tailwind.config.*`（实测 `ls tailwind.config.*` 无匹配）⇒ Tailwind **v4
  CSS-first**：主题不是一个 JS 文件，是 `src/index.css`（**1603 行**）里的 CSS 变量 + `src/styles/`
  （`tailwind.css` / `design` / `themes`）。
- 组件本身在 `src/components/ui/`：**104** 个 `.tsx`（含 6 个测试文件）。
- 每个原语的类名拼接都走 `@/lib/utils` 的 `cn()`（`clsx` + `tailwind-merge`，`src/lib/utils.ts` 20 行）。
- 别名不是相对路径：`@/` 在 **482 个文件 / 2219 条 import 语句**里出现，去重后 **264 个指称面**
  （实测 `grep -rhoE 'from "@/[^"]+"' src/`）。

⇒ **"把原语拆成包分发"这条在保真判据下不成立**：改别名 = 改 2219 条 import；而且拆出去之后
Tailwind v4 的类名生成还要跨包扫源文件（`@source`），CSS 变量与 `cn()` 也得跟着走。

### 事实 2：DSH 对"共享组件放哪"有明文规定，而且只给一个出口

`@deepseek-ai/dsh-client-ui-primitives`（0.2.0-rc.2，本机 node_modules 里可读）的 component catalog
前置说明逐字：

> Check this table before writing a control in a feature package. **A plugin cannot import another
> plugin's component, so this package is the only place a control can be shared**: reuse what fits,
> and lift a deliberate visual difference into a prop rather than starting a second copy.

> Writing your own component in your own package is fine when the need is genuinely specific. What is
> not fine is copying a control that already exists here — and **once a second package needs the same
> control, it belongs in this package**.

它自己是什么形状（`package.json` 实测）：`files: ["lib/index.js", "lib/**/*.css", "lib/types/**/*.d.ts"]`
——**没有 `client.js`，没有 `dsh.client` 声明**。README 自述：

> This package is a **Web-shell build input**. Its static ESM retains third-party imports and styles
> for Vite; independent consumers supply its development dependencies.

> The components import **no Cordis runtime**; callers supply localized labels, and theme-facing colors
> use `--dsw-*` design tokens.

另一侧，`@deepseek-ai/dsh-client-modules` 的 README 说清了机制有哪几条路：

> The shell seeds a frozen module table (`PLATFORM_MODULES`: React, Cordis, and static UI libraries);
> every dynamic bundle resolves its externals against exactly that baseline. `dsh.client.external` adds
> only exact non-baseline requests, each answered by **the dynamic package row it names** or an **exact
> static-table key**. […] Composition rejects malformed requests, missing suppliers, self-requests, and
> synchronous request cycles.

⇒ 机制上跨包共享有两条路（静态表键 / 点名某个动态包 row）。

> **更正（2026-10-06，ADR-0008）**：本 ADR 初稿在这里**只看到"静态表键"一条路**，并据此推断
> `ui-primitives` 是"被 shell 构建吞掉的包、插件拿不到它的运行时实例"。**该推断错误**：同一个包
> **既**是 shell 的构建输入，**也**是运行时的**平台单例** —— `<deepseek-harness>/packages/client/web/src/seed.ts`
> 的冻结模块表里共 **9** 个键，`@deepseek-ai/dsh-client-ui-primitives` 是其中之一（与 `ui-slots`、
> `ui-dockkit`、`store`、`cordis`、react 全家并列）。**插件拿得到同一个实例。**
> 两条路都成立，Xaihi 走"点名动态包 row"或 MF2 `shared`。详见 **ADR-0008**。

### 事实 3：上游自己已经把边界写成了两个门禁

`<Xiranite>/scripts/audit-node-ui-independence.ts` 的开头逐字：

> The GUI stays one product — every node's Web UI is a view inside Xiranite's single Tauri shell — so the
> rule is not "ship 43 apps", it is that a node's UI must stay **extractable**: no Xiranite-only state,
> no global config, no nexus, no main-app routing, and backend access only through the transport seam.

```ts
export const COUPLING_PREFIXES = ["@/store", "@/features", "@/nexus", "@/services", "@/App",
                                  "@/router", "@/hooks/useWorkspace", "@/lib/workspace"]
export const SEAM_PREFIXES = ["@/backend"]
```

- coupling 是**棘轮**（超过已提交基线为红）；seam（`@/backend`）是**任何数量即红**。
- `src/nodes/shared` 是**豁免边**，原文："the exempt edge because it is the seam every node is told to use"。
- 第二个门禁 `audit-node-gui-flavor.ts` 走**import 闭包**，报三类：`missing entry`（有 UI 目录没
  `entry.ts`，无基线豁免）、`shell coupling / seam`、**`sibling leak`**（闭包碰到别的节点目录）。

本次实测的引用面（`grep -rl 'from "@/<prefix>'`）：

| 前缀 | 全 `src/` 命中文件数 | 其中在 `src/nodes/` 下 |
|---|---|---|
| `@/components/ui` | **237** | **110** |
| `@/components/workspace` | 52 | **28** |
| `@/components/modules` | 22 | — |
| `@/components/views` | 4 | **0** |
| `@/components/data-table` / `niko-table` | 4 / 4 | — |
| `@/nodes/shared`（39 项 / 3892 行） | — | 豁免边 |
| `@/backend` | — | 1 |

**顺带查出一个真缺陷（不是猜的）**：`@/components/workspace` **不在** `COUPLING_PREFIXES` 里，却有
**28 个 `src/nodes/` 文件**在用它（例：`src/nodes/sleept/Component.tsx` 用
`@/components/workspace/FloatingWindowFrame`）。名单里有 `@/lib/workspace`，没有 `@/components/workspace`
——同一个概念只登记了一半入口。所以那道门禁对"用 shell 的组件"这一层**是瞎的**。它属于"漏登记"还是
"有意豁免"，上游没写理由；**移植时不能照抄这份名单，也不能把基线清零重算**（清零 = 让 28 条存量债凭空
消失，棘轮立刻失效）。

## 决定

1. **"该放哪"的判据是四层，不是目录口味。** 与上游门禁同形、与 DSH 的组件规则同构：

   | 层 | 内容 | 谁可以引用 | 对应 DSH 的什么 |
   |---|---|---|---|
   | **L1 外壳** | `components/{workspace,views,modules}`、工作台状态与路由（`@/store`、`@/router`、`@/App`、`@/services`、`@/nexus`） | 只有外壳自己 | shell |
   | **L2 共享原子** | `components/ui`（104 原语）、`lib/utils`(`cn`)、`lib/design-theme`（六套语言 + 7 个维度开关）、`components/{data-table,niko-table,context-menu,help}` | 外壳 + 任意节点 UI | `dsh-client-ui-primitives` 的位置 |
   | **L3 节点接缝** | `nodes/shared`（39 项 / 3892 行，含 `ExecuteButton`、`Local*Preview(Dialog)`、`NodeConfig*`、`NodeRunHistoryPopover`、`NodeRuntimeContext`、`api.ts`） | 任意节点 UI；**节点之间只许经过它** | 上游的 exempt edge |
   | **L4 节点自己的 UI** | `src/nodes/<id>/`：`Component.tsx` + `controls.tsx` / `constants.ts` / `types.ts` + `entry.ts` | 只有自己 | feature package |

2. **shadcn 原语落在 L2，整树搬、不改别名、不拆包。** 同一份 `components.json` 别名、同一份
   `@/lib/utils`、同一份 Tailwind v4 CSS 入口。理由见事实 1（2219 条）+ 事实 2（DSH 的"唯一出口"）。
   **L2 是全仓共享控件的唯一出口**：第二个包需要同一个控件时，控件上移到 L2，不是复制一份。

3. **CSS 与主题由宿主半边叠，不进远程模块。** 沿用 ADR-0006 已确认的
   `ctx.theme.overrideTokens(source, tokens)` 边界（主题进不了远程模块），以及 Xaihi 现有的
   `--xaihi-* → --dsw-*` 别名层（`packages/ui-host/src/client/styles.ts`）——别名落在 L2 与 DSH token
   之间，别直接写 `--dsw-*`。

4. **L4 的入口契约按 `AppNodeEntry`，且 `entry` 不带 core。** 上游 `src/nodes/sleept/entry.ts` 的
   注释把理由写死了：值导入节点包的 `core` 会把执行器连同动作词表拉进 GUI chunk（实测
   `dist/core.js` **11,776 字节**），而"面里能跑节点逻辑，就是协议之外的第二个执行宿主"；界面要跑动作
   只走 `/operations`（`host.actions?.run`）。
   **Xaihi 侧的对应判据**：节点 UI **不得 value-import 任何宿主侧包**，动作只经命令面 / `node.invoke`。
   这与 `packages/ui-host/src/client/index.ts` 现有的那条纪律同向（"本半边不 value-import 任何宿主侧包，
   harness 客户端包只以 `import type` 出现"）。

5. **两个上游门禁跟着搬，但名单要修。** 补 `@/components/{workspace,views,modules}` 进 coupling 名单
   （或明文写下为什么它们被豁免），并**保留上游的存量基线**（`@/components/workspace` 28、
   `@/store` 24，实测）。门禁的价值在棘轮，不在首次全绿。

6. **L1 + L2 + L4 在同一个客户端包里（方案甲）；节点宿主半边仍在各自 npm 包。**（2026-10-06 拍定，
   展开见 §决定 6。）UI 树与宿主树因此是**两棵树**，唯一连接点是宿主包的一个**纯数据叶子子路径**
   （定义），**不是**宿主运行时代码。

## 后果

- **正面**："这个新组件该放哪"变成可判定的一句话——*第二个包需要它 → 上移 L2*。移植是搬迁接线，
  不是设计。
- **代价**：
  - Tailwind v4 的 `@source` 必须扫到搬过来的整棵树（含 `src/nodes/**`），否则 L4 的类名根本不生成。
    这条要落成构建期断言，不能靠约定。
  - `@/` 必须是**同一份**解析（tsconfig `paths` + 构建 alias），不能让每个包各写一份 —— 漂移的症状是
    "某些文件解析不到"，离原因很远。
  - L2 一旦成为唯一出口，它就成了全仓最热的文件区；改动 L2 的原语要按"公共 API"对待。
- **没做**：本文只定"放哪一层"与"在几个包里"（决定 6）；"怎么进浏览器"仍归 ADR-0001。

## 决定 6（2026-10-06 22:03 拍定，同日被 ADR-0008 取代）：方案甲 —— L1+L2+L4 同包

> **本节已被 ADR-0008 取代，保留作留痕。** 用户当日随后提出 MF2 质疑，复核后确认：
> 跨包共享有现成手段（MF2 `shared` 已在 `remote-modules.ts` 里跑；DSH 的 `dsh.client.external`
> 是第二条），所以"L2 会在 N 份 bundle 里重复"这个前提不成立，**甲的必要性随之消失**；
> 而甲还会作废已落地并带测试的 loader / probe（ADR-0001 §2 的主实现）。
> **仍然有效的是本节下的两条实测**：(a) 上游是 **UI 双树**（`src/nodes/` 纯 UI、`packages/nodes/*/src/`
> 宿主，两侧只走纯数据叶子）；(b) 因此 UI 不得 value-import 宿主运行时代码 —— 这条被判为"甲的逻辑
> 后果"其实与甲无关，已由 ADR-0008 决定 4 继承。
> 新结论见 **ADR-0008 决定 1–2**：L1+L2 同包（已是 `@hibernalglow/xaihi-ui`），**L4 各自成包**。

用户拍了**甲**。落定之前先补一条当时没摆出来的证据，因为它把甲的落法从"可选"变成"照抄"。

### 甲不是发明：上游本来就是"UI 双树"

实测 `<Xiranite>`（本次）：

| 树 | 内容 | 证据 |
|---|---|---|
| `src/nodes/<id>/` | **纯 UI**：`Component.tsx` / `controls.tsx` / `constants.ts` / `types.ts` / `format.ts` / `entry.ts` / 测试 | 全 31 个目录里 `core.ts` **0** 个、`cli.ts` **0** 个、`Tui.tsx` **0** 个（`find` 实测） |
| `packages/nodes/<id>/src/` | **宿主侧**：`core.ts` / `cli.ts` / `Tui.tsx` / `interaction.ts` / `definition.ts` / `platform.ts` / `index.ts` | 30 个节点各一套 |

两侧的**唯一连接点**逐字（`src/nodes/sleept/entry.ts`）：

```ts
import type { AppNodeEntry } from "@xiranite/contract"
import { def } from "@xiranite/node-sleept/definition"   // ← 叶子子路径，不是裸包名
import { Component } from "./Component"
export default { def, Component } satisfies AppNodeEntry<Record<string, never>>
```

该文件的注释把"为什么是叶子子路径"写死了：包根 barrel 还 `export * from "./core.js"`，从裸包名取值会把
**`dist/core.js`（实测 11,776 字节）**那台执行器连同动作词表拉进 GUI chunk —— *"面里能跑节点逻辑，
就是协议之外的第二个执行宿主"*。

⇒ 上游的 UI 树**在 app 的 `src/` 里**、宿主在 `packages/` 里、值边只走"纯数据定义"。这正是甲的形状；
Xaihi 不需要发明，照抄这个拓扑即可。

### 甲的三条导出（都是"甲"的逻辑后果，不是新决定）

1. **UI 树与宿主树是两棵，不能合成一棵。** 工作台客户端包持有 UI 树（含 `src/nodes/<id>/`）；
   `plugins/<id>/` 只留宿主半边（core / gateway / tools / command / 声明）。UI 侧要取定义时，
   **只许从宿主包的纯数据叶子**取（Xaihi 的对应物就是 `package.json#xaihi` 那份 manifest ——
   已经是唯一真源），**不许 value-import 宿主运行时代码**（决定 4 的同一条纪律）。

2. **注册表是构建期生成的，不是运行时装出来的。** 上游 `src/components/modules/packageModules.generated.ts`
   把 31 条 `() => import("@/nodes/<id>/entry")` 全列成静态懒装载表；甲方案下这些 `import()` 被 tsdown
   拆成**同级 chunk**、由同一个 combo 服务（client-modules README：源 `import()` → `require.async("./client.<name>.js")`）。
   所以：
   - **好处**：不需要 `dsh.client.external`，也**不受**"一个插件不能 import 另一个插件的组件"约束 ——
     L2 与 L4 不是两个插件，它们在一个包里。
   - **代价（比"重打工作台包"更准的措辞）**：节点 UI 的**存在**由工作台的构建期扫描决定，不由运行时
     npm 安装决定。新加/删除一个节点的**界面**要重跑生成器 + 重建工作台；宿主半边的装卸不受影响。

3. **ADR-0001 收窄，不作废。** 它管的是"UI 怎么进浏览器"，机制照旧（`/xaihi/remotes/<slug>/<rev>/<file>`
   + 第 3 条的 DSH 原生 `dsh.client` 兜底 + 第 5 条的 React 单例硬断言全部保留）。变的只是**数量**：
   从"每插件一个 remote"变成**一个** remote（工作台）。它的标题前提"插件 UI 的传输"应读作
   "工作台 UI 的传输"，已在 ADR-0001 里加指针。

4. **ADR-0002 不受影响。** 它管的是"装进 profile 的宿主半边 bundle 形状"，节点宿主半边仍是一个包
   一行 patch。其后果里"节点装卸不影响工作台其余部分"对**宿主半边**仍然成立；UI 半边按第 2 条走。

### 被否的方案（留痕，理由不变）

- **乙（每节点一个客户端包，L2 各自内联）**：104 个原语在 N 份 bundle 里各一份，组件库与 CSS/token
  实例分裂；违反 L2 唯一出口。**否**。
- **丙（L4 不用 Xiranite 原语，改 `dsh-client-ui-primitives`）**：在 DSH 架构上最"正统"，但违反
  ADR-0006 的"保真不是好看"。**否**。

## 证据清单

| 事实 | 出处 |
|---|---|
| shadcn 配置与别名 | `<Xiranite>/components.json` |
| 104 个原语 / 无 `tailwind.config.*` / `index.css` 1603 行 | `<Xiranite>/src/components/ui/`、`src/index.css`、`src/styles/` |
| `cn()` = clsx + tailwind-merge | `<Xiranite>/src/lib/utils.ts` |
| 482 文件 / 2219 条 `@/` import / 264 指称面 | 本次 `grep -rhoE 'from "@/[^"]+"' src/` |
| 四层边界与棘轮名单 | `<Xiranite>/scripts/audit-node-ui-independence.ts`、`audit-node-gui-flavor.ts` |
| `@/components/workspace` 漏登记（28 个节点文件在用） | 本次 `grep -rl` 实测 |
| 节点入口 `{ def, Component }` 且不带 core（`dist/core.js` 11,776 B） | `<Xiranite>/src/nodes/sleept/entry.ts` 注释 + `wc -c` |
| "一分插件不能 import 另一个插件的组件"、"共享控件唯一出口" | `@deepseek-ai/dsh-client-ui-primitives/README.md` §Component catalog |
| 该包是 shell 构建输入、零 Cordis、无 `client.js` / 无 `dsh.client` | 同包 `README.md` + `package.json` |
| 冻结模块表 / `dsh.client.external` 的两条解析路径 / `require.async` | `@deepseek-ai/dsh-client-modules/README.md` |
| Xaihi 现有的 `--xaihi-* → --dsw-*` 别名层与"不 value-import 宿主包"纪律 | `packages/ui-host/src/client/{styles.ts,index.ts}` |
| **UI 双树**：`src/nodes/` 是纯 UI（`core.ts`/`cli.ts`/`Tui.tsx` 各 0 个）vs `packages/nodes/*/src/` 是宿主 | 本次 `find src/nodes -maxdepth 2 -name …` 与 `ls` 实测 |
| 两树唯一连接点是纯数据叶子子路径（`/definition`），包根 barrel 会拉进 `dist/core.js`（11,776 B） | `<Xiranite>/src/nodes/sleept/entry.ts` 逐字 + `wc -c` |
| 静态懒装载生成表（31 条 `() => import("@/nodes/<id>/entry")`） | `<Xiranite>/src/components/modules/packageModules.generated.ts` |
