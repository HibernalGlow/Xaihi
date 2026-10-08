# ADR-0008 L2 的共享机制与 L4 的边界：DSH 有两条跨包共享路，Xaihi 走 MF2 shared

状态：接受（2026-10-06）。**取代 ADR-0007 决定 6（方案甲）**；ADR-0007 决定 1–5 不变。
决策人：HibernalGlow
相关：ADR-0001（UI 传输）、ADR-0006（UI 真源是 Xiranite）、ADR-0007（组件放置四层）、
`docs/service-mapping.md`、`docs/roadmap.md` R10

## 背景

用户对自己的方案提出质疑原话：**"本身用的 MF2 架构不能解决这个问题吗？"** 并指出一个我漏掉的
区分：**shadcn 不是"每个插件装一份 runtime"，它是把组件源码放进项目**；真正要避免的是
「每个插件各复制一套 `button.tsx` / `card.tsx` / `dialog.tsx` 再各自打进 bundle」。因此正确的形状是
一个 Core UI 包（`@hibernalglow/xaihi-ui`），插件 `import { Button, Card } from …`，React 与 UI 都由宿主提供。

这条质疑成立，并且**推翻了 ADR-0007 决定 6（甲）的必要性**。逐项复核后，我上一轮错在两处，先更正。

### 更正 1：DSH 的平台单例表里**确实有** `ui-primitives` —— 它是**运行时**单例，不只是构建输入

`<deepseek-harness>/packages/client/web/src/seed.ts` 逐字（只读，未改动上游）：

```ts
/**
 * Platform-singleton module-table. These are the ONLY entities the shell
 * shares into the frozen module table — fetch bundles resolve their externals
 * against exactly this set through the loader's require. Keys come from
 * the platform constant module (./platform.ts, the single source of truth
 * with the tsdown client externals); values stay shell-static imports so
 * every bundle sees the same instance.
 */
return {
  'react': React,
  'react/jsx-runtime': ReactJsxRuntime,
  'react-dom': ReactDom,
  'react-dom/client': ReactDomClient,
  '@deepseek-ai/cordis': Cordis,
  '@deepseek-ai/dsh-client-store': ClientStore,
  '@deepseek-ai/dsh-client-ui-slots': UiSlots,
  '@deepseek-ai/dsh-client-ui-primitives': UiPrimitives,
  '@deepseek-ai/dsh-client-ui-dockkit': UiDockkit,
} satisfies Record<PlatformModule, unknown>
```

ADR-0007 事实 2 里，我据 `ui-primitives` 的**发布形状**（`files` 只有 `lib/index.js` + CSS，
无 `client.js`、无 `dsh.client`）推断"插件拿不到它的运行时实例"。**这一步是错的**：同一个包
**既**是 shell 的构建输入，**也**是运行时平台单例。插件能拿到**同一个实例**，且拿的正是 host 那一份。

### 更正 2：跨包共享有**三条**路，我上一轮只承认了一条

| 路 | 机制 | 谁提供 | Xaihi 能否走 |
|---|---|---|---|
| **A. 平台单例** | 冻结模块表 `PLATFORM_MODULES`（上表 9 键） | DSH shell 静态表 | **不能**：键来自 DSH 的 `PlatformModule` 常量类型 + `seed.ts` 的 `satisfies` 投影，加键 = 改 DSH 源码 = 分叉（违 `xaihi-architecture` 第 1 条） |
| **B. `dsh.client.external`** | 见下逐字 | **另一个动态包的 row**，或静态表键 | **能**（不改 DSH） |
| **C. MF2 `shared`** | `@module-federation/runtime` 的共享域 | Xaihi 宿主容器自己 | **已经能**：ADR-0001 §2 的实现已在跑 |

B 的语义，本机 `@deepseek-ai/dsh-client-modules@0.2.0-rc.2` 的 `README.md:34,46` 逐字：

> A browser plugin package declares `dsh.client` in its `package.json` with `platform: 'web'`, exports a
> `./client` bundle, and lists any non-baseline module requests under **`dsh.client.external`**. The host
> half turns each declaration into a served bundle under `/plugins`, **ordered so dynamic providers load
> before their consumers**.

