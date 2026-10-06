# 283 条红断言的根因分类（ui-host 节点测试放开采集之后）

台账 `docs/port/ui-tests-inventory.md` 量到"补上解析这一层会暴露 283 条真红断言"，
但没有归因。本轮只做一件事：**把那 283 条按根因分组**，让 workspace 那一步（任务 #3 / #25）
落地时知道自己买的是什么。本轮**没有改任何仓内文件**（`vitest.config.ts` 的 include 一条没动），
采集用的一次性配置与一次性 setup 文件跑完即删，产物 JSON 留在仓外
`/Users/glow/Base/Code/Freya/.scratch/uitest{,-A,-B,-C}.json`。

## 采集方法（三条命令，都能复跑）

1. 给四个不入 workspace 的包补一次性解析根（`pnpm-workspace.yaml` 顶部的负向条目是它们没有
   `node_modules` 的原因）：

   ```bash
   cd /Users/glow/Base/Code/Freya/Xaihi
   for p in shared logging contract cli-runtime; do ln -s ../ui-host/node_modules packages/$p/node_modules; done
   ```

2. 一次性配置 `packages/ui-host/vitest.triage.config.ts`（与 `vitest.config.ts` 同一张
   `XIRANITE_ALIASES` 表 + `@`，`environment: 'happy-dom'`，只把 `include` 换成
   `src/nodes/**/*.test.ts` 与 `src/nodes/**/*.test.tsx`；`setupFiles` 由环境变量
   `TRIAGE_SETUP` 决定），三档实测：

   ```bash
   cd packages/ui-host
   pnpm exec vitest run --config vitest.triage.config.ts --reporter=json \
     --outputFile=/Users/glow/Base/Code/Freya/.scratch/uitest.json          # rc=1  files 43  Tests 283 failed | 119 passed (402)
   TRIAGE_SETUP=./triage-setup-a.ts pnpm exec vitest run --config … uitest-A.json   # rc=1  103 failed | 299 passed (402)
   TRIAGE_SETUP=./triage-setup-b.ts pnpm exec vitest run --config … uitest-B.json   # rc=1   11 failed | 391 passed (402)
   ```

   `triage-setup-a.ts` 只有 `window.localStorage` 的垫片（逐字取自
   `<Xiranite>/src/test/setup-i18n.ts` 里 `ensureLocalStorage()` 那一半）；
   `triage-setup-b.ts` = a + `initI18n("zh")` + `changeLanguage("zh")`（上游同一文件的后半）。

   三档的断言集合**完全同一**（402 条一一对应），且**没有任何一条从绿变红**（脚本核对：
   `regressions caused by the probes: 0`），所以 283 → 103 → 11 的差值可以直接当归因用。

3. 拆完就装回去，并且复跑 shipped 配置确认基线没动：

   ```bash
   cd /Users/glow/Base/Code/Freya/Xaihi && rm -f packages/{shared,logging,contract,cli-runtime}/node_modules \
     packages/ui-host/vitest.triage.config.ts packages/ui-host/triage-setup-{a,b}.ts
   find packages plugins -maxdepth 2 -name node_modules -type l          # rc=0，零行输出
   cd packages/ui-host && pnpm exec vitest run                            # rc=0  Test Files 38 passed (38) / Tests 300 passed (300)
   ```

顺带一条**与上一条台账不同**的新事实：这一轮只用「四个软链 + 现成的 `XIRANITE_ALIASES`」就把 43
个文件全部采集起来了（402 条断言、**0 条文件级采集错误**：脚本 `testResults.filter(f=>f.message)` ⇒ 0）。
`ui-tests-inventory.md` 里"还要再把别名表按键长排序"那一档**已经不需要了**——
排序与那条判据现在都在表本身（`packages/ui-host/build-aliases.mjs:140-144` 排长度递减，
`:227-243` 是盯前缀吞并的判据）。

## 总账

