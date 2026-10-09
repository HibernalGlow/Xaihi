# ADR-0022：长任务按心跳判活，取消归账本

- 状态：已采纳（2026-10-09）
- 相关：`packages/node-sdk/src/host-bridge.ts`、`bridge-document.ts`、`bridge-shell.ts`、
  `packages/core/src/host-routes.ts`、`packages/node-sdk/src/{operations,define-node,node-registry,node}.ts`
- 取代：`BRIDGE_REQUEST_TIMEOUT_MS` 作为 `runner.run` 唯一等待判据的那条隐含做法

## 背景

实机症状（2026-10-09，BitV 面板，扫描 `/Users/glow/Downloads` 递归）：

```
BitV 失败
timeout: runner.run 在 30000ms 内没有应答
```

看下来是三件事叠在一起，任何一件单独看都不像 bug：

1. **等待判据选错了。** 桥只有一个常量 `BRIDGE_REQUEST_TIMEOUT_MS = 30_000`，
   对 `config.get` 这种一次往返的动词是对的，对"扫一整个下载目录"就不是上界而是**误判**。
2. **两道闸读同一个常量。** 文档侧 `bridge-document.ts` 与路由侧 `host-routes.ts`
   各有一道 30 秒闸；只放宽一侧的结果是"面板还在等，路由先回 502"，症状一模一样。
3. **超时并没有截断工作，也没人能把工作停下。** 宿主侧 `caps.runner.run` 一直在跑，
   应答回来时 `pending` 里已经没有那条请求（`bridge-document.ts` 的 `receive`），
   结果被静默丢掉；而 `NodeRegistry.cancel` 是个无条件 `return false` 的桩。
   所以使用者看到的不是"被截断"，而是"报了个假失败，活还在干，结果没人收"。

## 决定

1. **`runner.run` 的等待判据是心跳，不是 wall-clock。**
   新增 `BRIDGE_RUN_IDLE_TIMEOUT_MS`（30 秒）：距**最后一次账本事件**超过它才算失败。
   文档侧由 `beginCall` 的 `renew()` 续期（挂点：`document-host.ts` 订阅运行账本那条旁路），
   路由侧由 `RunFace.onRunActivity` 续期。真卡死（一段时间毫无事件）照样读得回来，
   包括不报进度的节点——它连 `started` 之后就没有事件，一样会在 30 秒静默处红。
2. **节点可声明自己的硬上限：`NodeDefinition.runTimeoutMs`。**
   `0` = 明确不限；不写 = 不设硬上限（心跳兜底）；正数 = 硬上限，**心跳绕不过去**
   （否则"声明了却管不住"）。两侧读同一份真源：文档侧经 `runner.getInfo`（这一格此前被写成
   永远 `no-provider`，现在按注入面兑现），路由侧经 `RunFace.runTimeoutFor` 现读注册表。
3. **取消归账本（`OperationJournal.cancel`）。**
   `OperationRun` 多一条 `signal`，`AbortController` 由账本按 runId 持有：
   abort + 补一条 `failed`（原因"已取消"）是同一件事，界面读回的那句话与账本那一笔因此同源。
   桥上的 `runner.cancelCurrent` 修到它对的那一条（此前无条件走 `cancel(args[0])`，
   而这一格永远不带参数 ⇒ 实际是 `cancel(undefined)`）。
4. **取消必须立刻结算，且照实说没停下什么。**
   `defineNode` 用 `Promise.race([handler, abort])`：理会 `signal.aborted` 的节点自己停下，
   不理会的那一侧也立刻读到「已取消」，文案点明"该节点若没查 signal.aborted，工作可能仍在继续"。
   伪造"已经停了"（ADR-0011 决定 4）比不回话更糟。
5. **路由侧的三路竞态。** `createShellBridge.receive` 内部 `await evaluate(...)`，
   而 evaluate 对 `runner.run` 就是等那次运行跑完——原来先 `await receive` 再开计时，
   上界定时器**永远轮不到上班**（实测 40 秒的运行就要挂 40 秒 HTTP 响应）。
   现在应答 / "这条消息没被接住" / 到点三路竞态。

## 后果

- 不写 `runTimeoutMs` 的节点**行为不变地**获得心跳保护；写了 `0` 的（如 `bitv`）明确表示
  "按心跳判活"。这是一条**声明**而不是开关，读得回来（`runner.getInfo`）。
- 桥的缺省上界（`BRIDGE_REQUEST_TIMEOUT_MS`）只服务普通动词；`call()` 的形状与语义没变，
  既有测试（`bridge-roundtrip.spec.ts:117` 那条 50ms）仍是同一条断言。
- 心跳的认领规则沿用 `followNodeRun` 已写明的上限：桥只带 nodeId，同一个节点被两处同时点着时
  两条会互相续期。要精确对齐得让桥多一条"我这次运行叫什么"的动词，本次不做（记在此处）。
- `NodeRegistry.cancel/cancelCurrent` 现在回的是"中止键真的按下了"。处理器不理会信号时，
  那次运行在账本里仍是 `failed`，但它的工作可能仍在继续——这条不许在界面上被抹平。
