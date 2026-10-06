# 阶段报告：终端面（CLI / TUI）搬运第一轮

对应 roadmap R11、`docs/adr/0006-ui-source-is-xiranite.md` 的
「裁定：终端面…」与「分发形状：三面同一个 npm 包…」两节。
来源：Xiranite tag `noxide`（commit `ccf465fe`），逐文件指纹见 `packages/cli/port-inventory.json`。

## 一、改了什么

- 原样搬进 6 个包（**258 文件 / 18,019 行**，`diff -rq` 与来源逐字节一致）：
  `packages/cli`（10f）、`packages/cli-runtime`（206f，**TUI 就在它里面**）、
  `packages/api`（10f）、`packages/contract`（3f）、`packages/shared`（13f）、`packages/logging`（15f）。
- `packages/cli/port-inventory.json`：机器可读台账（`sourceCommit`、`bins`、20 条第三方、
  101 条 `@xiranite/*` 依赖边、46 个被缺包堵住的节点命令、实测尺寸、可达性结论）。
- `pnpm-workspace.yaml`：这 6 个包**暂时不入 workspace**（下一节第 1 条解释了为什么这不是保守，而是必须）。
- 未跑构建、未装依赖、未发布——这批文件现在是" inert 的源码"，不是可执行面。

## 二、为什么这样设计

1. **不入 workspace 是被实测逼出来的，不是风格。** 这 6 个包的依赖里有 **38 条**
   `@xiranite/*` 写着 `workspace:*`（本仓实测分类：**27** 条指向 `@xiranite/node-*`
   这种本仓根本没有的包名、**2** 条指向 `file-operations` / `services` 也没有对应物、
   **9** 条指向本次一起搬进来的那 5 个包名）。只要它们进了 `packages/*` glob，
   pnpm 连依赖树都解不出来，症状是**全仓每一条 pnpm 命令**（含所有门禁）报
   `Failed to resolve dependency tree: … "@xiranite/file-operations@workspace:*" …`。
   这与 ADR-0002 的"profile 解析不了 `workspace:*`"是同一类失败的第三种发生方式。
   放行条件逐条写在 `pnpm-workspace.yaml` 注释里。
2. **"TUI 是一个独立包"这个前提是错的，我按实测收回。** `noxide` 里根本没有 `packages/tui`：
   终端 UI 是 `packages/cli/src/{Tui.tsx,tui-runner.tsx,workspace-tui-model.ts}`
   \+ `packages/cli-runtime/src/tui/**`（31 文件、19 个 `.tsx`），
   对外以 `@xiranite/cli-runtime/terminal/opentui` 出。所以搬法是"照抄包名"，
   不是"给 TUI 造一个目录"。
3. **三面共享核心这件事，上游自己走的是数据注册表而不是值导入。** 聚合 CLI 只经
   `packages/cli/src/node-cli-registry.generated.ts`（一张静态表，**不 import 任何东西**）
   再用 `await import(\`${packageName}/cli\`)` 打到节点面；
   每个节点的 `cli.ts` / `Tui.tsx` 只用**相对路径**引自己的 `core.ts`。
   ⇒ 这正好接上 ADR-0007 决定 4 那条纪律（面不许把执行器拉进来），
   也说明 Xaihi 侧缺的不是架构，是**那 8 个 `./cli` 子路径导出**（下一节）。

## 三、与 DSH API 的关系

终端面与 DSH 无关（不进宿主、不用 `ctx.*`），但它与网页面共享的**节点核心**在 Xaihi 侧
是以 DSH bundle 的形式存在的（`plugins/<id>`）。于是三条边界的账目是：

- 节点宿主半边只有一个真源：`plugins/<id>/src/core.ts`。CLI 面要跑同一个核心，
  只能从**同一个包**的 `./cli` 子路径出，不能复制第二份（ADR-0002 的自包含纪律仍然成立：
  装进 profile 的那一半不许引用仓内包；`./cli` 是给全局 `npm i -g` 那一半用的）。
- `package.json#bin` 与 bundle 身份不冲突：ADR-0006 已实测"带 `bin` 的包能被当 DSH bundle 装上"
  （`dsh plugin --profile xaihi add file:…` rc=0）。
- 品牌：`packages/cli/package.json` 的 `bin` 目前逐字是 `"xiranite": "./dist/index.js"`，
  这是 `check:brand` 现在读到 1003 处里的成员之一（口径与批次边界见 ADR-0006 末节）。

