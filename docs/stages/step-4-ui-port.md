# 阶段报告：UI 半边整体搬运（工作台 + 设计语言 + 节点面）

对应计划 Step 4.4 / roadmap R10。判据与真源裁定在 `docs/adr/0006-ui-source-is-xiranite.md`
（本轮新增的「修正：UI 半边只认一个基线」一节）与 `docs/adr/0007-component-placement.md`。

## 一、改了什么

**把 Xiranite 已经写好的 UI 半边整棵搬进 `packages/ui-host`，一个基线、零改写。**

- `scripts/port-ui.mjs`：搬运器。按一张固定的子树表从 `<Xiranite>/src` 复制，
  不改别名、不改格式、不删注释；`--check` 是尺。跳过 `*.browser.test.ts*` / `*.e2e.test.ts*` /
  `__screenshots__`。
- `docs/port/xiranite-ui.json`：来源指纹，**613 个文件 / 5,188,108 字节**，逐文件 `sha256` + 字节数 + 落点。
- `packages/ui-host/src/`：现在 **636 个文件（ts/tsx 606 个）**，其中 613 个由搬运器管；按 ADR-0007 的四层落点：

  | 层 | 落点 | 文件 |
  |---|---|---|
  | L1 外壳 | `App.tsx`、`components/{workspace,views,modules}`、`store`、`config`、`types`、`i18n`、`actions`、`plugins`、`desktop` | 200+ |
  | L2 共享原子 | `components/{ui,data-table,niko-table,context-menu,help}`、`lib/{utils,design-theme,…}`、`index.css`、`styles/{design,themes}` | 210+ |
  | L3 节点接缝 | `nodes/shared` | 39 |
  | L4 节点面 | `nodes/{linedup,sleept,dissolvef,findz}` | 31 |
  | 接缝层 | `backend`（上游那 14 个 RPC 客户端模块，原样搬，未改写） | 27 |

- `packages/ui-host/{tsconfig.json,vitest.config.ts}`：加 `@/* → ./src/*` 与
  `resolveJsonModule`；测试环境按上游逐字改成 **happy-dom**。
- `packages/ui-host/package.json`：加 `@material/web@2.5.0`（`md3/space.test.ts` 要拿
  `md-space-tokens.scss` 逐条比）与 `happy-dom`。
- `pnpm-workspace.yaml`：终端面那 6 个包**暂时负模式排除**（原因见下）。
- `scripts/port-debt.mjs` + `docs/port/debt-2026-10-06.txt`：搬运债台账（第四节）。
- 本仓原有的两个 spec 改用 `import.meta.dirname` 作路径基准（换环境的连带后果）。

## 二、为什么这样设计

1. **搬运要有出处，不能只有结果。** 工作树不是 commit，手抄一遍之后没人能回答
   "这一行是上游哪一行的哪个版本"。所以搬运是脚本 + `sha256` 清单，
   将来上游同步时 `--check` 直接指出漂在哪一个文件（对应"融合不丢"那条既有纪律）。
2. **基线只能有一个。** 第一轮按 tag `noxide` 搬 L1–L4、按工作树搬设计语言，
   结果**上游自己那条尺把混基线判红了**：`registry.test.ts` 要求每份被注册配方在中英两份
   i18n 里都有 label，而 `swiss` / `lonestar` 的标签只活在未提交的工作树里
   （noxide 没配方；HEAD `2694975` 两份 JSON 都 `MISS`）。统一基线后同一把尺从红转绿——
   这条就是"为什么真源是工作树快照而不是 noxide"的证据，不是口味。
3. **保真判据用上游的测试，不另写期望值。** 搬过来的 14 个测试文件带 **135 条断言**，
   本仓自己的只有 20 条。`md3/tokenCoverage.test.ts`（35 条）、`mapper.test.ts`（24 条）、
   `lonestar/spec.test.ts`（10 条，撞 `.dart` 校准表快照）这些就是设计语言的合同本身。
   期望值全部来自上游与规范原文，没有一条是"我跑一遍被测函数抄下来"的。
4. **`@/` 别名与 `@xiranite/*` 一律原样保留。** 上游 482 文件 / 2219 条 `@/` 导入
   （ADR-0007 事实 1），搬运这一轮改它 = 把可 diff 性换成一堆无法复核的机械改动。
   改名与接缝改写属于"接线"那一轮，台账见第四节。
5. **`backend` 那 27 个文件也原样搬。** 它是上游 UI 与宿主之间的接缝（48 处引用），
   不搬则 L1 一半的文件解析不到；搬了不改写，是为了让"哪些接缝要换成 DSH 的哪个子系统"
   逐条落在 `docs/service-mapping.md` 上，而不是在复制粘贴里顺手糊掉。

## 三、与 DSH API 的关系

- 主题落点没变：仍然只有 `ctx.theme.overrideTokens(source, tokens)`
  （`@deepseek-ai/dsh-client-ui-theme` 的客户端面，本仓现有调用点在
  `packages/ui-host/src/client/index.ts` 的 `ctx.effect`）。设计语言的**根属性 + inline 变量**
  那一半走 `applyDesignTheme()`（`src/lib/design-theme/apply.ts:92`，写 `document.documentElement`），
  两条各司其职：前者叠宿主 token，后者喂我们自己的 CSS 树。**没有第二套主题引擎**（ADR-0006）。
- `src/client/**` 依旧**不 value-import 任何 harness 包**，只以 `import type` 出现——
  这条现在不再靠注释：`scripts/port-debt.mjs` 报
  「非测试文件里 value-import harness 包：**0 类 / 0 条边**」。
