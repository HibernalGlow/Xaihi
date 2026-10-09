# 阶段报告 · 引擎出宿主进程 + 能力按服务名共享（kisaki 第一批之后的第二批）

日期 2026-10-09｜对应决定：ADR-0021（新）、ADR-0015 决定 2/5、ADR-0004 帧协议先例｜上一批：`docs/stages/native-source-ownership.md`

## 一、改了什么

| 落点 | 内容 |
|---|---|
| `plugins/kisaki/src/engine-host.ts`（新） | 子进程入口：装载 `.node`、问候（自述 + binding 实际位置）、派发表（5 个扫描族 + 2 个 candidate + `operation.trash` + `cancel`）、把装载器的进度轮询转成 `{event:"progress"}` 帧。**stdout 只走帧**，`console.*` 一律改道 stderr |
| `plugins/kisaki/src/engine-gateway.ts`（新） | 宿主进程这一侧：`ctx.subprocess` 起、三根 stdio、按 `id` 匹配应答、按 `scanId` 派发进度、统一死讯（退出码 + stderr 尾巴 + 写失败细节）、有界兜底、`dispose()` |
| `plugins/kisaki/src/local-subprocess.ts`（新） | CLI/TUI 与判据用的本地 provider：按 DSH handle 的形状实现 `spawn/done/terminate`，POSIX 走进程组、Windows 走 `taskkill /T`；`pid` 缺席时如实不说"收干净了" |
| `packages/node-sdk/src/engine-service.ts`（新）+ barrel 一行 | 服务名 `xaihiKisakiEngine`、`KisakiEngineFace`（`info/call/cancel/status`）、`provideKisakiEngine` / `connectKisakiEngine`（缺席不触发、不伪造） |
| `plugins/kisaki/src/platform.ts` | 五个扫描动词 + 两个 candidate + trash 全改走帧；`createNodeKisakiRuntime` 改 **async**（能力集来自真正服务这一次扫描的那个进程的问候）；`getNodeRuntimeInfo` 删除（避免宿主里再读一份 binding 成为第二份真源） |
| `plugins/kisaki/src/index.ts` | `inject = ['tools','subprocess']`；引擎取用器（起一次、失败即忘掉）；卸载时 `terminate()`；`ctx.provide(KISAKI_ENGINE_SERVICE, face)`；`status()` 走显式记账（`live/pending/lastFailure`），不用 promise 回调猜状态 |
| `plugins/kisaki/src/cli.ts` | 两处运行时工厂接上同一条腿；起进程落在本来已 async 的 `run` 里（不改同步导出面的签名） |
| `plugins/kisaki/tsdown.config.ts` | `entry` 加 `src/engine-host.ts`（不加就是"编译得过但产物里没那个定义"那一类假绿） |
| 测试 | 新判据 2 份（`tests/engine-gateway.spec.ts` 12 条、`tests/engine-service.spec.ts` 4 条）＋夹具 1 份（`tests/fixtures/fake-engine.ts`）；`tests/engine.spec.ts` 从"宿主进程内装载"改成**子进程真往返**；`src/platform.test.ts` 三处改 await + 假引擎 |

## 二、为什么

只换边界，不改内核：入口 import 的仍是原来那套装载器（`src/native/index.ts`），Rust 一个字没动。
帧协议整段照抄本仓已跑通的 findz 那一份，只改一处**必须**改的——进度与应答分流：那份内核同步、FIFO 够用，
引擎的扫描是长任务，用 FIFO 交事件会把"上一条的进度"念成"下一条的结果"。

## 三、与 DSH API 的关系

- `ctx.subprocess`（`@deepseek-ai/dsh-subprocess` 0.2.0-rc.2）：`spawn({argv,cwd,graceMs,stdio})` → handle
  带 `stdin/stdout/stderr`、`done`（`{exitCode,signal}`）、`terminate()` 幂等 —— 形状出处
  `README.zh.md:41,70` 与真用过的 `plugins/findz/src/gateway.ts:157-171`。**没有** value-import 那个包：
  本包 `package.json` 没这条依赖边且它正在别的 lane 手里改，故按形状读（与客户端那侧读 `ctx.theme` 同一条做法）。
- `ctx.provide` / `ctx.inject`：服务名跨包共享的唯一通路，先例是 `NODE_REGISTRY_SERVICE`
  （`packages/node-sdk/src/node-registry.ts:156`、`packages/core/src/index.ts:62,398`）。
- 与桥无关：本批没动 `runner.*` 的映射，也没动 `/xaihi/host`。

## 四、读数（每条都带 rc 与真实输出）

