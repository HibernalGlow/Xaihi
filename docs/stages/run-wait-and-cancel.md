# 阶段报告：长任务按心跳判活 + 取消接成真

对应 `docs/adr/0022-long-runs-are-judged-by-heartbeat-and-cancel-belongs-to-the-journal.md`。
起因是一条实机症状：BitV 扫描 `/Users/glow/Downloads`（递归，文件很多）时面板报
`timeout: runner.run 在 30000ms 内没有应答`，而扫描仍在继续。

## 一、改了什么

**契约层（`packages/node-sdk/src`）**

- `host-bridge.ts`：新增 `BRIDGE_RUN_IDLE_TIMEOUT_MS`（30 秒心跳档）、
  `RUN_TIMEOUT_UNLIMITED`、`RunWaitPolicy`、`runWaitPolicyFor()`。`BRIDGE_REQUEST_TIMEOUT_MS`
  保持原义（普通动词一次往返的上界）。
- `node.ts`：`NodeDefinition.runTimeoutMs?: number`（`0` = 明确不限；不写 = 不设硬上限）+
  `validateNodeDefinition` 里逐条点名的形状闸。
- `bridge-document.ts`：新增 `beginCall(method, args, policy?) → { id, promise, renew() }`，
  `call()` 退化成它的薄包装（形状与语义不变）。上界 = 心跳档与硬上限档里更早的那个；
  到点分两种 reason（`timeout` / `run-timeout`），且只有节点真声明过上限才允许念 `run-timeout`。
- `bridge-shell.ts`：`RunFace` 补 `runTimeoutFor(nodeId)` 与 `onRunActivity(listener)`；
  `runner.getInfo` 从"永远 `no-provider`"改成按注入面兑现；`runner.cancelCurrent`
  修到它自己那一条（此前无条件走 `cancel(args[0])`，而这一格永远不带参数）。
- `operations.ts`：`OperationRun.signal: AbortSignal`，`OperationJournal.cancel(runId, reason?)`；
  `NULL_RUN` 带一条永不 abort 的信号。
- `define-node.ts`：注册表条目补 `cancelRun` / `inFlightRuns`（都经账本，不另立一份状态）；
  `runAction` 用 `Promise.race([handler, abort])` 让取消立刻结算，文案
  `CANCELLED_MESSAGE` 明说"没查 signal.aborted 的节点工作可能仍在继续"。
- `node-registry.ts`：`cancel` / `cancelCurrent` 从桩变成真的遍历按下中止键；
  新增 `runTimeoutFor`；`createLocalRunner(registry, activity?)` 多接一条账本订阅。

**宿主与文档（`packages/core/src`、`packages/ui-host/src`）**

- `core/src/operations.ts`：按 runId 持有 `AbortController`，实现 `cancel`（abort + 记 `failed`），
  生命周期与 `runs` 的 `maxRuns` 淘汰一致。
- `core/src/host-routes.ts`：`runner.run` 那条 settle 闸改成心跳续期（`onRunActivity`）+
  节点声明的硬上限（`runTimeoutFor`）；并把"先 `await receive` 再计时"改成
  **应答 / 没接住 / 到点三路竞态**——原先 `receive` 内部 `await evaluate` 会把整条 HTTP 响应
  挂到运行结束，上界定时器永远轮不到上班（实测 40 秒的运行就要挂 40 秒）。
- `core/src/index.ts`：把账本递给运行面（`createLocalRunner(nodeRegistry, () => journal)`）。
- `ui-host/src/client/document-host.ts`：`runner.run` 走 `beginCall`，订阅运行账本续期；
  等待策略从 `runner.getInfo` 读回并按 nodeId 缓存。
- `ui-host/src/components/modules/hostApi.ts`：没有宿主时的占位桥补 `beginCall`
  （缺它会把"这份文档不在宿主里"读成 `beginCall is not a function` 的 TypeError）。
- `plugins/bitv`：`runBitv` / `analyzeVideos` / `classifyVideos` / `runReportClassification` /
  `discoverVideos` / `walkVideoDirectory` 全部认 `signal`（在文件之间、目录之间检查）；
  `package.json#xaihi.node` 声明 `runTimeoutMs: 0`。

**新增的尺（全部带阳性对照）**