| 归因 | 断言数 | 判据 |
|---|---|---|
| `harness-missing:storage`（runner 里没有 `window.localStorage`） | **180** | 只补垫片就把红从 283 降到 103 |
| `harness-missing:i18n`（测试环境里没人 `initI18n`） | **92** | 再多补 `initI18n("zh")` 就把红从 103 降到 11 |
| `upstream-red`（搬运基线那棵工作树里**本来就红**） | **11** | 在 `<Xiranite>` 里跑同样八个文件：rc=1、`Tests 9 failed / 73 passed (82)`；另两个文件 rc=1、`Tests 2 failed / 13 passed (15)` |
| `xaihi-shape` / `unported-module` / `dep-missing` / `genuine-port-defect` / `flaky-or-env` | **0** | 见下面"空手而归的那四组" |

283 = 180 + 92 + 11；18 个文件本来就全绿，25 个文件有红。

## 逐文件表（红 25 个，按条数递减）

| 文件 | 断言 | 红 | storage | i18n | upstream-red |
|---|---|---|---|---|---|
| `src/nodes/recycleu/Component.test.tsx` | 18 | 18 | 15 | 3 | 0 |
| `src/nodes/trename/Component.test.tsx` | 16 | 16 | 4 | 11 | 1 |
| `src/nodes/classq/Component.test.tsx` | 15 | 15 | 14 | 1 | 0 |
| `src/nodes/marku/Component.test.tsx` | 14 | 14 | 14 | 0 | 0 |
| `src/nodes/mvz/Component.test.tsx` | 14 | 14 | 14 | 0 | 0 |
| `src/nodes/migratef/Component.test.tsx` | 14 | 14 | 13 | 0 | 1 |
| `src/nodes/sleept/Component.test.tsx` | 14 | 14 | 11 | 0 | 3 |
| `src/nodes/smartzip/Component.test.tsx` | 14 | 14 | 4 | 10 | 0 |
| `src/nodes/encodeb/Component.test.tsx` | 13 | 13 | 13 | 0 | 0 |
| `src/nodes/rawfilter/Component.test.tsx` | 13 | 13 | 12 | 0 | 1 |
| `src/nodes/classf/Component.test.tsx` | 13 | 13 | 5 | 6 | 2 |
| `src/nodes/cleanf/Component.test.tsx` | 13 | 13 | 2 | 11 | 0 |
| `src/nodes/enginev/Component.test.tsx` | 25 | 13 | 0 | 13 | 0 |
| `src/nodes/linku/Component.test.tsx` | 12 | 12 | 11 | 0 | 1 |
| `src/nodes/nameu/Component.test.tsx` | 12 | 12 | 11 | 1 | 0 |
| `src/nodes/crashu/Component.test.tsx` | 12 | 12 | 2 | 10 | 0 |
| `src/nodes/dissolvef/Component.test.tsx` | 12 | 12 | 2 | 10 | 0 |
| `src/nodes/formatv/Component.test.tsx` | 11 | 11 | 5 | 6 | 0 |
| `src/nodes/gifu/Component.test.tsx` | 10 | 10 | 10 | 0 | 0 |
| `src/nodes/timeu/Component.test.tsx` | 10 | 10 | 3 | 7 | 0 |
| `src/nodes/bitv/Component.test.tsx` | 8 | 8 | 8 | 0 | 0 |
| `src/nodes/shared/NodeConfigPopover.test.tsx` | 7 | 7 | 7 | 0 | 0 |
| `src/nodes/bandia/Component.test.tsx` | 11 | 2 | 0 | 1 | 1 |
| `src/nodes/dissolvef/Component.host.test.tsx` | 2 | 2 | 0 | 2 | 0 |
| `src/nodes/shared/RuleTreeEditor.test.tsx` | 4 | 1 | 0 | 0 | 1 |