> The shell seeds a frozen module table (`PLATFORM_MODULES`: React, Cordis, and static UI libraries); every
> dynamic bundle resolves its externals against exactly that baseline. **`dsh.client.external` adds only
> exact non-baseline requests, each answered by the dynamic package row it names or an exact static-table
> key.** Type-only imports are erased and create no request. **Composition rejects malformed requests,
> missing suppliers, self-requests, and synchronous request cycles.**

字段真名与类型（同包 `lib/client.js:67` 逐字）：`optionalStringArray(pkgName, "dsh.client.external", decl.external)`
⇒ **`dsh.client.external: string[]`**。

这条推翻了我 ADR-0007 里对 client-modules README 那句规范的理解。那句
*"A plugin cannot import another plugin's component, so this package is the only place a control can be
shared"* 出自 `ui-primitives` —— 它的语境是「**别在插件之间**互相 import 组件」，而 L2 这类
**共享控件层**正是规范要求的**唯一出口**。DSH 的实现是把该层提升为**平台单例**（路 A）；
Xaihi 没有那个权限，于是走**路 B / C** —— 机制就是给这个用的，不是"绕规范"。

### 事实 3（决定性）：`@hibernalglow/xaihi-ui` **已经存在**，而且**已经是 DSH client 包**

`packages/ui-host/package.json` 逐字：

```json
{ "name": "@hibernalglow/xaihi-ui",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" },
           "client": { "platform": "web",
                       "inject": ["@deepseek-ai/dsh-client-ui-layout"] } },
  "exports": { ".": {…}, "./client": "./lib/client.js", "./locale/*.json": …, "./package.json": … } }
```

配套 `packages/ui-host/cordis.patch.yml` 的注释把机制写死了：

> `name` 必须等于包名：client-modules 把浏览器半边挂到 specifier 为裸包名的行上，
> 所以关掉这一行就同时卸掉整个工作台（含它声明的 `xaihi.*` 槽与所有贡献）。

也就是说：用户设想的那个包**就是 `packages/ui-host`**，而且它的 `dsh.client` / `exports["./client"]`
/ `inject` 三件套**已经齐了**。

### 事实 4：MF2 **已经在跑**，`shared` 已经在用

`packages/ui-host/src/client/loader/remote-modules.ts` 第 14、19-34 行逐字：

```ts
import { init, loadRemote, registerRemotes } from '@module-federation/runtime'
…
/** 交给远端共享域的宿主实例：React 与 jsx-runtime，版本按宿主实际所带。 */
const shared = {
  react: { version: React.version, scope: 'default', lib: () => React, loaded: true },
  'react/jsx-runtime': { version: React.version, scope: 'default', lib: () => JsxRuntime, loaded: true },
}
```

⇒ 用户说的 "MF2 的 `shared` 里把 react / react-dom / `@hibernalglow/xaihi-ui` 设成共享（最好
singleton）" —— 前两项**已经这么做了**，第三项只是**在同一个对象里加一条键**。

### 事实 5：甲会**作废已经落地并带测试的机制**

ADR-0001 §2 的主实现（远程模块容器）不是纸面设计，它已经落地在
`src/client/loader/{remote-modules.ts,probe.ts}`，并由 `workspace.tsx` 的 `UIModuleLoader` 消费，
还带 `tests/probe.spec.ts`、`tests/purity.spec.ts`。甲（L4 改成构建期注册表）会让这套 loader、
它的 React 同一性断言、以及那两个测试文件**一起作废**。丁（本 ADR）只给 `shared` 加键。

## 决定

1. **L1 外壳 + L2 原子层 = `@hibernalglow/xaihi-ui`（同一个包）。** 这**已是事实**（事实 3），不需要改。
2. **L4 每节点独立成租，不进工作台包。** 每个节点 UI 是一个可动态装载的单元，与它所在节点包的
   宿主半边同仓维护；**装一个节点 = 它的 UI 随之出现**，不重打工作台。这同时保住 ADR-0002 的自包含
   与 ADR-0001「插件自带 UI」的出发点。
3. **L2 的共享走 MF2 `shared`（路 C），不走平台单例（路 A），也不新开 DSH `external`（路 B 留作备用）。**
   理由：路 A 要改 DSH（分叉）；路 C 已在跑且是"最少改动"；路 B 要求 L2 以**裸包名**被点名并受
   "提供方先于消费方"排序，在 Xaihi 自带的 MF 容器里属于第二套机制，无必要。