| 判据 | 读数 |
|---|---|
| 本包全套 | `npx vitest run` → **Test Files 24 passed (24)**（改前 2 failed | 22 passed）；其中 4 条是子进程真往返（问候 / duplicate / empty-files / CLI --json） |
| 协议判据 | `npx vitest run tests/engine-gateway.spec.ts` → 12 条全绿，rc=0 |
| 减法对照①：死讯不带 stderr | 删掉那一行拼接 ⇒ **只有** "folds the exit code and the kernel stderr tail into one death message" 红（rc=1） |
| 减法对照②：进度帧当应答 | 把事件分支短路 ⇒ **只有** "routes progress frames to that scan only" 红（rc=1） |
| 扰动没残留 | 还原前后 `shasum` 均为 `ce9f04aa4703…`（逐字节相同），复跑 12 条绿 |
| 服务边判据 | `tests/engine-service.spec.ts` → 4 条绿，含"两份内联实例的 `connectKisakiEngine` 不是同一个函数"这条对照（query 失效就红，不会假绿） |
| 产物里真有那份定义 | `npx tsdown` rc=0；`lib/engine-host.js` 11,241 字节，含 `binding-missing/abi-mismatch/capability-missing` 三个码与 `getCzkawkaInfo` |
| 上游两个包没被我带坏 | `packages/node-sdk` 13 files rc=0；`packages/core` 13 files rc=0 |
| 新写的三份文件类型面 | `tsc` 对 `engine-host.ts / engine-gateway.ts / local-subprocess.ts` **0 条**；`platform.ts` 剩 2 条（`exactOptionalPropertyTypes` 那条在 HEAD 的同一字面量上就有，逐字对照过） |
| 归属：`cli.ts` / `index.ts` 的 tsc 残余 | 逐条比 HEAD：`OPERATIONS_SERVICE`/`KisakiAction` 未用、`DefineNodeOptions` 没有 `run` 等都在 HEAD 已存在；`define-node.ts:321` 与 HEAD 逐字相同 |

**当时没有实机验过的部分**：真宿主 3199 里那一格没跑过——带令牌的入口只能从宿主 stdout 读，
那次装配不属于本会话；且上一批留的现场是同一条 `/xaihi/ui/<rev>/index.html` 当顶层窗打开时
`root` 只有 593 字节、协商账本停在"等宿主握手"，`scripts/check-workbench-live.mjs` 也报"读不回来现场"。
所以写这一段时本批的状态是**代码 + 单元 + 真子进程往返已验，宿主实机未验**。
（同日追加的实机验证与它挖出的三条装载期缺陷见下面第五节。）

## 五、宿主实机（同日追加）：那格确实装不上，三条都是装载期的

现场：`xaihi-kisaki (@hibernalglow/xaihi-kisaki): failed to import` + `Node "kisaki" is not registered in local NodeRegistry`。
DSH 把真原因咽了 —— `dsh-app-boot/lib/index.js:3904-3910` 的 `inactiveEntries` 只看 `entry.fiber === undefined`，
一律写成 `"failed to import"`，原始错误只进 `ctx.logger.error`（今天这台宿主没落盘那份日志）。
所以判据换成一次性仪表：在 `cordis-plugin-loader` 的 `_init` 三个出口（import 的 catch、`unwrapExports` 之后、
`registry.plugin` 的 catch）各打一行 stderr。**仪表用完已还原**：`lib/index.js` 与改动前的字节备份逐字节相同
（sha256 `b57c5075e881b4ce…`、23896 字节、`XAIHI` 残留 0 处）。

两句真话按修的顺序出现，各自是一条独立的缺陷：

| # | 仪表读回的真原因 | 根因 | 修法 |
|---|---|---|---|
| 1 | `invalid plugin, expect function or object with an "apply" method, received object` | `src/index.ts` 末尾写着 `export default { def }`（搬运那批留下的，27 个插件里只有它一份）。`unwrapExports`（`cordis-plugin-loader/lib/index.js:665-670`）先取 `default`，于是 `{def}` 顶掉了命名空间里那份带 `apply` 的导出 | 删掉 `export default`，`def` 只留具名导出；注释钉住"这里不许有 default"与它的症状 |
| 2 | `TypeError: Cannot read properties of undefined (reading 'scan')` at `defineNode` | `apply` 往 `defineNode` 传的是 `run: (input, run, journal) => …`，而 `DefineNodeOptions` 没有 `run` 这一格，只有 `handlers`（`packages/node-sdk/src/define-node.ts:76-96`）。`options.handlers['scan']` 在一片 undefined 上取键，就报成"读 scan" | 按 findz 那一版重写（`plugins/findz/src/index.ts:287-313`）：handler 表由清单的 `actions[]` 推导、`journal: () => ctx.get(OPERATIONS_SERVICE)`、`run.preview/progress/resultView` 替掉原来不存在的 `journal.log`、`Config` 的 volatile 一律 `.get()`（原来直接把 `Volatile<boolean>` 当布尔传下去）、事件按 `NodeRunEvent.type` 分流 |
| 3 | 第一次动作 500：`definition.inputBindings is not iterable` | kisaki 的清单没有 `inputBindings`（其余 26 个都有）。类型上它必填（`node.ts:197`），但校验器把原值 `raw as unknown as NodeDefinition` 直接交回去（`node.ts:405`），所以"清单没写"这条路一直是类型谎言 | SDK 认这个缺席（`bindInputs` 里 `?? []`），**不动清单**：改清单要重跑 `gen-node-registry`，而那份生成物的同一个 hunk 里正压着别人的 26 行搬运产物。新判据 `packages/node-sdk/tests/manifest-without-input-bindings.spec.ts` 三条：缺席 ⇒ `bindInputs` 交空表、`defineNode` 照样注册且 `handle.run` 把原始 args 原样送到、阳性对照 ⇒ 同一份夹具补上绑定后槽位真的绑出来（不许把缺席写成"永远返回空表"） |