- 搬运进来的这棵树**不在浏览器模块表基线里**（react 294 条边是唯一例外，它在基线内）。
  所以构建期必须全部内联，而 `tsdown.config.ts` 的 `noExternal: () => true` 正是这个形状；
  内联规模与 MIME/缓存的连带问题在第四节列为未决。
- DSH 的插件面没有"取自身静态文件"的官方机制（只有 `/plugins/<pkg>/client.js` 与
  `client.<name>.js`），因此 `styles/**` 与 `index.css` 里那批 CSS 只能变成
  构建期生成物 + 运行时注入；`src/index.css:1` 的远端字体 `@import` 与
  Tailwind v4 的 `@source` / `.tailwind-candidates.txt` 扫描都挂在这条未决上。
- 版本闸门不变：本轮没有新增任何 `@deepseek-ai/dsh*` 依赖，`check:pins` 仍然精确
  `0.2.0-rc.2`；新增的两个 devDependency 是 `@material/web` 与 `happy-dom`。

## 四、搬运债台账（`node scripts/port-debt.mjs`，全文 `docs/port/debt-2026-10-06.txt`）

| 类别 | 数 | 说明 |
|---|---|---|
| 未解析的 `@/` 边 | **9 类 / 9 条** | 8 条指向未迁节点 `melodeck`（`WorkspaceMelodeck.tsx` 的 L4 面），1 条是 `@/assets/…json?url` 这种 Vite 专属后缀 |
| `@xiranite/*` value 边 | **9 类 / 43 条** | contract 14、shared 12、api/client 8、`node-{sleept,dissolvef,linedup,findz}` 与 `findz-native` 若干；另有 86 条是 type-only（产物里不存在，不用改） |
| 第三方裸依赖 | **77 类 / 740 条 value 边** | react 294、lucide-react 143、react-i18next 57、@tanstack/react-table 53、@testing-library/react 50、ldrs 45… |
| 非测试文件的 `node:*` | **0** | 11 条 `node:fs` / `node:path` 全在 `.test.ts` 里（读上游快照夹具），合法 |
| 非测试文件的 harness value-import | **0** | purity 纪律在这棵新树里没被破 |

三个"构建绿之前一定会撞"的洞，先记账不假装解决：

1. **React 19 写法落在 React 18.3.1 宿主上。** L2 的原语（`button.tsx`、`input.tsx` 等）
   用 ref-as-prop 而不是 `forwardRef`；在 18 上 ref **静默丢掉**（不报错）。
   网页面受 DSH 那个 React 单例约束，CLI/TUI 不受（ADR-0006 末段）。
2. **Radix 全是幽灵依赖。** 上游 18+ 个 `@radix-ui/react-*` 只有一个写在 `package.json` 里，
   其余靠 bun 的提升；换 pnpm + 严格解析必须逐个显式声明。
3. **Tailwind v4 的候选名单是构建期生成的。** `@import "tailwindcss" source(none)` 关掉了自动
   content 探测，类名只来自显式 `@source` + `.tailwind-candidates.txt`（上游由一个 Vite 插件
   用 `@tailwindcss/oxide` 的 `Scanner` 现扫）。那份快照比这 613 个文件旧 ⇒ 不重生成，
   L2/L4 的类名根本不出现（ADR-0007 后果 #1 说的就是这件事）。

## 五、顺手修掉的一个真故障

终端面那 6 个包（`packages/{api,cli,cli-runtime,contract,logging,shared}`）一进 `packages/*` glob，
它们的 `@xiranite/*` + `workspace:*` 依赖就让 **pnpm 连依赖树都解不出来**：

```
Error:   × installing dependencies
  ╰─▶ Failed to resolve dependency tree: Failed to resolve dependency: In /Users/…/packages/api:
      "@xiranite/file-operations@workspace:*" is in the dependencies but no package named
      "@xiranite/file-operations" is present in the workspace
```

症状不是"那个包坏了"，是**全仓每一条 pnpm 命令**（含所有门禁）都红。
落点是 `pnpm-workspace.yaml` 里逐条 `!packages/<name>` 负模式 + 注释写清放行条件，
不是删包、不是放宽任何尺。这与 ADR-0002 的"profile 解析不了 `workspace:*`"是同一类失败，
只是这次发生在仓内。

第二个故障同类，而且更阴：**`.gitignore` 第 2 行原本是不限深度的 `lib/`**，
它把搬运树里的 `packages/ui-host/src/lib/**`（设计语言引擎整棵）与
`src/components/niko-table/lib/**` 一共 **83 个文件**从 git 眼前藏掉。
本地一切照绿——`vitest` 155/155、`port-ui.mjs --check` 也是 0 漂——
而干净检出一少就是一整个引擎，正属"提交了引用者、没提交被引用者"那一类。
实测对照：

```
$ git check-ignore -v packages/ui-host/src/lib/appearance.ts
.gitignore:2:lib/     packages/ui-host/src/lib/appearance.ts          # 之前：被产物规则吃掉
$ # 改成钉到包根（/lib/、/packages/*/lib/、/packages/*/dist/、/plugins/*/…）之后
$ git ls-files --others --exclude-standard packages/ui-host/src | wc -l
     625                                                             # 之前 542，找回 83
$ git check-ignore -v packages/ui-host/lib/client.js
.gitignore:9:/packages/*/lib/  packages/ui-host/lib/client.js         # 产物仍然被忽略
```


## 六、证据