"storage / i18n" 两列是**该条断言被哪一层解锁**：`red(基线) - red(探针A)` 归 storage，
`red(探针A) - red(探针B)` 归 i18n，`red(探针B)` 才是需要单独解释的残余。

## `harness-missing:storage` —— 180 条

**缺的是什么**：上游的 vitest 有一条 `setupFiles`，本仓没有。

- 上游：`<Xiranite>/vite.config.ts:369` ⇒ `setupFiles: [path.resolve(__dirname, "./src/test/setup-i18n.ts")]`
  （同一条 `test` 块 367-381 行：`environment: "happy-dom"`、`inline: ["zod", "@material/material-color-utilities"]`）。
- 本仓：`packages/ui-host/vitest.config.ts:26-62` **整块没有 `setupFiles` 这一项**。
- 上游那份 setup 文件也**从来没进过搬运清单**：`docs/port/xiranite-ui.json` 里 `test/setup-i18n.ts`
  这个键不存在（脚本读 `files` ⇒ `manifest=NONE`），`packages/ui-host/src/test/` 目录根本不存在
  （`ls packages/ui-host/src/` 无 `test`）。所以这不是"搬了没接"，是"搬运器的射程里没有 harness 文件"。

**症状**：两种栈顶，都指不到本仓代码（这一族 180 条的基线文本：`setItem` 173 条 + `clear` 7 条）。

- `(reading 'setItem')`：`zustand@5.0.14/esm/middleware.mjs:300` 的 persist 写盘，
  触发点例如 `src/nodes/sleept/Component.test.tsx:39` 的 `setState`。
- `(reading 'clear')`：测试自己的 `beforeEach`，`src/nodes/shared/NodeConfigPopover.test.tsx:22`
  就是 `window.localStorage.clear()`。这条同时说明**不是**"标识符没定义"（那会报 `localStorage is not defined`），
  而是 `window.localStorage` 这个属性在 vitest 交给测试的 window 上是 `undefined`。
- 每次跑都伴随一行 `(node:…) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`。

上游 setup 文件的头注释把同一条判据写在了 happy-dom 20.10.6 + Vitest 4.1.10 上；本仓装的是
happy-dom 20.14.5 + vitest 4.1.11（`node -e require(...version)` 现读），**同一条缺口照样复现**，
所以那不是某个版本的偶发，而是"runner 不给 Storage 这一件东西"。

**最省事的下一步**：把 `<Xiranite>/src/test/setup-i18n.ts` 的 `ensureLocalStorage()` 那一半
搬成 `packages/ui-host/src/test/setup-storage.ts` 并进 `vitest.config.ts` 的 `setupFiles`，
**同时**把它加进 `docs/port/xiranite-ui.json` 的清单（否则下一个搬运批次仍然看不见它）。
仓里**没有**现成的垫片可以复用：`packages/ui-host/tests/**` 里那两份替身是
`vi.mock('../src/client/document-frame.tsx')`（`tests/surface-caps.spec.tsx:12`）和
`vi.spyOn(console, 'error')`（`tests/surface.spec.tsx:86`），跟 Storage 无关；
全仓搜 `Object.defineProperty(window, "localStorage"` 只命中那两个一次性探针文件
（拆完之后再搜 ⇒ 零命中，脚本核对过）。
**不要**为此加依赖。Node 那条 `--localstorage-file` 实验开关**没有试过**能不能替掉垫片
（见下面"没验证"第 9 条）；上游给的理由写在它自己的文件头注释里
（"happy-dom 的 `Window` 有 Storage，Vitest 拷到测试 `window` 上的全局里没有它"，
并且"A real WebView always has Storage, so this is an environment gap rather than product behaviour"），
它选的就是补一件浏览器保证有的东西。
收益不止这 180 条：`src/nodes/` 之外还有 103 个搬运测试文件，其中 **15 个**裸用 `localStorage`
（`src/plugins/pluginRegistry.test.ts:38` 等），同一条缺口挡着。

