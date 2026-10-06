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

## 七、下一步（已经派出去的部分）

`plugins/{sleept,linedup,dissolvef}` 各补 `src/cli.ts` + `./cli` 导出 + `bin`
（一个子智能体在跑，不许加任何 `@xiranite/*` 依赖——那条纪律就是第四节第 1 条的教训）。
之后才有"聚合 CLI 能不能 list 出三个真节点"这种可验的东西。
再往后依次是：`@xiranite/{file-operations,services}` 的对应物、46 个未迁节点、
以及 Bun 前置那条要使用者拍的口径。