4. **节点 UI 的组件 specifier 从 `@/components/ui/*` 改指 `@hibernalglow/xaihi-ui`。**
   属 ADR-0003 许可的"只改 import/身份边界"改动，机械可校验。**不用构建期 alias 掩盖**：
   shared 是按 specifier 字符串匹配的，靠 alias 会把"实际共享了什么"变成隐式。
5. **CSS 三层分工，这一条与 shared 无关、但两条路里都存在，必须写死：**
   - **主题变量**（Tailwind v4 的 `@theme` / `:root` token）**只能由宿主出一次**（沿用 ADR-0007 决定 3
     的 `ctx.theme.overrideTokens` 边界 + `--xaihi-* → --dsw-*` 别名层）。
   - **utility 类**由各包自己的 CSS 构建产出（类名幂等，重复无害）。
   - 宿主 CSS 的 `@source` **必须覆盖 L4 源码**，否则 L4 的类名根本不生成 —— 症状是"组件在、样式没"。
6. **ADR-0007 决定 6（甲）与甲乙丙的二分作废**；ADR-0007 决定 1–5（四层落点、L2 唯一出口、CSS 归宿主、
   `entry` 不带 core、门禁跟着搬）**全部保留**。

## 后果

- **正面**：
  - 甲的代价全部不付（不重打工作台、不作废已落地的 loader/probe/测试）。
  - "该放哪"的判据仍然是 ADR-0007 那一句：**第二个包需要同一个控件 → 上移 L2**。本 ADR 只是补上
    L2 的**共享手段**。
  - 节点 UI 真正随插件装卸，与 ADR-0002「一个包 = 一行 = 一个可开关单元」同向。
- **代价（新增，要立成断言而不是约定）**：
  - **L2 版本一致性**：所有 remote 必须共享同一份 L2。**双 L2 的症状与双 React 同类**
    （跨边界 hooks / context 随机崩，原因离症状很远）⇒ `probe.ts` 的同一性判定要**扩一条**：
    除 `sameReactAsHost` 外再加 `sameUiAsHost`，并保留"把 `import:false` 改掉时必须变 `false`"的证伪测试。
    **（此条以"L4 与宿主同 realm"为前提，见下节。）**
  - **`shared` 的提供者是宿主半边**：目前 `remote-modules.ts` 住在候选的 L2 包内部。若 L2 与工作台同包，
    `shared` 会出现**自引用**（包共享自己）。构建期要确认不形成循环；若成为麻烦，按"待确认"里那条拆包。
  - **两条 CSS 构建单元**下的 `@source` 漂移：漏扫一个节点目录，症状只在那个节点的界面上出现。
  - **`@module-federation/runtime` 的 `shared` 只对 MF remote 生效**；万一将来某个节点走 ADR-0001 §3 的
    DSH 原生 client 兜底，同一份 L2 要改由 `dsh.client.external` 表达（路 B）—— 契约不变，声明要写两份。

## 与 ADR-0009 的相遇点（同日并发提出，**不替使用者裁定**）

同一日写出的 **ADR-0009（插件 UI 的 React 归属）** 定的是另一根轴：**哪一份 React 渲染**
（宿主 18.3.1 vs 使用者的 React 19）。本 ADR 定的是**L2 放在哪、怎么共享**。两条**在 L4 正面相遇**，
相遇点是这一句：**`shared` 只在同一个 realm 的 MF 容器内生效**。

| L4 的形态 | 本 ADR 决定 3（L2 走 MF2 `shared`） | 后果里"双 L2 断言" |
|---|---|---|
| **同 realm**：L4 是宿主文档内的 MF remote（**本 ADR 的默认前提**） | 成立，照本 ADR 执行 | `sameUiAsHost` 成立（与 `sameReactAsHost` 同理） |
| **独立 realm**：L4 跑在自己的文档里（ADR-0009 的推荐 (a)：`plugin-host.html`） | **不成立** —— 跨文档拿不到宿主那一份 | 该断言**恒为 `false`**，要换成"**同一文档内只有一份 L2**"；重复的只是字节，**不是 hooks 实例** ⇒ "双 L2 随机崩"的机制在独立 realm 下**不存在**（它成立的前提正是同 realm 共享实例） |

- **决定 1 / 2 / 4 在两种形态下都成立**，不受 ADR-0009 影响。
- **决定 5 的第一条（主题变量由宿主出一次）也成立**，但独立 realm 下要按 ADR-0009 后果 2 的
  "**两边都写**"落地：外壳 DOM 上一份 + iframe 文档里一份。