## 四、可达性：现在**不能启动**，两处失败都有名字

1. **装不上**（先撞这个）：上面那 38 条 `workspace:*`。今天靠负模式绕开。
2. **硬 import 缺失**：`packages/cli/src/index.ts:7` 是
   `import { localizeNodeHelp } from "@xiranite/contract"`，
   而 `packages/cli/package.json#dependencies` 里**没有** `@xiranite/contract`
   （实测那份清单 **34 项**：`@opentui/{core,react}`、`@xiranite/{api,cli-runtime,logging,shared}`、
   27 个 `@xiranite/node-*`、`react`）——上游靠 bun 的提升蒙过去了，换 pnpm 严格解析
   就在解析参数之前 `ERR_MODULE_NOT_FOUND`。
3. **派发**：节点命令走 `packages/cli/src/index.ts:196` 的 `await import(`${registration.packageName}/cli`)`
   （unguarded），帮助文本另走 `:205` 的 `${packageName}/help`；
   `node-cli-registry.generated.ts` 实测 **46 条**登记，46 个 `x<id>` 命令全断——
   缺的是**两个**子路径（`./cli` 与 `./help`），不是一个。
   `list` / `--help` / `ui` 不需要任何 node 包，因此这三条是搬完立刻能验的面。
4. ~~`xiranite ui`（TUI）要 Bun~~ **已经改掉**，见下面第八节。

映射表（实测，不是推断）：101 条 `@xiranite/*` 边里，9 条非 node 的有 7 条由本次搬进来的包满足、
2 条无对应物（且是 type-only，堵的是 `packages/api` 的 typecheck）；
92 条 node 边里 **8 条有同名对应包、0 条有它需要的导出**
（Xaihi 的 `plugins/*` 现在只导出 `.`、`./locale/*.json`、`./cordis.patch.yml`、`./package.json`）。

## 五、实测尺寸（`du -shL` 打在 `/Users/glow/Base/Code/Freya/Xiranite/node_modules`，版本与 noxide 一致）

`@opentui` 子树 **16 MB**（core 12 MB 内含 5 个 tree-sitter wasm 共 3.3 MB、dylib 3.6 MB）、
web-tree-sitter peer 5.7 MB、sharp 子树 ~18.4 MB（libvips 17 MB）、sixel 1.3 MB、
zod 6 MB、lru-cache 2.9 MB、csv-parse 1.6 MB、react-reconciler 1.6 MB、elysia 1.3 MB、
react **0.252 MB**、clack 0.128 MB…… **终端面地板 ≈51 MB**（逐项相加，不是估的总数）。
`react-dom` 7.1 MB 但**终端面里 0 处 import**（实测 `grep -rl react-dom packages/{cli,cli-runtime}/src` → 0 个文件）
⇒ 那 7.1 MB 不属于终端面，是网页面那条腿的。
**未测**：noxide worktree 自己没有 `node_modules`；linux/x64 与 win32 的变体没量。

## 六、工具链落差（搬之前就存在的账）

搬进来的包想要 `typescript@^7.0.2` + `@types/node@^24` 且**不写 `engines`**；
Xaihi 全线是 `typescript@^6` + `@types/node@^22` + `engines: ^22.19 || >=24`。
最后这条对 TUI 根本不成立（它跑在 Bun 上，不是 Node 上）——写进台账而不是偷偷对齐。

另有两处非运行时代码的残留：`packages/cli-runtime/components.json:8` 的
`css: "../../src/index.css"` 指的是上游 GUI 的样式表；
`scripts/sync-termcn-opentui-registry.mjs:13` 会去 fetch termcn.dev；
`shared/src/http-url.test.ts:7,12` 与 `api/src/client.test.ts:59,63` 里是过时的 Wails URL 夹具
（测试夹具，不是运行时假设）。全仓终端面**没有** Tauri/Electron/Wails 的运行时调用。

## 八、TUI 不再 spawn 裸 `bun`（2026-10-06 使用者指令："会 spawn 裸 bun 的地方都改掉"）

**上游那条硬要求本身就是过时的。** 实测（同一台机、同一份 `node_modules`）：

- `@opentui/core@0.4.5` 的 `exports` 里同时有 `"bun": "./index.bun.js"` 与
  `"node"/"import": "./index.node.js"`；平台包 `@opentui/core-darwin-arm64` 也同时给了
  `index.bun.js` 和 Node 用的 `index.js`（后者导出的就是 `libopentui.dylib` 的路径）。