```
$ node scripts/port-ui.mjs --check
$ node scripts/port-ui.mjs
port: 613 tracked file(s), 41 copied, 0 out of sync, 0 missing                            rc=0
$ node scripts/port-ui.mjs --check
check: 613 tracked file(s), 0 copied, 0 out of sync, 0 missing                            rc=0

$ cd packages/ui-host && pnpm exec vitest run
 Test Files  17 passed (17)
      Tests  155 passed (155)        # 135 条来自上游原样尺 + 20 条本仓 spec   rc=0

$ node scripts/port-debt.mjs
未解析的 @/ 边: 9 类 / 9 条边；@xiranite/* value 边: 9 类 / 43 条；
非测试文件里的 node: 导入: 0；非测试文件里 value-import harness 包: 0        rc=0

$ pnpm exec vitest --version         # 负模式放行后 pnpm 恢复可用
vitest/4.1.11 darwin-arm64 node-v26.10.0                                     rc=0
```

## 七、主题接缝的一处实错（搬完设计语言才发现的）

`ctx.theme.overrideTokens(source, tokens)` 的键**只认宿主自己的 `--dsw-alias-*` 名字**。
装的这份 0.2.0-rc.2 逐字写着：`ThemeTokens = Record<string, string>` 的注释是
"Theme token dictionary: --dsw-alias-* overrides keyed by variable name"
（`packages/ui-host/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/types/client/index.d.ts:26-28`），
而 `overrideTokens` 在 `:178` 且**返回一个 disposer**（"returns disposer removing exactly the layer this call created"）。

我 Step 4.4 那一版（`src/client/theme/material-you.ts`）把 `--xaihi-*` 当名字喂了进去。
⇒ **那一层从未到过屏幕上**，而它的 7 条测试全绿：测的是"我这层函数产出了什么"，
不是"宿主拿没拿到"。这与 §21 早先那次"照前缀规律拼出来的 `--dsw-alias-*` 全 `(unset)`"是同一个洞的两种犯法。

替换成什么（都有尺）：

- `src/client/theme/engine.ts`：同一份配方按明暗各求值一次，凑齐 `ThemeTokenModes` 要求的成对值；
  值只出自搬进来的引擎，接缝里一个 hex 都不写，也不再直接引 `@material/material-color-utilities`。
- `src/client/theme/design-language.ts`：`HOST_ROLES` 的七个 `--dsw-alias-*` 名字全部来自 §21 的实测表，
  并且**必须出现在 `ctx.theme.exportInspectTokens()` 现读出来的目录里**才应用；
  不在的进 `absent`，描述里一个角色词都不命中的进 `unconfirmed`（应用了但看得见）。
  这条"名字只许现读"是类型给的出口：`exportInspectTokens` 的注释逐字
  "Export the current token directory without reading DOM or computed styles"（`index.d.ts:136`）。
- `default 配方 = native ⇒ 整层不存在`：不把任何一份候选提成默认（AGENTS.md 里那条口径）。
- `material-you.ts` 与它的 `tests/theme.spec.ts` 一起删掉；`tests/design-layer.spec.ts` 接住
  原来那两条判据（形状 / 兜底覆盖率）并新加四条，全部带阳性对照。

搬完才看见的两个**颜色形状**事实（我上一版以为形状由接缝决定）：
md3 与 mondrian 发 `#rrggbb`，**武陵发 `oklch(...)`**，**孤星的半透明面发
`color-mix(in oklab, #0B6E75 16%, transparent)`**。所以接缝的判据只能是"两值成对 + 是个 CSS 颜色"，
不能是"是 hex"。AA 那条因此量程受限：`contrastRatio` 只吃 hex，
而引擎把任意 CSS 颜色读成 hex 靠的是 canvas 像素回读（`domColor.ts` 开头写明），
**本机 happy-dom 没有 canvas 后端**（实测 `cssColorToHex('#ff0000')` 返回 `null`），
所以未量的色对必须逐条落在 `unmeasurable` 清单里、并断言 `unmeasurable + checked == 全量`，
而不是被 `continue` 洗掉。上游那侧 swiss / lonestar 各自钉了一份 AA 尺（实测
`spec.test.ts` 里有 "the palette clears WCAG AA on the pairs that carry text"），
**武陵没有**——这一条是真缺口，跨形状的 AA 要等真浏览器那轮补。
## 七、L4+L2 能不能打进浏览器产物：探针实测（跑完即删的配置）

问的是一个问题：**搬来的节点界面 + shadcn 原子 + 设计语言 + 注册表，tsdown 打不打得出来**。
探针配置只 import 这四样（不带 L1 外壳，因为另一条 lane 正在裁 settings 面的边）。

| 阶段 | 结果 |
|---|---|
| 原样（上游那份注册表） | `Build failed with 29 errors`，全是 `Could not resolve '@/nodes/<id>/entry'`（bandia/bitv/…）——没搬的节点不是运行时 404，是**整个 bundle 编不出来** |
| 换成本仓生成的注册表（`scripts/gen-node-registry.mjs`） | `10 errors`：4 类 CSS（`tsdown:css-guard`：`@tsdown/css` 没装）+ 1 类悬空边 |
| 补 `@tsdown/css@0.22.14`（tsdown 的 peer 逐字钉这一个版本） | `5 errors`，**全部**是并发 lane 裁掉 4 个 backend/config 文件后留下的悬空 import（`@/config/webview2`、`@/backend/localBackendControl`、`Webview2ExperimentsPanel`、`./NodeMemoryProtectionSettings`） |
| 把 L1 从探针里去掉，只留 L4+L2+设计语言 | **`BUILD COMPLETE`**：30 个 chunk / 合计 3.7 MB |
| 再加 `inlineDynamicImports: true`（压单文件） | `BUILD COMPLETE`：主文件 **2.60 MB**，但**仍留下一个 806 KB 的孤儿 chunk**，并且 CSS 落到独立资产 **`style.css` 5.46 kB** |