## `harness-missing:i18n` —— 92 条

**缺的是同一件上游文件的另一半**：`await i18nModule.initI18n("zh")` + `changeLanguage("zh")`。
本仓的 `src/i18n` 是齐的（`packages/ui-host/src/i18n/index.ts` 有 `initI18n`，第 78 行；
`src/i18n/locales/{zh,en}.json` 都在），只是**测试环境里没有任何人调用它**，
于是 `useNodeI18n`（`src/nodes/shared/useNodeI18n.ts:30-48`）的 `t()` 拿不到资源，
按钮名退化成键或英文兜底，`getByRole("button", { name: "生成计划" })` 一族全红。

红字拆开看（**按探针 A 之后剩下的错误文本**分族，不是按基线文本——基线里这一族大多被
storage 那一层的 `TypeError` 抢先遮住）：53 条 `Unable to find an accessible element with the role …`、
38 条 `Unable to find a label / an element with the text …`、1 条 `getByRole` 直接抛出的变体。
其中 **76 条是"两层都要"的**：基线打印的是 `(reading 'setItem')`，补了 Storage 才露出真正的
标签缺失错误——所以 92 这个数字是"再补 i18n 才绿"的净增量，不是"这 92 条的错误文本都是标签"。
上一轮台账怀疑的方向（"更像 i18n 没在测试环境里初始化"）实测成立，
而它当时按基线文本记的 `46 + 46` 那一刀**不能当归因用**。
"标签字符串在仓里存在"复核过：`src/i18n/locales/zh.json:1697`
的 `"scanPaths": "cleanf scan paths"`、`:1750` 的 `"trigger": "配置管理"` 都是**逐字命中**，
`en.json` 同两处也在。

**最省事的下一步**：与 storage 同一刀——同一个 setup 文件、同一次接线，不必单独排期。
判据要跟着改：`initI18n("zh")` 之后这批断言读的是 **zh** 词表，
所以"默认语言该是什么"这件事由测试环境决定，不许在断言里再猜一次。

## `upstream-red` —— 11 条（**不是这次搬运买的**）

探针 B 之后剩下的 11 条，逐条与搬运基线对照过，**上游自己那棵工作树里同样红**：

```bash
cd /Users/glow/Base/Code/Freya/Xiranite
npx vitest run src/nodes/shared/RuleTreeEditor.test.tsx src/nodes/bandia/Component.test.tsx   # rc=1  Tests 2 failed | 13 passed (15)
npx vitest run src/nodes/{classf,sleept,linku,migratef,rawfilter,trename}/Component.test.tsx   # rc=1  Tests 9 failed | 73 passed (82)
```

上游那两次跑吃的是它自己的 `setupFiles`（`vite.config.ts:367-381`，Storage 垫片 + `initI18n("zh")` 都在），
**正好与本仓探针 B 同档**。失败标题与本仓残余逐条同名
（`× uses shared configuration management controls`、`× renders the collapsed surface with Sleept-specific UI`、
`× previews the planned target hierarchy in the file tree tab`、`× runs countdown through host.actions.run…`、
`× saves, restores, clears, and opens default config controls`、`× uses the shared configuration-management workflow`、
`× renders semantic theme classes and mature query-builder controls`、classf 的 `× runs plan…` 等），
错误文本也一样（`AssertionError: expected …(3) to have a length of 4 but got 3`）。
上游那两次跑只写进它自己的 `node_modules`（`git -C Xiranite status --porcelain | grep -c node_modules` ⇒ 0）。

三条族，各自的根：