- 在 **Node 26.10** 上直接 `await import('@opentui/core')` ⇒ 257 个导出、rc=0，
  只带一条 `ExperimentalWarning: FFI is an experimental feature`。
  ⇒ "TUI 必须 bun" 是在解决一个不存在的问题，代价是把
  "`npm i -g` 一个包就装好 CLI/TUI"（ADR-0006 分发形状）变成"还得另装 bun"。

改了什么（生产代码里已经没有任何 bun 引用，实测 `grep` 终端面 6 个包 = 0 命中）：

| 原来 | 现在 |
|---|---|
| `cli-runtime/src/tui/bun-runtime.ts`：`spawn` 裸 `bun`/`bun.exe` 重跑自己，找不到就抛 `Unable to start Bun for OpenTUI` | **删掉**。换成 `cli-runtime/src/tui/runtime-capability.ts`：`probeTerminalRuntime()` 真加载一次渲染器（只 import，不进渲染、不改终端状态），返回 `{ok, runtime, version, exports, detail}` |
| `runTerminalUi` 开头 `if (!isBunRuntime()) reexec()` | 探测不过 ⇒ `writeError(terminalRuntimeHint(...))` + `process.exitCode = 3` 并**如实退化**（gd 引导式与 pipe 面不受影响）；不偷偷换运行时再跑 |
| `cli/src/index.ts:121-125` 的 `ui` 子命令重定向 | 同一个探测 + 同一句退化文案（口径只有一份） |
| 6 个 `*.bun.test.tsx?`（`import … from "bun:test"`、一处 `Bun.sleep`） | 全部转成 vitest 并**去掉文件名里的 `.bun.`**（那标记已经没有意义）；`Bun.sleep` 换成本地 `sleepMs` |
| `packages/{api,shared}/package.json` 的 `"test": "bun run build"`、`cli`/`cli-runtime`/`logging` 的 `&& bun test …` 与 `test:tui` | 一律换成 `vitest run …`；顺手给 `cli`/`cli-runtime`/`api` 补上缺的 `vitest` devDependency（上游只在 `logging` 里声明过） |

证据（仓库外的一次性驱动，把改过的 `runtime-capability.ts` 原样拷进一个能解析到 `@opentui` 的目录再跑）：

```
$ node .scratch/probe-term/run.mjs
capability: {"ok":true,"runtime":"node","version":"26.10.0","exports":257,
             "detail":"@opentui/core 在 node 26.10.0 上加载成功（257 个导出）"}
PROBE_OK exports=257 runtime=node 26.10.0        rc=0
(node:91681) ExperimentalWarning: FFI is an experimental feature and might change at any time
```

**这条测量的适用条件一起记**：Node 侧能加载靠的是 builtin FFI（实验特性）。
本仓 `engines` 的下沿是 `^22.19.0 || >=24`，而 22.x 没有 builtin FFI ⇒
那种运行时下会走退化分支并打印第六节那六行文案（驱动里用假造的
`{ok:false, runtime:'node', version:'22.19.0'}` 验过文案含"退化"与版本号，
也验过 `ok:true` 时文案必须是空串）。
**没有验过**的：真在 TTY 里渲染一屏（`packages/cli` 还不入 workspace，跑不起来，见第四节）。

## 九、三个已迁节点的终端面：`./cli` 与 `./help` 两条子路径都亮了

聚合 CLI 派发靠两条动态 import（`packages/cli/src/index.ts:196` 的 `${pkg}/cli`、`:205` 的
`${pkg}/help`），而 Xaihi 的插件此前只导出 `.`/`./locale/*`/`./cordis.patch.yml`/`./package.json`
⇒ 实测 8 个同名包 **0 个有需要的导出**。这一轮把 `sleept` / `linedup` / `dissolvef` 补齐。

**两份 vendored 文件，各自有理由，且都有尺。**

1. `plugins/<id>/src/cli-support.ts`（每包一份，实测 19.7 KB）。
   为什么不能共享：ADR-0002 禁止装进 profile 的包引用仓内包，而 `@xiranite/cli-runtime`
   一写进依赖全仓 pnpm 就解不出树。所以按上游 `packages/cli-runtime/src/{index,interaction,tui/index}.ts`
   里**本包用得到的那几颗**复刻，文件头逐条写出处，并标两处有意偏离
   （不引 `string-width`/`chalk`；环境变量叫 `XAIHI_*` 不叫 `XIRANITE_*`）。
   复制三份的代价是漂，所以新增尺 `scripts/check-vendored.mjs`：抹掉 `@module` 行之后逐字节比，
   `--self-check` 用"追加一行"证明这把尺看得见单文件改动（实测 rc=0，报出 17972 vs 17954 字节）。