两条由此定死的结论：

1. **CSS 不会自己进 JS。** 27 个 chunk 里 grep 不到任何 CSS 文本（实测 `含 CSS 文本的 chunk: 0 / 27`），
   `@tsdown/css` 的产物形态是旁边一个 `style.css`。而 DSH 只给插件
   `/plugins/<pkg>/client.js` 与 `client.<name>.js` 两种 URL，没有"取自身静态文件"的官方通道
   ⇒ CSS 必须变成**产物里的一段文本**再运行时注入，这正是 `docs/stages/step-4-css-pipeline.md`
   在做的东西（那边同时处理 Tailwind v4 的 `@source`/候选快照）。
2. **"能不能拆 chunk"不由我们决定。** DSH 那条路由只有一个 `client.js`；
   要么压成单文件（2.6 MB，且现在还有一个 806 KB 孤儿 chunk 没并进去 ⇒ 单文件这条路本身没走通），
   要么按 ADR-0001/0007 决定 6：**工作台作为 MF2 remote 由我们自己的 `/xaihi/remotes/<slug>/<rev>/<file>` 发**，
   sibling chunk 天然可发。第 5 行的多 chunk 产物形状就是为这条准备的。

另外注册表这件事本身已经变成机制，不是一次性手工活：`node scripts/gen-node-registry.mjs --check`
是尺（实测在 `samea`/`timeu` 的宿主清单刚落地的同一分钟里它就报了"注册表与实际节点不一致"），
`port-ui.mjs` 那边把这份生成物登记成 `computed` 类 delta（不钉 sha，钉了就会逼人每次改账本），
而 `nodes/*/entry.ts` 那一族是**有意重写**：`def` 从注册表嵌进来的 `package.json#xaihi.node` 取，
不 value-import 宿主包（ADR-0007 决定 4 的 Xaihi 形状）。


## 八、依赖声明与"两把尺分别跑"（搬运树第一次能被类型检查）

搬完之后 `pnpm typecheck` 必然红：那 740 条第三方 value 边里绝大多数没人声明。
这一节把它变成可核对的东西。

- `scripts/port-deps.mjs`：扫搬运树的裸 import，与 `packages/ui-host/package.json` 对账，
  一条命令补声明（`--write`），三种红法一起管：**没声明**、**声明了但不是上游实装的那一份**、
  **被堵住的**。版本只有一个来源——`<Xiranite>/package.json`，它没有就读上游
  `node_modules` 里真装着的版本（标 `上游实装`）；两处都没有就报出来要人拍，不编。
  实测结果：**70 类第三方 value 依赖，全部补齐**，唯一 `blocked` 是
  `@hibernalglow/ocean-dataview`（它的 `peerDependencies` 逐字要 `react: ^19.0.0`，
  而网页面受 DSH 的 **18.3.1** 单例约束 ⇒ 要么它出一条 18 兼容线，要么这个数据面模块不进 v1）。
- **精确版本不是洁癖**：上游声明 `@diceui/tags-input@^0.7.2`、自己装的是 0.7.2，
  而 `^0.7.2` 今天会解到更新的 0.7.x，那份要 `@diceui/shared@0.12.1` —— 两个注册表里都没有这个版本，
  `pnpm install` 直接 rc=1（`No matching version found`）。 ⇒ 搬运树逐条钉**上游实装的精确版本**。
- 装完 `pnpm install --no-frozen-lockfile` **rc=0**；`pnpm --filter @hibernalglow/xaihi-ui exec tsc` 从
  "跑不动"变成能跑，第一次读数 **1074 条红 / 231 个文件**。
- `scripts/check-types.mjs`：那 1074 条**不是同一家的账**，所以按归属分桶跑两遍
  （`tsconfig.json` 只量 `src/client/**` + `tests/**`，仓级严格度；
  `tsconfig.ported.json` 量搬运树，严格度逐条对齐 `<Xiranite>/tsconfig.app.json`）。
  理由写进配置注释里：上游没有 `noUncheckedIndexedAccess` 也没有 `exactOptionalPropertyTypes`，
  把这两面旗子压到 613 个搬运文件上，实测 502 条只是口味差——
  "修"它的正确做法不是在他的界面里塞 500 个 `!`（那是重写，违反 ADR-0006）。
  桶里 `@xiranite/*` 的边用 `paths` 指到**同仓搬进来的源码**上（那些包还没入 workspace，
  但类型检查不需要包管理器参与），于是 217 条 TS2307 变可核对。
  当前读数：**own=0**（默认判据，rc=0）、**ported=291**、别的包=11；
  `--fail-on-all` 是"接线做完"那天的口径，现在跑它是 rc=1（实测）。
  正控：`--self-check` 喂一份合成日志，四个桶与"own=0 而 ported>0 时默认放行"这条规则本身必须能被证伪。
- `scripts/port-ui.mjs` 两处升级：manifest 每个文件记 `state`（上游 `head`/`modified`/`untracked`），
  新增 `docs/port/xaihi-deltas.json` 申报本地改动（必须连 ours 的 sha 一起对上才算同步，
  并支持 `removed: true` 表示"按 ADR 有意不要"）。
  它当场抓到并发 lane 在 23:15 改了 `RuntimeSection.tsx` 并裁掉 4 个 backend/config 接缝文件
  ——**没有这套机制，下一次搬运就会把他的改动覆盖回去**。


