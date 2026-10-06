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

**没做 / 未验**（别把这些当已完成）：
`pnpm build` 与 `typecheck` **还没跑过**——那 740 条第三方 value 边里绝大多数没声明，
构建必然红；`check:pins` / `check:skills` / `check:installable` 本轮没重跑（别的 lane 在飞，
全仓 `pnpm test` 的结果不可归因，只跑了自己那一档的 `vitest run`）；
设计语言与宿主面板的接线（`applyDesignTheme` 挂进 `ctx.effect`、CSS 注入、`@/backend` → DSH 接缝、
React 19 写法回退）一条都还没接；浏览器实机观感未验。