2. `plugins/<id>/src/help.ts`（每包 12 行）不再抄文案，而是调
   `@hibernalglow/xaihi-sdk` 新增的 `nodeHelpFromManifest()` **从 `package.json#xaihi.node` 推导**。
   为什么必须推导：上游那份 `help.ts`（sleept 120 行 / linedup 186 行 / dissolvef 120 行）
   是手抄的第二真源，**实测已经漂**——上游 sleept 那份还在说 "System timer for countdown,
   scheduled time, network, and CPU triggers"，命令名还是 `xiranite sleept`。
   照搬就是把过时描述发到使用者屏幕上。
   命名撞车也顺手记一条：`node-sdk/src/node.ts` 里已有一个 `NodeHelp`（清单里的 `help` 块），
   与终端载荷是两件事，同名会让 dts 打结（实测两个类型都从 barrel 导出名单里消失，
   症状是 TS4023 + MISSING_EXPORT）⇒ 终端这份统一叫 `Terminal*`。
   可选性也按契约来：`NodeAction.description?` 是可选的（实测上游 `node-definitions/linedup.json`
   唯一的动作 `filter` 就没写描述），所以缺描述只是那条例子不带 `description`，
   写了却只写一种语言才抛——"文案没填"不该升级成"这个节点不能用"。

**顺手抓到并改掉的一个真缺陷**：`sleept` 的 `at` 子命令原本带 `required: true` 的参数校验，
于是未接的功能先报 `Missing required argument: target.`——使用者读到的是"我参数没给对"，
而事实是"这块内核没搬"。与本文件顶部那条「静默消失比响亮拒绝更糟」同一类误导、方向相反，
所以去掉那四个未接子命令的 `required`，让它们一律走未接分支（`tests/cli.spec.ts` 钉住）。

**证据**

```
$ pnpm --filter …/plugins/{sleept,linedup,dissolvef} exec tsdown        三份 build rc=0（含 lib/cli.js 与 lib/help.js）
$ pnpm --filter @hibernalglow/xaihi-sdk exec vitest run
 Test Files  5 passed (5) / Tests  50 passed (50)        # 含新增 help.spec.ts 4 条（带正控）    rc=0
$ plugins/sleept    vitest run → 29 passed   rc=0
$ plugins/linedup   vitest run → 15 passed   rc=0
$ plugins/dissolvef vitest run → 14 passed   rc=0
$ node lib/cli.js --help / status --json / countdown / block   四种走法都按文档返回：
   --help rc=0 列六动作+四条未接；status rc=2 且 executed:false、理由点名 ctx.subprocess；
   countdown rc=2 说"定时器内核未迁"；block 无 --minutes rc=1 点名 Config.blockDefaultMinutes
$ node scripts/check-vendored.mjs            rc=0（3 份一致）
$ node scripts/check-pins / check-skills / check-installable   全部 rc=0
$ plugins/{sleept,linedup,dissolvef} tsc --noEmit               rc=0
```

**没验到的**：按**包名**的动态派发（`import('@hibernalglow/xaihi-sleept/cli')`）——
仓库里没有任何包依赖这三个插件（入口 bundle 故意不依赖，见 ADR-0005），
而 `packages/cli` 还没入 workspace，所以名字解析这一步现在无从跑。
子路径导出与产物本身已按相对路径加载验证过。


## 七、下一步（已经派出去的部分）

`plugins/{sleept,linedup,dissolvef}` 各补 `src/cli.ts` + `./cli` 导出 + `bin`
（一个子智能体在跑，不许加任何 `@xiranite/*` 依赖——那条纪律就是第四节第 1 条的教训）。
之后才有"聚合 CLI 能不能 list 出三个真节点"这种可验的东西。
再往后依次是：`@xiranite/{file-operations,services}` 的对应物、46 个未迁节点、
以及 Bun 前置那条要使用者拍的口径。

## 十、`packages/cli` 入不了 workspace 的确切账（2026-10-07 01:16 现读）

