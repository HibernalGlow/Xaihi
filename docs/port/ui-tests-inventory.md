# UI 搬运测试台账（`packages/ui-host/src/nodes/**` 的 43 个上游测试文件）

日期：2026-10-07。作用域：`packages/ui-host`。搬运出处：`docs/port/xiranite-ui.json`
（772 条 manifest 记录，其中 `nodes/` 底下 43 个 `*.test.ts(x)`，与磁盘上找到的 43 个逐一对上）。

这份台账回答两个问题：

1. 这 43 个文件里，**哪些真的在执行断言**，怎么把它们接进 `vitest.config.ts` 的 `include`。
2. 剩下 31 个**为什么不跑**——每个文件的真实第一条错误，以及按固定分类表给出的判定。

---

## (a) 接入前后：采集数字与 rc

测量方法：临时配置 `packages/ui-host/vitest.probe.tmp.config.ts`（`include` 只写
`src/nodes/**/*.test.ts` 与 `src/nodes/**/*.test.tsx`，其余设置与正式配置一致），
跑完即删；正式改动只有 `packages/ui-host/vitest.config.ts` 的 `include` 与它的注释。

| 命令（工作目录见括号） | 改之前 | 改之后 | rc |
|---|---|---|---|
| `pnpm exec vitest run`（`packages/ui-host`） | `Test Files 26 passed (26)` / `Tests 248 passed (248)` | `Test Files 38 passed (38)` / `Tests 300 passed (300)` | 0 → 0 |
| `pnpm --filter @hibernalglow/xaihi-ui test:unit`（仓库根） | 未单跑（同一入口） | `Test Files 38 passed (38)` / `Tests 300 passed (300)` | 0 |
| `pnpm run typecheck`（仓库根，= `pnpm -r run typecheck`） | — | `packages/node-sdk typecheck: tests/help.spec.ts(33,14): error TS2532: Object is possibly 'undefined'.` 之后 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` | 1 |
| `pnpm --filter @hibernalglow/xaihi-ui typecheck`（仓库根） | — | `tsconfig.json … own=1 ported=991 别的包=0` / `tsconfig.ported.json … own=0 ported=219 别的包=14`；`own` 那一条是 `src/client/workspace.tsx(262,19): error TS2322` | 1 |

**采集数正好 +12 文件 / +52 断言**：26 + 12 = 38，248 + 52 = 300。

两条 typecheck 的红**都不是这次改动引入的**，判据两条：
`vitest.config.ts` 不在 `packages/ui-host/tsconfig.json` 的 `include`（那一项只有
`["src/client", "tests"]`）也不在 `tsconfig.ported.json` 的源码集里；
仓库根的 `pnpm -r run typecheck` 在 `packages/node-sdk` 就停了，`ui-host` 那条腿根本没轮到。
`src/client/**` 与 `packages/node-sdk/tests/**` 都在并行 lane 手里，本任务不许碰，也确实没碰。

### 12 个被接进来的文件（断言数来自 JSON reporter 实测）

| 文件 | 断言数 |
|---|---|
| `src/nodes/shared/useNodeSurface.test.ts` | 16 |
| `src/nodes/marku/workflow-state.test.ts` | 14 |
| `src/nodes/shared/useLocalFileDrop.test.tsx` | 5 |
| `src/nodes/marku/workflow-result-projection.test.ts` | 3 |
| `src/nodes/shared/LocalImagePreview.test.tsx` | 3 |
| `src/nodes/shared/LocalVideoPreview.test.tsx` | 3 |
| `src/nodes/findz/workspace-layout.test.ts` | 2 |
| `src/nodes/shared/LocalVideoPreviewDialog.test.tsx` | 2 |
| `src/nodes/logx/browser-boundary.test.ts` | 1 |
| `src/nodes/shared/LocalAudioPreviewDialog.test.tsx` | 1 |
| `src/nodes/shared/LocalImagePreviewDialog.test.tsx` | 1 |
| `src/nodes/shared/externalNodeGateway.test.ts` | 1 |
| 合计 | **52** |

### 阳性对照：证明这 12 个不是"采集到 0 条也算绿"

临时把 `src/nodes/shared/useNodeSurface.ts:15` 的阈值 `size.width >= 1040` 改成 `1041`，
单跑该文件：

```text
subtraction rc=1
AssertionError: expected 'expanded' to be 'workspace' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
```

还原后 `sha256` 与改动前逐字节相同（`aa0154317a41cbe69cf6990fe95686ee92ddd5ba0cb84f6a147c7246ba66630c`），
全量重跑回到 `Test Files 38 passed (38)` / `Tests 300 passed (300)`，rc=0。
该文件其余 11 个没有逐个做减法——`52` 这个总数来自 JSON reporter 的 `assertionResults` 计数，
其中 16 + 14 + 5 三个文件占了 35 条。

---

## (b) 31 个失败文件：真实第一条错误与分类

分类口径（任务给定的固定表）：
`dep-missing` / `unported-module` / `needs-browser-runner` / `port-defect` / `assertion-vs-xaihi-shape`。

31 个文件**全部**是文件级采集错误：`Tests 52 passed (52)`，也就是这 31 个里一条断言都没执行。
下表的"第一条错误"是 `vitest run --reporter=json` 里 `testResults[].message` 的第一行，原文照抄。

`packages/shared/src/index.ts:1:18` 与 `packages/logging/src/schema.ts:1:18` 的那一行代码都是
`import { z } from "zod";`（vite 代码帧给的行列号一致）。

| # | 文件（`packages/ui-host/` 相对路径） | 第一条错误（原文） | 分类 |
|---|---|---|---|
| 1 | `src/nodes/bandia/Component.test.tsx` | `Failed to resolve import "zod" from "../shared/src/index.ts". Does the file exist?` | `port-defect` |
| 2 | `src/nodes/bitv/Component.test.tsx` | 同上 | `port-defect` |
| 3 | `src/nodes/classf/Component.test.tsx` | 同上 | `port-defect` |
| 4 | `src/nodes/classq/Component.test.tsx` | 同上 | `port-defect` |
| 5 | `src/nodes/cleanf/Component.test.tsx` | 同上 | `port-defect` |
| 6 | `src/nodes/crashu/Component.test.tsx` | 同上 | `port-defect` |
| 7 | `src/nodes/dissolvef/Component.host.test.tsx` | 同上 | `port-defect` |
| 8 | `src/nodes/dissolvef/Component.test.tsx` | 同上 | `port-defect` |
| 9 | `src/nodes/encodeb/Component.test.tsx` | 同上 | `port-defect` |
| 10 | `src/nodes/enginev/Component.test.tsx` | 同上 | `port-defect` |
| 11 | `src/nodes/formatv/Component.test.tsx` | 同上 | `port-defect` |
| 12 | `src/nodes/gifu/Component.test.tsx` | 同上 | `port-defect` |
| 13 | `src/nodes/linku/Component.test.tsx` | 同上 | `port-defect` |
| 14 | `src/nodes/linedup/Component.host.test.tsx` | 同上 | `port-defect` |
| 15 | `src/nodes/linedup/Component.test.tsx` | 同上 | `port-defect` |
| 16 | `src/nodes/logx/Component.test.tsx` | `Failed to resolve import "zod" from "../logging/src/schema.ts". Does the file exist?` | `port-defect` |
| 17 | `src/nodes/marku/Component.test.tsx` | `Failed to resolve import "zod" from "../shared/src/index.ts". Does the file exist?` | `port-defect` |
| 18 | `src/nodes/migratef/Component.test.tsx` | 同上 | `port-defect` |
| 19 | `src/nodes/mvz/Component.test.tsx` | 同上 | `port-defect` |
| 20 | `src/nodes/nameu/Component.test.tsx` | 同上 | `port-defect` |
| 21 | `src/nodes/rawfilter/Component.test.tsx` | 同上 | `port-defect` |
| 22 | `src/nodes/recycleu/Component.test.tsx` | 同上 | `port-defect` |
| 23 | `src/nodes/repacku/Component.test.tsx` | 同上 | `port-defect` |
| 24 | `src/nodes/samea/Component.test.tsx` | 同上 | `port-defect` |
| 25 | `src/nodes/shared/api.test.ts` | 同上 | `port-defect` |
| 26 | `src/nodes/sleept/Component.test.tsx` | 同上 | `port-defect` |
| 27 | `src/nodes/smartzip/Component.test.tsx` | 同上 | `port-defect` |
| 28 | `src/nodes/timeu/Component.test.tsx` | 同上 | `port-defect` |
| 29 | `src/nodes/trename/Component.test.tsx` | 同上 | `port-defect` |
| 30 | `src/nodes/shared/NodeConfigPopover.test.tsx` | `[vitest] There was an error when mocking a module. …`，其 `Caused by:` 是 `Failed to resolve import "zod" from "../shared/src/index.ts". Does the file exist?` | `port-defect` |
| 31 | `src/nodes/shared/RuleTreeEditor.test.tsx` | `Failed to resolve import "@xiranite/shared/rules" from "src/nodes/shared/RuleTreeEditor.test.tsx". Does the file exist?` | `port-defect` |

分类合计：

| 分类 | 文件数 | 说明 |
|---|---|---|
| `port-defect` — 非 workspace 包的裸名依赖在 vitest 这条腿上解析不到 | **30** | 第 1–29 行加第 30 行（第 16 行的 importer 是 `logging`，其余是 `shared`；第 30 行的 `Caused by` 落回同一个 `zod`） |
| `port-defect` — 别名表前缀吞并 | **1** | 第 31 行 |
| `dep-missing` | **0** | 见下方"为什么不是 `dep-missing`" |
| `unported-module` | **0** | 43 个文件里没有任何一条 `@/…` 或 `@xiranite/…` 指向本仓不存在的文件（静态核对见下） |
| `needs-browser-runner` | **0** | 见"搬运器 SKIP 名单核对" |
| `assertion-vs-xaihi-shape` | **0（这一轮不可达）** | 墙后确实有这类失败，见 (c) 的实测数字 |

### 为什么是 `port-defect` 而不是 `dep-missing`

`dep-missing` 的定义是"引了 `packages/ui-host/package.json` 里没声明的三方包"。这里引不名的包是 `zod`，
三条核对都做过了：

```text
packages/ui-host/package.json:154:    "zod": "4.3.6",
packages/ui-host/node_modules | grep '^zod$'  ->  zod
pnpm-lock.yaml  ->  9584:  zod@4.3.6:
```

声明有、装也有、锁文件里也有——**缺的是解析根**。`pnpm-workspace.yaml` 顶部把
`packages/shared`、`packages/logging`（连同 `api`/`cli`/`cli-runtime`/`contract`/`tui`）用负向条目
排除在 workspace 之外，于是那两个包**没有自己的 `node_modules`**：

```text
ls -d packages/shared/node_modules packages/logging/node_modules
ls: packages/shared/node_modules: No such file or directory
ls: packages/logging/node_modules: No such file or directory
```

别名表（`packages/ui-host/build-aliases.mjs`）把 `@xiranite/shared` 指到 `packages/shared/src/index.ts`
源码本身，Vite 按 Node 逐级上溯去解析那个文件里的裸名 `zod`，路径是
`packages/shared/node_modules` → `packages/node_modules` → 根 `node_modules`，三处都没有 `zod`
（根 `node_modules/zod` 实测不存在，pnpm 不 hoist）。

**这个缺口本仓已经认过一次账，并且在 rspack 那条腿上补掉了**——
`packages/ui-host/rspack.document.mjs:78-92` 写得很清楚：

> `@xiranite/{shared,logging,…}` 的类型检查与构建能指到源码（靠 tsconfig paths / 别名表），
> 但那些包**不在 pnpm workspace 里**……所以从 `packages/shared/src/**` 里发出去的裸名（实测 `zod`）
> 按 Node 的逐级上溯找不到。这里补两条机械规则，而不是去给那些包手装依赖：
> `modules: [path.join(here, 'node_modules'), 'node_modules']`、
> `extensionAlias: { '.js': ['.ts', '.js'], '.tsx': ['.tsx'] }`

也就是说：**浏览器产物腿有这两条规则，vitest 这条腿没有**。这属于 Xaihi 侧的接线不完整，
不是上游带来的形状，也不是"缺依赖"。

### 第 31 行：别名表前缀吞并（独立缺陷，已复现）

`build-aliases.mjs` 的 `PORTED_TARGETS` 里 `shared` 排在 `shared/rules` 之前，
`@xiranite/shared` 因此吃掉了 `@xiranite/shared/rules`（Vite 的字符串 alias 是前缀匹配，先到先得），
替换结果是 `packages/shared/src/index.ts` + `rules` 这种不存在的路径。
用临时配置把 `@xiranite/shared/rules` 放到表前面之后，该文件的错误**立刻换成 `zod` 那一条**，
缺陷由此确认（不是猜的）。整张表 145 个键，被前缀吞并的有 6 对：

```text
@xiranite/shared  ->  hides  @xiranite/shared/rules
@xiranite/shared  ->  hides  @xiranite/shared/swimlane
@hibernalglow/xaihi-shared  ->  hides  @hibernalglow/xaihi-shared/rules
@hibernalglow/xaihi-shared  ->  hides  @hibernalglow/xaihi-shared/swimlane
@xiranite/cli-runtime  ->  hides  @xiranite/cli-runtime/terminal
@hibernalglow/xaihi-cli-runtime  ->  hides  @hibernalglow/xaihi-cli-runtime/terminal
```

`@xiranite/shared/swimlane` 那一对在 (c) 里量到了后果：补掉裸名解析之后，21 个文件卡在
`Failed to resolve import "@xiranite/shared/swimlane" from "src/components/workspace/swimlane/model.ts"`。

### 搬运器 SKIP 名单核对（`needs-browser-runner` 为 0 的依据）

`scripts/port-ui.mjs:155` 的跳过判据是 `const SKIP = /(\.browser\.test\.tsx?|\.e2e\.test\.tsx?|__screenshots__)/`。
拿它去筛 manifest 的 772 条记录：**0 条命中**，`nodes/` 底下 43 个测试与磁盘上的 43 个一一对上，
所以没有出现"本该被跳过却搬进来了"的文件。
唯一名字里带 browser 的是 `src/nodes/logx/browser-boundary.test.ts`——`browser-boundary` 不含
`.browser.test.` 子串，不在 SKIP 的射程里，而且它已经在这轮接进来的 12 个里（1 条断言，实测跑过）。

### `dep-missing` 的**潜伏**账（本轮没触发，但下一步会）

`packages/shared/package.json` 的 `dependencies` 声明了 `csv-parse`、`json-rules-engine`、`zod`；
`packages/logging/package.json` 声明了 `@opentui/core`、`@opentui/react`、`rotating-file-stream`、`zod`。
这些包**一个都不在锁文件里，也都不在 `packages/ui-host/node_modules` 里**：

```text
grep -n "csv-parse" pnpm-lock.yaml | wc -l       ->  0
grep -n "json-rules-engine" pnpm-lock.yaml | wc -l  ->  0
ls packages/ui-host/node_modules | grep '^csv-parse$'  ->  (无输出)
```

按 `dep-missing` 的定义（"没在 `packages/ui-host/package.json` 里声明"）它们确实符合；
但当前 43 个文件的 import 图**没有一条走到 `efu.ts` / `rules-engine.ts`**，所以本轮一条 `dep-missing` 都没有。
补裸名解析时如果顺手把整个 `packages/shared` barrel 拉进图，就会立刻撞上它们——
按 AGENTS.md 的约束，本任务**没有加任何依赖，也没有跑 `pnpm install`**。

---

## (c) 这一轮补起来能解锁什么

用三个一次性临时配置分层实测（跑完即删），把"补掉一层缺陷"的代价与收益量出来：

| 探针配置补了什么 | 采集到断言的文件 | 采集到的断言总数 | 通过 | 失败 | 全绿的文件 |
|---|---|---|---|---|---|
| 什么都不补（今天的真实状态） | 12 / 43 | 52 | 52 | 0 | 12 |
| 只给非 workspace 包补解析根 + `.js`→`.ts` | 17 / 43 | 89 | 82 | 7 | 16 |
| 再加上别名表长键优先 | **43 / 43** | **402** | 119 | 283 | 18 |

（"全绿的文件"里断言数分别是 52 / 82 / 95；第三行的 119 条通过里有 24 条落在**部分绿**的文件里。
三档都**没有 skip/todo 状态**的断言，也就是这批搬进来的文件里没藏 `it.skip`。）

**单件事解锁最多的一组：把 rspack 腿已有的 `modules` + `extensionAlias` 两条机械规则同样给 vitest 腿**
（`port-defect`，30 个文件）。这一步把"0 条断言执行"变成"有断言执行"：全绿的文件多 4 个、
通过的断言多 30 条（另有 1 个文件开始采集、但 7 条断言红），
新增全绿者是 `linedup/Component.test.tsx`、`linedup/Component.host.test.tsx`、`logx/Component.test.tsx`、
`shared/api.test.ts`。
**第二件事：别名表按键长排序（或给子路径加 `$` 整名匹配）**，再多解锁 2 个文件 / 13 条断言，
新增通过者是 `repacku/Component.test.tsx`、`samea/Component.test.tsx`。
剩下那 25 个不是"不修就永远跑不了"，而是修完这两层之后它们会**改成以断言失败的红**出现——
见下面那 283 条。

两条都补完之后，43 个文件全部能采集，总断言 **402**，其中 283 条红。红字的实测分布（前几类）：

```text
178  TypeError: Cannot read properties of undefined (reading 'setItem')
 46  TestingLibraryElementError: Unable to find an accessible element with the role "button" and name …
 46  TestingLibraryElementError: Unable to find an element with the text …（含 "DissolveF" / "Crashu" / /1 条路径等待扫描/ 等）
  7  TypeError: Cannot read properties of undefined (reading 'clear')
  5  Error: Unable to find role="button" and name "配置管理"
  …
```

`setItem` 那一族的栈顶不在本仓代码里，而在 `zustand@5.0.14/esm/middleware.mjs:300`
（persist 中间件取不到 storage），触发点例如 `src/nodes/bitv/Component.test.tsx:15`；
同时每次跑都有一条 `(node:…) ExperimentalWarning: localStorage is not available because
--localstorage-file was not provided`。这两条合起来指向 **runner 环境缺一件东西**
（`localStorage` 全局在本机 Node 上是 undefined 的实验属性），既不是 `dep-missing` 也不是断言口径问题。
**本任务没有对它做归因**——只把症状与栈顶记下来，判它需要单独一轮。

`Unable to find … "cleanf scan paths" / "Wallpaper Engine 工坊路径" / "DissolveF"` 这一族，
标签字符串在本仓源码里是存在的（`src/nodes/cleanf/controls.tsx:69` 的默认标签、
`src/i18n/locales/en.json:1697` 的 `"scanPaths": "cleanf scan paths"`、
`src/nodes/dissolvef/Component.tsx:268` 的 `tNode("dissolvef", "name", "DissolveF")`），
`src/i18n` 也确实在仓里（`src/i18n/index.ts` + `src/i18n/locales/`），
所以它们更像 **i18n 没在测试环境里初始化**，而不像 Xaihi 故意改了口径。
上游 `vite.config.ts` 是否给测试配了 `setupFiles`（搬运时没跟过来）**未验证**。
这一族是否有个别真属于 `assertion-vs-xaihi-shape`（品牌改名那类），本轮**没有逐条判过**。

### 本轮没有"强行修"31 个里的任何一个，理由三条

1. `port-defect` 允许修的边界是"照 manifest 记录的 upstream 修订逐字搬"。这两条缺陷
   （workspace 排除、别名表排序）都是 **Xaihi 侧的决定**，上游没有对应产物可搬——
   上游有完整的 `node_modules`，也没有这张双前缀解析表。
2. 裸名解析的修法要么落在 `packages/ui-host/build-aliases.mjs`（三处共用一张表，
   不在本任务许可的编辑面里），要么在 `vitest.config.ts` 里给这一腿单独加一份别名覆盖
   ——那正是这张表注释里点名的"改一处就会在另一处红"，会把 tsconfig / vitest / 产物三处的同步尺打断。
3. 任务要求的证据是"相对今天的基线正好 +12 文件 / +52 断言"。把这 31 个一起放开会让这个数字
   变成别的数字，也就无法证明接进来的这 12 个是实测过的。

与 `plugins/*/src/core.ts` 的收敛（父任务清单第 24 项）**无关**：这 31 个文件走
`@xiranite/node-<id>/core` 的边全是 `import type`（`dissolvef`、`samea`、`classf` 等，共 166 处命中，
其中测试文件里的都是类型导入，构建期被擦除，不产生运行时请求），
唯一的值导入是 `@xiranite/node-classf/blacklist`（指 `plugins/classf/src/blacklist.ts`）。
本轮没有碰任何 `core.ts`，也没有触发 `scripts/check-verbatim.mjs` 的逐字约束。

---

## 取证命令（可复跑）

```bash
cd packages/ui-host && pnpm exec vitest run                      # rc=0, 38 files / 300 tests
cd /Users/glow/Base/Code/Freya/Xaihi && \
  pnpm --filter @hibernalglow/xaihi-ui test:unit                 # rc=0, 同上