**没做 / 未验**（别把这些当已完成）：
`pnpm build` 与 `typecheck` **还没跑过**——那 740 条第三方 value 边里绝大多数没声明，
构建必然红；`check:pins` / `check:skills` / `check:installable` 本轮没重跑（别的 lane 在飞，
全仓 `pnpm test` 的结果不可归因，只跑了自己那一档的 `vitest run`）；
设计语言与宿主面板的接线（`applyDesignTheme` 挂进 `ctx.effect`、CSS 注入、`@/backend` → DSH 接缝、
React 19 写法回退）一条都还没接；浏览器实机观感未验。

## 9. 这一轮的三刀与它们各自留在未提交区的东西（2026-10-07 00:52）

**提交**：`ony`（`@xiranite/*` 解析收成一张表）、`kpk`（批次 E 四个节点成包）、
`rxo`（CSS 产物与运行期作用域那一半）、`nxy`（`@parcel/watcher` 占位串拍成 `false`）。

### 改了什么
1. **一张解析表**：`packages/ui-host/build-aliases.mjs` 是 `@xiranite/*` → 本仓源码的唯一映射，
   `tsdown.config.ts`、`vitest.config.ts`、`tsconfig.ported.json` 三处都从它取；它自带同步尺
   （别名条数 vs tsconfig 里 `@xiranite/*` 的键数）与 `assertAliasTargets()`（每条都得指到真文件）。
   自检当场抓到我两个错：一条指到不存在的 `packages/api/src/index.ts`，以及通配键与精确键的漂移。
2. **批次 E 成包**：`plugins/{logx,recycleu,samea,timeu}` 各带 `./cli`、`./help`、`bin`、
   三条 tsdown 入口与两份 spec；`src/nodes/*/entry.ts` 四个连接点改成从生成注册表取 `def`；
   `docs/port/xaihi-deltas.json` 登记这四条为**有意重写**而不是漂移。
3. **CSS 那一半**见 `step-4-css-pipeline.md` §8（含它抓到的一条引用计数漏）。

### 为什么这样设计
表只有一张，是因为"三处各自维护一份别名"这件事上一轮真的漂过：探针构建的 8 条 RESOLVE_ERROR
里有 3 条就是 tsconfig 有、构建没有。把同步做成脚本内的断言而不是文档约定，是同一个错只犯一次的唯一办法。

### 与 DSH API 的关系
浏览器半边仍然只出 `lib/client.js` 一个文件（`@deepseek-ai/dsh-client-modules` 的资源路由
只发 `client.*.js`，见 `packages/ui-host/scripts/check-client-bundle.mjs` 现在断的三件事：
单文件、无 Node 专用 require、无相对分片）。所有 `@xiranite/*` 与 `@/` 都在构建期内联掉，
所以运行时不需要任何本仓没有的包名。

### 留在未提交区的两件与原因
- `src/client/surface.tsx` 与 `tests/css-scope.spec.tsx`：同一文件里载着并发 lane 正在做的
  整块重写（`RealmProps` / `NoDocumentFace`），GitButler 只能整文件收，按"不替别人提 hunk"这条
  两边一起等；接线的代码在盘上并已跑绿（12 条 spec，减法跑测两条红）。
- `packages/ui-host/package.json`（`@tailwindcss/oxide: 4.3.2`）与 `pnpm-lock.yaml`：
  声明与 lock 不能分开发；而这份 lock 现在同时载着批次 F 那六个还没成形的包目录，
  提上去会给干净检出多出六个空 importer。
  **另记一条 HEAD 本来就有的同类问题（这条我先前写错了，现在是实测）**：在仓库外的临时 worktree 里检出 HEAD 跑
  `pnpm install --frozen-lockfile`，报的是
  `ERR_PNPM_PACKAGE_MANAGER_NO_IMPORTER: Cannot install with "frozen-lockfile" because pnpm-lock.yaml has no
  importers["plugins/hello"] entry`——方向与我原写的那条相反：**是 `plugins/hello` 还在 HEAD 的树里**
  （并发 lane 删它的那一刀还没提交），而这份 lock 是在删掉之后重装生成的。
  先前那句「`packages/ui-kit` 已删」是我没量就写的错话：`ls -d packages/ui-kit` 在盘上、HEAD 的树里也有它的
  `package.json`。`check:installable` 在活工作树里 rc=0 恰好把这一类完全挡住看不见，所以收口判据只能是
  「干净 worktree + --frozen-lockfile」这一条，等 hello 的删除与批次 F 的包一起落地后一次重装生成 lock 再验。

### 脚手架落后于已成形的包（下一条该做的）
`create-xaihi-plugin` 现在只出 13 个文件，缺 `src/{cli,cli-support,help}.ts`、`tests/cli.spec.ts`、
`vitest.config.ts` 以及 `bin` / `exports` 的 `./cli` `./help` / 三条 tsdown 入口——
批次 E 与 F 都是**手抄 `plugins/samea` 补上这一块的**。补法应当是生成器在仓内直接读
`plugins/linedup/src/cli-support.ts` 再改写 `@module` 那一行（这样 `check:vendored` 那条字节尺
天然守住），而不是在模板里再抄第二份。

## 10. 批次 F 的四个界面进树，以及一条实测出来的"根本没接上"（2026-10-07 01:07）