- **5 条 `配置管理`**（bandia、linku、migratef、rawfilter、trename）：配置中心按钮的名字来自
  `NodeConfigPopover.tsx:258` 的 `props.t("config.trigger", "Configuration center")`，
  而 `t` 是节点前缀的（`useNodeI18n.ts:36-38`：`config.*` 先取 `configCenter.*` 当兜底）⇒
  这五个节点在 `zh.json` 里**没有** `module.<节点>.config.trigger`，于是渲染成 `配置中心`（`zh.json:1226`），
  测试要的是 `配置管理`（`zh.json:1750` 那一条属于别的节点）。实测 DOM 里的可访问名就是
  `配置中心`（一次性跑单文件 + 剥 ANSI 读回）。有 `config.trigger = "配置管理"` 的只有
  classq / linedup / recycleu / classf / nameu / bitv / simiu 七个节点——**这七个的同类断言是绿的**。
  两边 `zh.json` 的 sha256 与 `docs/port/xiranite-ui.json` 记录逐字节相同（`a1ae1d3bea07`），
  所以这是上游词表与测试期望自己没对齐，不是品牌改名造成的。
- **sleept 的 3 条**：`Component.test.tsx:53` 要 `/倒计时 \/ 休眠 \/ 演练/`，而
  `src/nodes/sleept/constants.ts:53` 写的是 `{ value: "sleep", label: "睡眠" }`、
  `Component.tsx:691` 取的就是这条 label ⇒ 渲染 `倒计时 / 睡眠 / 演练`；
  `:107` 要 `targetDatetime: undefined` 而 `plugins/sleept/src/interaction.ts:268`
  （上游 `packages/nodes/sleept/src/interaction.ts:222` 同一行、同一句 `String(values.targetDatetime ?? "")`）
  给的是 `""`；`:212-213` 要的 `sleept defaults` 这个名字两边词表里都不存在。
- **classf 2 条 + RuleTreeEditor 1 条**：`Component.test.tsx:94-110` 期望 13 个键的 `input`，
  而 `Component.tsx:639` 的 `blacklistKeywords: data.blacklistKeywords ?? DEFAULT_CLASSF_BLACKLIST_KEYWORDS`
  一定带出那五个社团标签（`plugins/classf/src/blacklist.ts` 里那条数组与上游
  `packages/nodes/classf/dist/blacklist.js` 的**字面量相同**，现读两边）；
  `RuleTreeEditor.test.tsx:44` 数 4 个 `[data-slot="select-trigger"]`，
  而它的 `tree` 夹具（同文件 11-21 行）只有 1 组 + 1 条规则 ⇒ 两边都渲染 3 个。

**最省事的下一步：先不动。** 这 11 条归上游（或由使用者裁"我们的口径跟不跟"），
不属于 workspace 那一步的成本。真要处理，**逐条**只有两种正当落法：
要么上游把词表/期望补齐（提给上游），要么在本仓**写下**偏离并连着改断言——
后者要先有 ADR，因为它会把"与上游可 diff"这条（ADR-0007 的 `@/…` 与 `@xiranite/*` 保留理由）打断一半。
把断言改绿不是选项。

## 空手而归的那四组（计数为 0，判据在这里）

- **`xaihi-shape` 0 条**：43 个文件里**没有一个** import `entry.ts`
  （脚本扫 43 个文件的源码，`test files importing an entry.ts: 0`），
  而 `@/…` 别名在本腿是接好的（`vitest.config.ts:32`）。CSS 类名前缀那把尺也没被这些断言碰到——
  残余 11 条里没有一条是"类名/品牌名对不上"。
- **`unported-module` / `dep-missing` 0 条**：283 条失败文本里
  `Failed to resolve` / `Cannot find module` / `ERR_MODULE_NOT_FOUND` **零命中**（脚本计数 0）。
  但**潜伏账是真的**，别读成"没有依赖缺口"：`packages/shared` 声明的 `csv-parse`、`json-rules-engine`，
  `packages/logging` 声明的 `@opentui/core`、`@opentui/react`、`rotating-file-stream`，
  `packages/cli-runtime` 声明的 `@clack/prompts`、`boxen`、`chalk`、`citty`、`sharp`、`sixel`、
  `lru-cache`、`p-queue` 全都不在 `packages/ui-host/node_modules`（现读：`shared deps=3 resolvable=1`、
  `logging deps=6 resolvable=2`、`cli-runtime deps=16 resolvable=2`）。
  这 43 个文件的 import 图没走到 `efu.ts` / `rules-engine.ts` / `logging/node.ts`，所以一条没触发。
  ⇒ 需要**新依赖**的是那一层（`unported-module`/`dep-missing`），不是这 283 条里的任何一组。