- **只有决定 3 的"手段"是条件性的**：走独立 realm 时，L2 的共享手段换成
  "每个插件文档各带一份 L2"，而**结论（L2 只有一个出口、不许各节点自造控件）不变**。
- 谁先定：**ADR-0009 的 (a) 是否成立取决于"DSH 的 web 宿主能不能把独立文档装进来"**（它挂在
  roadmap R12，未证）。在它被证实之前，本 ADR 的同 realm 前提仍然是**唯一已落地**的形态
  （`remote-modules.ts` 的 MF2 容器今天就在跑）。
- **两份 ADR 不许各自默认自己对**（ADR-0009 后果 5 的原话）。使用者裁定后，把结论写回**本节的表**，
  而不是只改一处。

## 待确认（实现细节，需你拍；不拍也能开工，但会返工）

**L2 与 L1 是不是同一个包？** 现状 `packages/ui-host` 的**包名**是 `@hibernalglow/xaihi-ui`，
但**内容**是工作台（shell）+ loader + 主题上下文。而你的口径是"`@hibernalglow/xaihi-ui` 里就放
shadcn 组件"。两种收法：

- **(i) 不拆**：L2 就放进现在的 `packages/ui-host`，`shared` 指向自己。改动最小，但包名与内容不符，
  且 remote 共享的是一大坨（含 loader 与主题上下文），`shared` 自引用要在构建期解决。
- **(ii) 拆（我建议）**：`packages/ui-host` **改名**（如 `@hibernalglow/xaihi-shell`），腾出
  `@hibernalglow/xaihi-ui` 给**纯组件包**（104 个原语 + `cn` + `lib/design-theme`，无 loader、无 MF runtime、
  无工作台状态）。`shared` 的提供者是纯组件层，无自引用；且与你的口径逐字一致。
  成本：改 `cordis.patch.yml` 的 id 与包名、依赖引用、`check:pins` 类门禁的名单。

**在拍之前**：L4 的目录与构建可以按本 ADR 开工（决定 2/4/5 不受影响），**但不要把 shadcn 原语放进
`packages/ui-host` 去**（那等于默认了 (i)）。

## 证据清单

| 事实 | 出处 |
|---|---|
| 平台单例表 9 键，含 `ui-primitives`；"the ONLY entities" | `<deepseek-harness>/packages/client/web/src/seed.ts`（GitHub master，只读） |
| 键来自 `PlatformModule` 常量 + `satisfies` 投影 | 同文件注释 + `packages/client/modules/src/client/platform.ts`（`seed.ts` 注释所指） |
| `dsh.client.external` 语义、两条解析路径、"提供方先于消费方" | 本机 `@deepseek-ai/dsh-client-modules@0.2.0-rc.2/README.md:34,46`（`README.zh.md:34,46` 同义） |
| `dsh.client.external: string[]` | 同包 `lib/client.js:67`（`optionalStringArray(..., "dsh.client.external", decl.external)`） |
| `WebBootEntry.external` = "Non-baseline module specifiers"；图序里 provider 在 consumer 前 | `<deepseek-harness>/docs/subsystems/client-modules.md`（GitHub master） |
| DSH 把 UI 拆成 `packages/client/` 下 70+ 个 `ui-*` 包 | 同仓 `packages/client/README.md` 包表（GitHub master） |
| `@hibernalglow/xaihi-ui` 已是 dsh.client 包（platform/inject/exports） | `packages/ui-host/package.json` |
| "name 必须等于包名"、关一行即卸整个工作台 | `packages/ui-host/cordis.patch.yml` 注释 |
| MF2 已在跑 + `shared` 已有 react/jsx-runtime | `packages/ui-host/src/client/loader/remote-modules.ts:14,19-34` |
| 甲的代价会作废已落地的 loader/probe/测试 | 同上 + `packages/ui-host/tests/{probe,purity}.spec.ts` |
| 依赖策略把 `packages/client/**` 一律当扁平化依赖处理 | `<deepseek-harness>/scripts/package-dependency-policy.ts`（`usesFlattenedPackageDependencies`） |
| 上游 UI 双树（UI 在 app `src/nodes/`，宿主在 `packages/nodes/*/src/`，只走纯数据叶子） | ADR-0007 §决定 6 的实测（本次复核未变） |