**做了什么**：`scripts/port-ui.mjs` 的名单加上 `nodes/{crashu,formatv,classq,linku}`（搬运器
先 `--check` 确认 24 条全是"没搬过"、不覆盖任何人在飞的文件，再 apply）；四个 `entry.ts`
改成 Xaihi 形状（`def` 取 `NODE_MANIFESTS.<id>`），并按既有口径在
`docs/port/xaihi-deltas.json` 登记（14 → 18 条）。解析表自动长到 **24 条**
（`@xiranite/node-<id>/{core,interaction}` 是从 `plugins/*/src/` 现读的，不手抄）。

**判据**（逐条 rc）：`port-ui --check` 0（657 份、0 漂、18 条申报差）；
`gen-node-registry` 0（**12 个界面目录 → 12 条注册**）；`build-aliases` 0（三处同步）；
`pnpm run build` 0（`lib/client.js` 1.43 MB，`check-client-bundle` OK）；
ui-host `vitest run` **24 文件 216 条绿**；`check-types` `own=1 ported=285 别的包=11`
（own 那条在并发 lane 的 `workspace.tsx(245,19)`；新增 12 条 ported 全是 React 18/19 的
`RefObject` 与 `Record<string, unknown>` 约束这一族，与批次 E 同一类，不是新形状）。

**新量到的一条，比上面所有绿都重要**：产物里**没有任何一个节点界面的代码**。
按 `src/nodes/sleept/Component.tsx` 里的中文串（`上次任务失败` / `为无限等待`）回读
`lib/client.js`，命中 **0**；`nodes/<id>/entry` 这类串也 **0**；
`rg 'PACKAGE_MODULES|packageModuleLoaders|NODE_MANIFESTS' src/client` **零消费者**。
⇒ 注册表是生成物、被测试覆盖、条目从 8 涨到 12，但**外壳从来不曾读它**：
现在屏上的那一片是 `src/client/workspace.tsx` 自绘的，节点面板这一路在数据上齐了，
在渲染上**没接线**。之前那条"L4 第一次真打进浏览器产物"的提交说明只在**探针入口**上成立
（探针显式 import 了八个 entry），不是工作台真的会显示它们——这条账在这里更正。

**下一步的落点**（写清楚免得下次重新找）：需要一个消费者把 `packageModuleLoaders` 变成屏上的面，
并且它得自己扛异步边界（DSH 的 `renderSlot` 没有 Suspense，`packages/client/web-react/README.md:19`），
错误按条目隔离。挂载点选在 `src/client/workspace.tsx` 还是新模块，取决于并发 lane 那条
`own=1` 什么时候落地——不在别人在飞的文件里塞我的行。

## 11. 节点界面上屏这条路：判据换地方、尺补盲点、文档构建从 43 条错降到 25 条（2026-10-07 01:37）

**先更正 §10 里那条判据的位置。** 在 `lib/client.js` 里搜不到任何节点界面，
不是搬运漏了，也不是装载器坏了：`src/client/index.ts:368-373` 写死了"这一格**不**把搬来的
工作台交给壳"，因为槽契约只让宿主 React 18 的元素穿过去，19 写的元素实测两次翻车
（`#31 Element type is invalid` 与整座桥连带消失的 `#300 fewer hooks`，见 ADR-0009）。
于是工作台的上屏载体是 **Xaihi 自己的文档产物**（`pnpm run build:document`），
"节点界面到底在不在屏上"这把尺必须挂在那份产物上，挂在 `client.js` 上量到 0 是**量错了地方**。
`rg -c 'PACKAGE_MODULES|packageModuleLoaders' src/client` 那次零命中仍然成立——它指的是
`src/client/` 里没有消费者；现在 `node-mount.tsx` 补上了这个消费者，
文档构建因此才有东西可打包。

**这一轮把文档构建从 43 条错降到 25 条，靠两条机械规则**（`rspack.document.mjs` 的 `resolve`）：
`modules: [本包 node_modules, 'node_modules']` 与 `extensionAlias: {'.js': ['.ts', '.js']}`。
理由是同一件事：`@xiranite/{shared,logging,…}` 那些包**不在 pnpm workspace 里**
（`pnpm-workspace.yaml` 的负向条目），所以它们没有自己的 `node_modules`，
从它们源码里发出去的裸名（实测 `zod`）与 NodeNext 写的 `./schema.js` 一类相对名都落不了地。
剩下的 25 条按类点名：`frontendIntegrity.ts` 4 条、`workspace/lane/LaneView.tsx` 4 条、
`store/workspace/uiSlice.ts` 2 条、`nodes/sleept/Component.tsx` 2 条、
`node:{fs,module,os}` 各 1 条，以及**只有 4 条未解析名**——
`@xiranite/shared/swimlane`、`@xiranite/node-sleept/duration`、`@xiranite/node-sleept/interaction`
（三条是 `build-aliases.mjs` 里 `UNRESOLVED_BY_DESIGN` 已登记的账）与
`./NodeMemoryProtectionSettings`（ADR-0013 判"有意不要"的那份文件，
它的 import 还挂在 `RuntimeSection.tsx:21`，归正在改那一刀的 lane）。