| 文件 | 条数 | 判的是什么 |
| --- | --- | --- |
| `packages/node-sdk/tests/run-wait-policy.spec.ts` | 6 | 有心跳就不截 / 没心跳必红 / 硬上限压得住心跳 / 迟到续期不复活 / 不给策略=旧上界 |
| `packages/node-sdk/tests/node-run-cancel.spec.ts` | 10 | 立刻结算、signal 真翻、账本留痕、未知 runId 回 false、没账本不假成功、`runTimeoutMs` 形状闸 |
| `packages/node-sdk/tests/bridge-shell-runner-verbs.spec.ts` | 5 | `runner.getInfo` 有对面 / `cancelCurrent` 走对那一条（含 `cancel(undefined)` 的反例） |
| `packages/core/tests/host-route-run-timeout.spec.ts` | 5 | 服务端那道闸：心跳续期、到点 502、上限压心跳、没接线时退回固定上界、心跳只救 `runner.run` |
| `packages/ui-host/tests/document-host-run-timeout.spec.ts` | 4 | 面板那一层：40 秒的扫描活着拿到结果、一条帧都不来仍 30 秒红、声明 8 秒则 8 秒红 |
| `plugins/bitv/tests/cancel.spec.ts` | 5 | 开跑前中止不探文件、中途停在两处之间、取消后一个文件都不搬、不取消照常跑完 |

## 二、为什么这样设计

1. **超时模型用错了对象。** 对 `runner.run` 来说"应答在 30 秒内回来"不是上界而是误判：
   它等的应该是"这次运行还在动"。换成心跳之后，"在干活"永不误杀，"真卡死"
   （一段时间毫无事件）照样读得回来——包括不报进度的节点，它 `started` 之后就没有事件。
2. **两道闸必须读同一份策略。** 桥上有客户端与服务端两道等待闸（`bridge-document.ts` 与
   `host-routes.ts`）。只改一侧的症状与不改一模一样（面板还在等，路由先 502），
   所以上限的两侧都从 `NodeDefinition.runTimeoutMs` 现读，不各算各的。
3. **取消归账本，才有唯一真源。** 只有账本知道"这条 runId 此刻还在跑"，
   把它交给账本之后，"abort 信号"与"界面读到的那句已取消"是同一件事；
   取消也不再需要第二份 in-flight 表。
4. **不许把"没停下"说成"停下了"。** `race` 之后不理中断的节点仍会跑完，所以文案必须
   点明这一点（ADR-0011 决定 4）；`bitv` 这类真的在循环里查信号的节点才是干净停下。

## 三、与 DSH 的关系

- 桥的动词表没有新增：`runner.run` 的两个新参数都不上线（策略由 `runner.getInfo` 这条
  **已存在**的动词带回来，`args` 形状不变），所以 `xaihi.bridge/1` 的线上形状没动。
- `runner.getInfo` 此前被写成沿用 `unavailable`（`bridge-shell.ts:267` 旧行），
  那是本仓自己留的退化，不是 DSH 的能力缺口；这次按注入面兑现，与 DSH API 无关。
- 账本与它的事件流仍是本仓自己的（`docs/subsystems`：DSH 的主机→浏览器推送是白名单闭集，
  第三方事件进不去），所以心跳用的还是那条已经存在的 `/xaihi/operations/stream` 旁路，
  **没有开第二条 SSE**。
- 没有新增任何 DSH 面调用，因此不需要 proposal。

## 四、后续扩展（都没做，写在这里）

1. `runner.run` 若要把"这次运行叫什么"随调用带过去，得给桥上添一条动词（`BRIDGE_METHODS`
   里今天没有）。在此之前，心跳的认领沿用 `followNodeRun` 的已知上限：同一个节点被两处
   同时点着时，两条会互相续期。
2. 其余节点（`linedup` / `findz` / `sleept` …）还没在自己的循环里查 `signal`；
   框架这侧的行为已经完整（立刻结算 + 账本留痕），但"真的停下工作"要逐个节点接。
3. 界面上的取消按钮与"已取消/仍在继续"的读回样式没动（面板仍按现有的失败态渲染）；
   文案来自 `CANCELLED_MESSAGE`，接线是下一步。

## 五、验证口径（rc 与数字）

- `packages/node-sdk`：`npm run test:unit` → **17 文件 / 154 条全绿**（含上面 21 条新的）。
- `packages/core`：`npm run test:unit` → **14 文件 / 126 条全绿**（含上面 5 条新的）。
- `packages/bitv`：`npm run test:unit` → 5 文件 / 65 条，**62 绿 + 3 条既有红**
  （`tests/definition.spec.ts` 的夹具 `ctx` 没有 `inject`，而 `registerWithHost` 要用它；
  实测把 `packages/node-sdk/src` 整体退回 HEAD 后同样红，故不是本批引入）。
- `packages/ui-host`：`npm run test:unit` → 新文件 4 条绿；另有两个文件 11 条红
  （`local-runner-e2e` / `run-progress-wiring`，失败点是 `expected false to be true`
  的 `linedup/sleept/findz 没进 NodeRegistry`，同一次**退回 HEAD** 对照里照旧红）。
- 构建：`node-sdk` / `core` / `ui-host` 三个包 `npm run build` 均 **rc=0**，
  其中 ui-host 的 `check-client-bundle` 通过（单文件、无 Node 专用 require）。
- 未做：真宿主实机（需要重启宿主才读得到新产物）与终端面；这两处**没有**实机证据。