- **`genuine-port-defect` 0 条**：搬运产物与上游逐字节比对（对 `docs/port/xiranite-ui.json` 全量 772 条里
  两边都存在的 768 个文件算 sha256）⇒ **739 相同、29 漂移、4 个本仓没有**。
  漂移的 29 个是 27 个 `nodes/*/entry.ts`（ADR-0007 决定 4 那一刀）+
  `components/modules/packageModules.generated.ts`（生成物）+ `components/views/settings/settingsNavigation.ts`；
  这 43 个测试一条都没引到它们。
- **`flaky-or-env` 0 条**：探针 B 之后又把四个残余文件**同档单独重跑过两次**
  （setup B + `src/nodes/bandia/Component.test.tsx` ⇒ `1 failed | 10 passed (11)`；
  setup B + classf / sleept / RuleTreeEditor 三文件 ⇒ `Failed Tests 6`），
  失败标题与整档跑逐条一致 ⇒ 这 11 条是确定性的，不是时序/locale/机器造成的。归到 0 的正面理由是"没有一条失败需要时序或环境来解释"
  （storage 与 i18n 两层解释掉 272 条，剩下 11 条在上游同样红）。
  **但 283 整批没有做重复跑稳定性判定**（每档一次），真实的 React 大版本差异见下面"没验证"第 4 条。

## 本轮**没有**验证的东西

1. **272 条归因是"充分原因"，不是"唯一原因"**。探针 A/B 只证明"补上这一件它就绿"，
   没证明某条断言后面还压着第二个错（`beforeEach` 一抛，同文件后面的期望根本不会执行）。
   只有那 11 条做过第二层拆解（跑上游）。
2. 四档软链是否**都**必要：本轮一次性给 `shared/logging/contract/cli-runtime` 四个都链上，
   没做"只链 `shared` 会怎样"的减法。
3. 没有验证 `@hibernalglow/xaihi-*` 那六条包名边与 `@xiranite/*` 是否在这 43 个文件里各有几条真被走到
   （本轮靠 `XIRANITE_ALIASES` 一张表覆盖两族，采集 0 错，但没统计命中数）。
4. **React 大版本这一条只做了失败探针**：把测试腿换成 `react-19`/`react-dom-19`
   （本仓 devDependencies 已有的别名包，**不是新依赖**）后八个残余文件 rc=1、
   `95 failed | 2 passed (97)`，栈是 `Objects are not valid as a React child` ——
   两套 React 混在一张图里了（`react-dom@18.3.1` 仍在栈里）。
   所以"上游跑 React 19.2.4、本仓测试腿跑 18.3.1 会不会改判这 11 条"**未验证**，
   只测出了"整腿换 19 不是拔插即用"。上游 setup 文件头注释里的 Vitest/happy-dom 版本号也没逐条复核。
5. `pnpm check:pins`、`check:installable`、`check:skills`、`check:vocab`、`check:brand` **没跑**：
   本轮没动 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、技能目录，也没动门禁。
   跑过的只有：三档 `vitest run --config vitest.triage.config.ts`（rc=1×3）、
   一次单腿 `vitest run src/nodes/bandia/Component.test.tsx`（rc=1）、
   一次 `vitest run src/nodes/{classf,sleept,shared/RuleTreeEditor}`（rc=1）、
   清理后的 `pnpm exec vitest run`（rc=0，38 文件 / 300 断言），
   以及上游仓两次 `npx vitest run`（rc=1、rc=1）。