cd /Users/glow/Base/Code/Freya/Xaihi && pnpm run typecheck        # rc=1, 停在 packages/node-sdk
cd /Users/glow/Base/Code/Freya/Xaihi && \
  pnpm --filter @hibernalglow/xaihi-ui typecheck                  # rc=1, own=1（src/client/workspace.tsx:262）
cd /Users/glow/Base/Code/Freya/Xaihi && \
  node packages/ui-host/build-aliases.mjs                        # rc=0, "alias 同步 OK（构建/测试/类型检查三处吃同一张表）"
```

别名表那把尺**看不见前缀吞并**：`assertAliasTargets()` 只核对"每一条指得到真文件"，
上面那 6 对被短键吃掉的长键在它眼里全部合格（rc=0）。前缀吞并这轮的判据来自实测——
把长键挪到表前面，第 31 号文件的错误就从 `@xiranite/shared/rules` 换成 `zod`。
（`build-aliases.mjs` 的注释里提到的 `scripts/check-alias-sync.mjs` 在仓里不存在，
`find . -name "check-alias-sync*"` 零命中；同步尺实际就是上面那条 `node packages/ui-host/build-aliases.mjs`。
这条归属别人手里的文件，本任务没改。）

43 文件 / 52 断言的那次采集需要临时把 `include` 换成 `src/nodes/**/*.test.ts(x)`；
本台账**故意没有**把这份临时配置留在仓库里。

## 本台账**没有**验证的东西

- 12 个新接入文件里只做了 1 个的减法对照（`useNodeSurface`）；其余 11 个只证明了断言数，
  没证明各自能红。
- 283 条红字的根因（zustand persist / `localStorage` 全局、i18n 初始化、上游 `setupFiles`）。
- `packages/ui-host/src/nodes/**` 之外是否还有采集不到的搬运测试（例如 `src/components/**`、
  `src/actions/registry.test.ts`——manifest 里 145 个 `*.test.*` 只有 43 个在 `nodes/` 底下）。
  本轮作用域就是那 43 个。
- `pnpm run typecheck` 里 `packages/node-sdk` 那条红是不是并行 lane 正在改的产物（没查归属，只确认了它先失败、且与 `ui-host` 无关）。
- 这 12 个文件是否与 `docs/port/xiranite-ui.json` 记录的 sha256 逐字一致（没做 sha 复核）。
- `pnpm check:pins`、`pnpm check:installable`、`pnpm check:skills`、`pnpm check:vocab` 等门禁**没跑**：
  本轮没动任何 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`，也没动技能目录。
  跑了的与本轮有关的只有：`vitest run`、`--filter … test:unit`、`--filter … typecheck`、
  根 `typecheck`、`node packages/ui-host/build-aliases.mjs`。
- 全仓 `pnpm test` 没跑（AGENTS.md：并行 lane 在飞时结果不可归因，且任务禁止）。

## 更正"最省事的那一条"：代理估的 12→16 / 52→82 偏低，而且我第一次复现探错了对象（2026-10-07 04:10）

上面那条"补上 rspack 那两行解析规则就能救回 30 份"的推断，我实测下来**成因对、剂量错**，
并且我自己先做一次假阴性才看清楚：

- 第一次探针：把 `packages/shared/node_modules` 软链到**仓库根** `node_modules` ⇒ 读数与基线完全一样
  （31 failed / 12 passed、同一个 `Failed to resolve import "zod"`）。
  原因很直白：pnpm 的仓库根 `node_modules` 里没有 `zod`（`ls node_modules | rg -c '^zod$'` ⇒ 0 行），
  那次链接什么也没给进去。**如果我当时收手，就会把"根因不是缺 node_modules"写进台账——那是错的。**
- 第二次探针：链到 `packages/ui-host/node_modules`（`zod` 在那儿，计数 1）⇒ 同一份临时配置读数变成
  **Test Files 25 failed | 18 passed (43)、Tests 283 failed | 119 passed (402)**。
  ⇒ 缺的确实是"每个包自己的 `node_modules`"，Vite 侧 `dedupe`/`server.fs.allow`/`deps.inline`
  四种写法全部读数不变（我先试的那四种），所以这不是配置能治的。
- 剂量：救回的是 **18 份文件 / 119 条断言**（代理估 16/82），并且**同时暴露 283 条真红断言**
  ——那 283 条才是这件事的真实成本：它们此前被"文件收不起来"这件事完全遮住。

两次探针之后都清了：`find packages plugins -maxdepth 2 -name node_modules -type l` ⇒ 0 条，
`but status` 里没有 node_modules 相关条目，`packages/ui-host` 回到 38 文件 / 300 条 rc=0。
 durable 的解法仍然是任务 #3 / #25 那一步（把 shared/logging/contract/cli-runtime 换成本仓包名、
 进 workspace、让 pnpm 自己装），**不要**在 vitest 配置里养第二套解析规则。