`pnpm-workspace.yaml` 里那批 `!packages/{api,cli,cli-runtime,contract,logging,shared,tui}` 负向条目
不是风格问题：这些包的 `@xiranite/*` 依赖写成 `workspace:*`，而本仓没有那些包名，
一入表 pnpm 连依赖树都解不出（症状是全仓每条 pnpm 命令报 Failed to resolve dependency tree）。
按 `packages/*/package.json` 现读，31 + 2 + 3 + 1 + 1 条边的归属是：

| 包 | 非节点边（本仓有源码，只是没进 workspace） | 节点边·在 retain-rewrite 28 名单内 | 节点边·**不在名单内** |
|---|---|---|---|
| `packages/cli` | `api`、`cli-runtime`、`logging`、`shared` | bandia cleanf crashu dissolvef encodb enginev findz formatv linedup linku logx marku migratef mvz rawfilter recycleu repacku samea sleept trename（20 条） | **czkawka kavvka lata movea owithu scoolp seriex（7 条）** |
| `packages/cli-runtime` | `api`、`contract` | — | — |
| `packages/api` | `file-operations`、`services`、`shared` | — | — |
| `packages/contract` | `shared` | — | — |
| `packages/logging` | `cli-runtime` | — | — |

⇒ 三件事，顺序有依赖，不能一次做完：
1. **先把那 7 条"名单外"的边剪掉**（`lata` 是 hold-unmigrated，其余六位在台账里是 removed/drop）。
   它们对应的不是"还没搬的命令"，是**已经出局的功能**——按"只为已出局节点存在的能力不算能力"这条，
   正确做法是把那几个子命令整块删了，不是留一个空壳等移植。
2. `@xiranite/file-operations` 与 `@xiranite/services` 本仓**判定不接**（ADR-0013），
   所以 `packages/api` 这两条边必须改成指向我们自己的东西或整块不搬；这一步不做完，
   `packages/cli` 引 `@xiranite/api` 就永远解不出来。
3. 剩下 20 条节点边是**随批次自然收敛**的：每迁完一个节点、`plugins/<id>` 进了 workspace，
   就少一条 `@xiranite/node-<id>`（改名成 `@hibernalglow/xaihi-<id>`）。
   批次 A–H 已覆盖其中 14 个，还在飞 4 个。

`nodeCoreAliases()`（`packages/ui-host/build-aliases.mjs`）已经是"从 `plugins/*/src` 现读自动长表"的形状，
所以第 3 步在**类型检查与浏览器产物**这一侧不需要人工同步；需要人工的只有 `packages/cli` 那份依赖表。

### 十.1 第 1 步已做：假承诺由生成器堵住，而不是由人记得删

新增 `scripts/gen-cli-registry.mjs`（`--check` 是尺、`--self-check` 是阳性对照，
已接进根 `package.json` 的 `check:cliregistry` 并排进 `pnpm test`）。
表的输入只有一个真相源：`plugins/<id>/package.json` 的 `bin` + `exports["./cli"]` + `exports["./help"]`
+ `xaihi.node.description.en`，四样齐才进表，缺一就不进（不回退成猜测）。

现读结果：**46 条 → 21 条**。少掉的 25 条就是"帮助里印得出来、`await import()` 当场 module not found"
的入口——`packages/cli/src/index.ts:200` 正是按 `${packageName}/cli` 动态装载的。
顺带把这条量成事实：**`findz` 不在 21 条里**，因为批次 D 那个包现在
`bin` 是 `undefined`、`exports` 只有 `.` / `./locale/*.json` / `./cordis.patch.yml` / `./package.json`
——即"这个节点还没有终端面"，这把尺第一次让它可查而不是靠人记。

`packages/cli/package.json` 里那 7 条指向已出局功能的依赖（`czkawka kavvka lata movea owithu scoolp seriex`，
台账判 `removed` ×6 + `hold-unmigrated` ×1）一并删掉；`@xiranite/*` 边数因此从 31 降到 24。
减法跑测：往生成物里塞一条 `ghost` 假条目后 `--check` rc=1 并点名"现读 21 条"，重新生成后 rc=0。

还剩两步（有依赖顺序，不能顺手做完）：第 2 步是 `@xiranite/{file-operations,services}` 那两条
按 ADR-0013 判定不接之后 `packages/api` 怎么改；第 3 步是把 `packages/{api,contract,shared,logging,cli-runtime}`
的包名从上游名换成 `@hibernalglow/xaihi-*`，换完才能解掉 `pnpm-workspace.yaml` 里那批负向条目。
