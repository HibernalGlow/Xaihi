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

**没有实机验过的部分（明写）**：真宿主 3199 里那一格没跑过——带令牌的入口只能从宿主 stdout 读，
那次装配不属于本会话；且上一批留的现场是同一条 `/xaihi/ui/<rev>/index.html` 当顶层窗打开时
`root` 只有 593 字节、协商账本停在"等宿主握手"，`scripts/check-workbench-live.mjs` 也报"读不回来现场"。
所以本批的状态是**代码 + 单元 + 真子进程往返已验，宿主实机未验**。

顺带发现的一条缺口（没修，写进 ADR-0021 决定 7）：`runner.getInfo` 没有生产者
（`createLocalRunner` 只交 `{run,cancel}`；`bridge-shell.ts:267` 对该动词一律 `unavailable`），
于是 `use-kisaki-workbench.ts:123-130` 那份 `nativeCapabilities` 恒为空集。