### 实机读数（2026-10-09，宿主 3199 / `DSH_HOME=../.scratch/dsh-xaihi-home`，node_modules 为未打仪表的原装）

| 判据 | 读数 |
|---|---|
| 装载 | `dsh --profile xaihi --no-open` → **无** `did not activate` / `failed to import`（改前是 `warning: 1 entry did not activate` 点名 `xaihi-kisaki`） |
| 真跑一次扫描 | `POST /xaihi/runner {nodeId:"kisaki", input:{action:"scan",tool:"empty-files",includedDirectories:[mktemp],recursive:true,useCache:false}}` → **HTTP 200**、`success=true`、`runId=kisaki/scan#1`、`message="Found 2 item(s) in 1 group(s)."`，两条 entry 是 `sub/also-zero.dat` 与 `zero.dat`（递归那条同时被验到） |
| 决定 1（`.node` 只在子进程） | `lsof -p <宿主>` 里唯一的 `.node` 是 DSH 自己的 `node-addon-require-builtin-…​.node`，**没有** czkawka 那份；`lsof -p <子进程>` 才是 `native/artifacts/darwin-arm64/xiranite-czkawka.darwin-arm64.node`。子进程 `pid 64856 ppid 64798`，父进程就是宿主 |
| 本包单元 | `pnpm --filter @hibernalglow/xaihi-kisaki test:unit` → rc=0，**26 files / 201 tests 全绿** |
| SDK 单元 | `pnpm --filter @hibernalglow/xaihi-sdk test:unit` → rc=0，**14 files / 133 tests**（含新增 3 条） |
| 产物形状 | kisaki `lib/index.js` 导出面回到与其余 26 个同一形状：`{Config, apply, def, inject, name}`（无 `default`）；守卫在产物里数得到（`inputBindings ?? []` 1 处） |
| 门禁 | `check:noderegistry` rc=0（撤掉清单改动后不再需要重跑生成物）、`check:nodebundle` rc=0、`check:pins` / `check:installable` / `check:vocab` rc=0、`check-native-manifest --self-check` rc=0 |
| 本包 tsc | `index.ts` 由 6 条清到 **0 条**；`platform.test.ts` 的 3 条假引擎类型、`engine-service.spec.ts` 的 2 条一并清掉（整包 76 → 70）。剩下 70 条逐条比过 `git blame`，全部落在搬运那批（`5631ab9b`，2026-10-08）写的行上，不在本批改过的行上 |
| `packages/node-sdk` tsc | 2 条（`define-node.ts` 里 `preview: (p) => …` 那个块），与 HEAD 逐字相同 ⇒ 本批没带坏它 |

### 明确没做 / 留给使用者定的

- **清单里到底该不该有 `inputBindings`**：本批选了"SDK 认缺席"，因为它不碰别人正在重写的生成物。另一条路（把这一格写成清单必填 + 给 kisaki 补一行 `{fieldId:"tool",slot:"tool",transform:"trim"}`）需要 `gen-node-registry` 重跑，而那份生成物现在压着 26 行未提交的搬运产物 —— 提交它会替别人把活儿签进我的分支。要收紧成必填，请先让那批落地。
- **`check:brand` 仍然红（1282 条）**，且其中两条是 `native/artifacts/manifest.json` 里那两个 `xiranite-czkawka.*.node` 落盘名：账本的点名格式是 `path:line`，而清单是生成物、行号会变，所以那类"点名"根本钉不住。这既不是本批引入的、也不是改名字能收的，属 ADR-0010 的机制缺口，按 AGENTS.md 那条（看见它不在 CI 里别去补）留给你定。
- `runner.getInfo` 没有生产者那条缺口（决定 7）仍未修，`nativeCapabilities` 恒为空集。
- 界面上那一格（`/xaihi/ui/<rev>/index.html` 的 kisaki 面板是否真渲染）本批没验：它的首个症状 `refused: 宿主没随握手带环境快照` 属于另一条 lane 正在 `Component.tsx` 里加的守卫，本次没碰。

顺带发现的一条缺口（没修，写进 ADR-0021 决定 7）：`runner.getInfo` 没有生产者
（`createLocalRunner` 只交 `{run,cancel}`；`bridge-shell.ts:267` 对该动词一律 `unavailable`），
于是 `use-kisaki-workbench.ts:123-130` 那份 `nativeCapabilities` 恒为空集。