6. 全仓 `pnpm test` 没跑（AGENTS.md：并行 lane 在飞时结果不可归因，本轮任务也禁止）。
7. `src/nodes/` 之外那 103 个搬运测试文件的红没量（只数了"其中 15 个裸用 `localStorage`"这一条事实）。
8. 上游那两次跑的**完整失败清单**只截取了标题与错误首行；
   没核对上游跑里的 `Test Files 6 failed (6)` 是否与本仓探针 B 的文件集合一一对应之外的差异
   （对应关系是按断言标题建立的，不是按 sha）。
9. **`--localstorage-file` 这条替代路径没试**：给 vitest 的 Node 进程带上这个开关能不能让
   `window.localStorage` 真的存在、从而替掉垫片，未测量。本轮只按上游那份 setup 的做法测了垫片。
10. **"i18n 应该初始化成哪一种语言"没有裁**。探针 B 吃的是上游的 `initI18n("zh")`；
    如果本仓的口径是"测试环境跟着 `detectInitialLanguage()` 走"（`src/i18n/index.ts:40-47`：
    `localStorage` → `navigator.language` → `"en"`），那这 92 条里读 **zh** 词表的那一部分
    换语言就会换症状——本轮**没有**跑 `en` 档对照（`en.json` 与 `zh.json` 里
    `scanPaths`/`trigger` 两处恰好同值，见 `zh.json:1697` 与 `en.json:1697`，但这不是全表都同）。

## 复核与修法（2026-10-07，另一轮亲跑）

上面那三档探针的**分类**站得住，但两处归因要在纸上改过来，都是我这一轮实测的数。

### 1. `harness-missing:storage` 的原因不是"runner 不给 localStorage"

是这台机器上的 **Node 把那个位置占了**。Node 26.10 自带实验性 `localStorage` 全局，
没给 `--localstorage-file` 时它是一个"读一次告警一次、值恒为 undefined"的访问器：

```
$ node -e "console.log('default:', typeof globalThis.localStorage)"
default: undefined
(node:9571) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
$ node --version
v26.10.0
```

happy-dom 20.14.5 自己是有 `Storage` 的（`node_modules/happy-dom/lib/storage/Storage.d.ts` 里 `class Storage`），
但全局位上先有了那个洞，环境里就装不上——**连 `window.localStorage` 都是 undefined**，
所以不是"bare 全局走 Node、`window.` 走 happy-dom"那种分工问题。

把它钉成断言（`packages/ui-host/tests/localstorage-env.spec.ts`，三条：
`window.localStorage` 可写、`globalThis.localStorage === window.localStorage`、
zustand persist 那种 `createJSONStorage(() => localStorage)` 的用法不抛）。同一条命令的 A/B：

```
$ ../../node_modules/.bin/vitest run tests/localstorage-env.spec.ts
 Test Files  1 failed (1)          Tests  3 failed (3)          DEFAULT_RC=1
AssertionError: expected undefined to be defined            （两条）
AssertionError: expected [Function] to not throw … 'TypeError: Cannot read properties of …'
$ NODE_OPTIONS=--no-experimental-webstorage ../../node_modules/.bin/vitest run tests/localstorage-env.spec.ts
 Test Files  1 passed (1)          Tests  3 passed (3)          FLAG_RC=0
```

### 2. 那个 flag 落不进配置，于是改成装回同一个实现

按上面第 9 条自留项先试了配置级的路：`poolOptions.threads.execArgv: ['--no-experimental-webstorage']`
——**照红，那 3 条不动**。Worker 的 `execArgv` 只收受限的一小撮选项，进程级开关不在里面
（vitest 自己的注释也写着"some options may crash worker"）。`--localstorage-file` 那条路更不合适：
它是"把 localStorage 持久化到磁盘某个文件"，测试宿主真去写盘是把洞换成另一种副作用。
`NODE_OPTIONS` 有效但只能靠人记住，写进包脚本要动 `packages/ui-host/package.json`（此刻在未提交区）。