**`scripts/port-deps.mjs` 有一个真盲点，我这轮把它补上了。** 它的 import 抽取用的是
`(?:^|\n)\s*(?:import|export)[^;\n]*?from ['"]…` —— `[^;\n]` 不许跨行，
于是**多行命名导入整类看不见**：实测漏掉 `@radix-ui/react-tabs`（`components/ui/tabs.tsx:5`）
与 `react-querybuilder`（`nodes/shared/RuleTreeEditor.tsx:11`），而这两条恰恰是
`build:document` 早就在报的 Module not found。**尺说"只缺 1 条"、构建说"还缺 2 条"时，
取信的一侧必须是构建。** 改成"语句起点必须落在行首的 `import`/`export`，中间段只允许
标识符、空白、`*` `,` `{` `}`"之后，漏报与误报两边都收：第一版只用宽松的 `[\s\S]*?` 时，
`pluginRegistry.ts`、`border-beam.tsx`、`frontendHost.ts` 里三处散文/代码中的英文单词
`from` 被当成三个"包"（`?  })`、`? : colorFrom,`、`? never asked for`），收紧字符类后消失。
现在读数：**76 类** third-party value 依赖，缺声明 **9 条**——7 条按上游实装版本
`--write` 落进 `packages/ui-host/package.json` 的 devDependencies
（`@blocknote/react@0.51.4 @radix-ui/react-tabs@1.1.16 @radix-ui/react-toggle@1.1.13
ldrs@1.1.9 media-chrome@4.19.2 react-querybuilder@8.20.2 tldraw@5.2.3`），
`pnpm install` rc=0，两个新包确实在 `packages/ui-host/node_modules/` 里；
客户端半边不受影响（`pnpm run build` rc=0、`check-client-bundle` OK、
`vitest run` 26 文件 **246 条绿**）。

**要使用者拍的两条**（我没替它决定，也没写进产物）：
`@hibernalglow/ocean-dataview` 与 `@hibernalglow/folia-player` 都是私有组件包，
前者 peer 要 React `^19`、在本仓装产物里受 18.3.1 单例约束（`BLOCKED` 名单已登记，不进声明），
后者上游 `package.json` 与上游已装产物里都查无版本 ⇒ `DatabaseDataView.tsx` 与
`WorkspaceMelodeck.tsx` 这两个模块进不进 v1，需要一句话裁定。

**锁与声明仍然没同提交**（口径与 §9 相同，这里补上新原因）：`pnpm-lock.yaml` 现在的
importer 集合是本仓 34 个 workspace 目录的**超集**，其中批次 G/H 那些目录的 `package.json`
还在子代理手里没提交；把这份锁与 `packages/ui-host/package.json` 一起提上去，
干净检出会多出十几个空 importer。收口时机是所有包落定后一次 `pnpm install` 生成再一起提，
判据仍是"仓库外干净 worktree + `pnpm install --frozen-lockfile`"。

## 12. 一行别名清掉 11 条错：`UNRESOLVED_BY_DESIGN` 里那条"按设计不给"其实是没量就写的（2026-10-07 01:40）

`build-aliases.mjs` 把 `@xiranite/shared/swimlane` 挂在"有意不给解析"的名单里，理由写的是
"packages/shared 里没有 swimlane 那份（搬运只带了终端面用到的部分）"。这句**是错的**：

```
diff -q packages/shared/src/swimlane.ts <Xiranite>/packages/shared/src/swimlane.ts   # 逐字节相同
162 行、17 条 export
```

文件一直在仓里，缺的只是解析表上的一行。症状离原因很远：`@/components/workspace/swimlane/model`
因此变成"module has no exports"，`LaneView.tsx` 跟着炸出 5 条 `ESModulesLinkingError`
（`normalizeSwimlanePreferences` / `legacySwimlaneSessionState` / `fitSwimlaneWidthsToViewport` /
`adjacentSwimlane` / `DEFAULT_SWIMLANE_WORKSPACE_PREFERENCES`）。

补上那一行、`--write` 重生 `tsconfig.ported.json` 的 paths（文档构建的别名是从那份 paths 读的，
`rspack.document.mjs:88` 的 `aliasesFromTsconfig()`）之后：**文档构建 25 条错 → 14 条**。
同步尺读数：解析表 **35 条**（批次 G/H 的包各自带进 `core`/`interaction` 边，表是 `plugins/*/src` 现读派生的），
`node packages/ui-host/build-aliases.mjs` rc=0。

剩下 14 条按类点名为四类，都不含"未知的坑"：`src/plugins/frontendIntegrity.ts` 4 条、
`components/views/settings/RuntimeSection.tsx` 3 条（含那条挂着的 `./NodeMemoryProtectionSettings`，
归正在改 settings 那一刀的 lane）、`nodes/sleept/Component.tsx` 2 条（`node-sleept/{duration,interaction}`
是**真没搬**的定时器内核，与上面那条错话不同，这一条量过：noxide 的 `packages/nodes/sleept/src/` 里
有 `core.ts`/`interaction.ts` 而没有 `duration.ts`，本仓 `plugins/sleept/src/` 两份都没有）、
`node:{fs,os,module}` 各 1 条（搬运树里桌面侧的模块在浏览器图上）、
再加 `settingsNavigation.ts` 与 `ModuleRenderer.tsx` 各 1 条。

**判据没变好之前不许说"上屏了"**：`dist-ui/` 现在仍然是空的（构建红就不出产物），
所以"节点界面在屏上"这条还没兑现，只从 43 条错走到了 14 条。

## 13. 文档构建 43 → 8：补 `@xiranite/contract` 少掉的两片叶子，并接掉一处悬空搜索项（2026-10-07 01:44）

`pnpm run build:document` 此前 14 条错里有 **5 条是同一个根**：本仓 `packages/contract/src/` 只有 `index.ts` 一份，
而上游那个目录是 `index.ts + pluginManifest.ts + pinCoverage.ts + versionRange.ts`（外加三份测试）。
`index.ts:605-620` 那两块 `export { … } from "./pinCoverage.js"` / `"./versionRange.js"` 因此指向不存在的叶子，
症状全在浏览器那侧：`ModuleRenderer.tsx:303` 要 `checkContractVersion`、
`plugins/frontendIntegrity.ts:265,284` 要 `classifyPluginArtifacts` / `enumeratePluginArtifacts` / `isResourceOriginAllowed`，
rspack 只能报 "was not found in '@xiranite/contract' (possible exports: NODE_HOST_CONTRACT_VERSION, localizeNodeHelp)"。