落点因此是 `packages/ui-host/src/test/setup-webstorage.ts`：装的就是 happy-dom 那只 `Storage`，
不是自造的影子对象；`XAIHI_UI_STORAGE_SHIM=0` 跑一次必须红，就是它的阳性对照。
接在 `vitest.config.ts` 的 `test.setupFiles` 上（整值覆盖不是深合并，所以
`vitest.nodeui.config.ts` 里那份把这条一起写上，只追加 i18n 那条）。

接线后门禁那一档：

```
$ ../../node_modules/.bin/vitest run
 Test Files  39 passed (39)        Tests  303 passed (303)      BASE_RC=0     # 之前是 38 / 300
$ pnpm --filter @hibernalglow/xaihi-ui-host typecheck
TSC_GATE_RC=0                                                                   # 新文件一条错都没添
```

### 3. 干净工作树里那 43 个节点测试的真实读数：12 文件过 / 52 断言

探针那几档是**先把四个包 `node_modules` 软链到 `packages/ui-host/node_modules`** 才跑得起来的，
所以上面"402 断言"那一档不是本仓当前可复现的数。把链撤了（现测 `find … -type l` = 0），
用 `vitest.nodeui.config.ts` 现跑：

```
$ ../../node_modules/.bin/vitest run -c vitest.nodeui.config.ts --reporter=dot
 Test Files  31 failed | 12 passed (43)        Tests  52 passed (52)      NODEUI_RC=1
$ rg -o 'Failed to resolve import "[^"]+" from "[^"]+"' … | sort | uniq -c | sort -rn
   3 Failed to resolve import "zod" from "../shared/src/index.ts"
   1 Failed to resolve import "zod" from "../shared/src/rules.ts"
   1 Failed to resolve import "zod" from "../logging/src/schema.ts"
```

⇒ **挡在最前面的不是 storage 也不是 i18n，是任务 #25 那一层**：`@xiranite/shared` /
`@xiranite/contract` 这些别名指到隔壁包的 `src/*.ts`，而 `packages/{shared,logging,…}`
自己那份 `node_modules` 还没装（`package.json` 全在未提交区），于是裸名 `zod` 从那里解析不到。
12 个文件 / 52 条正是 `vitest.config.ts` 里那批"实测能跑"的名单——两边对上，说明
这层没有别的东西被 storage 掩住。

那 283 这个数要这样读：**它是"把 #25 解开之后"才会出现的读数**，
解开之后按这一轮的修法应当塌掉 storage 那 180 条，i18n 的起手（本轮才搬进来的
`src/test/setup-i18n.ts`，逐字取自基线 `src/test/setup-i18n.ts`，上游挂在 `vite.config.ts:356`）
再吃掉 92 条，剩下 **11 条是上游自己就红**的那一档——它们要的是逐条申报或修上游，
不该混进"搬运坏了"，也不许用 skip 变绿。

### 4. 本轮改了什么（就四件事，都在界面这条 lane 上）

- `packages/ui-host/src/test/setup-webstorage.ts`（新）：把 happy-dom 的 `Storage` 装回全局位。
- `packages/ui-host/src/test/setup-i18n.ts`（新）：上游那 4 行起手，逐字搬。
- `packages/ui-host/vitest.config.ts`：`setupFiles` 接第一条，并写明为什么不是 flag。
- `packages/ui-host/vitest.nodeui.config.ts` + `tests/localstorage-env.spec.ts`（新）：
  一条能现跑的红数，和钉住运行时形状的那三条断言。

没动的：`packages/*/package.json`、`pnpm-lock.yaml`、`plugins/**`、别的 lane 正在改的
`src/components/views/settings/**`。