做法是**逐字搬那两片叶子连同它们自己的测试**（`versionRange.ts`、`pinCoverage.ts` 都是零 import 的叶子，
不需要先决定依赖；`diff` 后与本包 `index.ts` 已有的 66 条导出没有重名冲突），
再把两块 re-export 补进 `index.ts`。顺带把上游那三份测试里的两份一起带进来——
`packages/contract` 不在 pnpm workspace 里（`pnpm-workspace.yaml` 的负向条目），
所以 `-r run test:unit` 天生扫不到它；为此新增根脚本 `test:contract`（`vitest run packages/contract/src`）
并排进 `pnpm test`，读数 **2 文件 16 条全绿**。
`pnpm exec vitest run`（ui-host）仍然 **26 文件 247 条绿**，客户端半边 `pnpm run build` rc=0。

第二条 fix 与 ADR-0013 同源：`settingsNavigation.ts:2,117,118` 还在从 `@/config/webview2` 取
`WEBVIEW2_FLAG_CATALOG` 生成两条设置搜索项，而那份配置与 `Webview2ExperimentsPanel.tsx` 已在差量台账里
登记为"有意不要"（`removed: true`）。文件删了、引用还留着 = 构建里一条 `Cannot find module '@/config/webview2'`。
摘掉这三行是完成那一次删除，不是新决定；被摘掉的只是"设置搜索里那两条 webview2 条目"，
本仓本来就没有可设的 webview2 面。

**还剩 8 条，四类，都已点名**：`components/views/settings/RuntimeSection.tsx` 3 条
（15/21/…行仍引 `@/components/views/Webview2ExperimentsPanel`、`@/backend/localBackendControl`、
`./NodeMemoryProtectionSettings`——三条全部指向台账里 `removed: true` 的那几份，
修法与上面这条完全同形，但那是正在改 settings 子树那一刀的落点，我不在那里抢行）；
`nodes/sleept/Component.tsx` 2 条（`node-sleept/{duration,interaction}` 是**真没搬**的定时器内核）；
`node:{fs,os,module}` 各 1 条（搬运树里桌面侧模块进了浏览器图）。

`dist-ui/` 仍然是空的：构建不绿就不出产物，所以"节点界面在屏上"这条**仍未兑现**，
只是从 43 条错走到 8 条。

## 14. 三条 `node:*` 边切掉了：真凶不是搬运树，是我们自己的 SDK barrel（2026-10-07 01:05，文档构建 8 → 5）

我先前给的两个嫌疑（`packages/logging/src/node.ts`、`packages/shared/src/efu-stream.ts`）**是错的**，
代理没有采信，而是用 `rspack build --json` 读 `modules[].issuerPath` 定位：
`packageModules.generated.ts:9` 以**裸名**引 `@hibernalglow/xaihi-sdk` ⇒ 落到 `node-sdk` 的 barrel
⇒ `src/define-node.ts:18` 的 `@deepseek-ai/dsh-tools` ⇒ dsh-tools 把 `dsh-sandbox`（`node:fs`/`node:os`）
与 `dsh-llm`（`node:module`）拉进浏览器图。同一份 stats 里那两个"嫌疑文件"命中 **0**。

修法是切边不是掩盖：浏览器图里那个裸名唯一的 value-import 只要 `nodeHelpFromManifest`，
所以给文档构建单独一条 `BROWSER_GRAPH_ALIASES`（`@hibernalglow/xaihi-sdk` → `packages/node-sdk/src/help.ts`，
`help.ts` 自身零 import），键加 `$` 做整名匹配，`./bridge`、`./operations` 子路径仍走包自己的导出。
**故意不并进 `XIRANITE_ALIASES`**：那张表同时喂 tsconfig `paths`，类型检查那边需要整只 barrel
（`PanelContribution` 等只在 `src/index.ts` 出）。修好后图上 `dsh-tools|dsh-sandbox|dsh-llm` 模块数
1/1/2 → **0/0/0**，而 `node-sdk/src/help.ts` 以 9,257 字节真身 + `providedExports: ['nodeHelpFromManifest']` 在图里。
阳性对照：在 /tmp 里删掉那一个别名键重跑 ⇒ 回到 8 条错、三条 `node:*` 全在。

主 agent 复跑（真实 rc）：`build:document` rc=1 但 **5 errors、`^ERROR in node:` 计数 0**；
`vitest run` 26 文件 **247 条绿**；`pnpm run build`（客户端半边）rc=0 且 `check-client-bundle` OK；
`node packages/ui-host/build-aliases.mjs` rc=0（43 条 + 1 条只给浏览器产物，tsconfig 同步 OK）。

剩下 5 条全部有归属，不是未知的坑：`settings/RuntimeSection.tsx:182/187/193` 三条指向
`@/backend/localBackendControl`、`@/components/views/Webview2ExperimentsPanel`、`./NodeMemoryProtectionSettings`
（`find packages plugins -iname` 全仓 0 命中，属并发 lane 那一刀没接完）；
`nodes/sleept/Component.tsx:221/222` 两条正是 `UNRESOLVED_BY_DESIGN` 该响的定时器内核。

留一条后续（别人一行）：给 `packages/node-sdk/package.json` 补 `./help` 导出、
让 `scripts/gen-node-registry.mjs` 按子路径取，然后删掉这条临时别名。
