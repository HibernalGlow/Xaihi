# 给 DeepSeek Harness 的上游提案

规则：确认 DSH 不支持的设计**只提案不 hack**。每条都带实测证据（file:line 或实机输出），
并且写清楚"我们现在怎么绕开的"——通常是退化成可见失败，而不是自建一套。

## P1 · 让插件客户端能在"当前 Agent"上执行命令

**现状实测**（0.2.0-rc.2，隔离宿主 `DSH_HOME=.scratch/dsh-xaihi-home`，profile `xaihi`）

- 生成的客户端代理签名（`@deepseek-ai/dsh-commands/lib/typert.remote-client.d.ts`）：

  ```ts
  'commands/execute': (
    agentId: SessionId,
    line: string,
    submittedAttachments: readonly CommandSubmitAttachment[],
    signal?: AbortSignal,
  ) => Promise<RemoteResult<CommandExecution | undefined>>
  'commands/list': (agentId: SessionId) => Promise<RemoteResult<readonly CommandDescriptor[]>>
  ```

- 客户端必须自己给 `agentId`。实机：`execute(line)` → `expected 3 business argument(s)
  plus an optional AbortSignal, got 1`；`execute(undefined, line, [])` →
  `gateway/arguments-invalid {endpoint:"commands/execute"}`。
- 但**没有任何公开的客户端 API 能读到"用户现在看的是哪个会话"**：
  - 读 `ctx.remote` / `ctx.get('remote').commands` 都抛
    `cannot get property "remote.commands" without inject`（要显式 inject `remote` 与
    `remote.commands`，与 `docs/api-gateway.md` 的说法一致）；
  - `dsh-client-ui-agent-preset` 里唯一叫 `currentSession` 的东西是
    `AgentPresetSeatController` 的 **private** 字段；
  - `dsh-client-ui-session` 暴露的是 `sessionStatus` 之类按会话键控的 observable，
    没有"当前"这一个；
  - `remote.hostFacts` 只有 `{isLoopback:true}`；`remote.namespaces` 读到空集合；
  - URL 不带会话（SPA，`location.href` 就是 `http://127.0.0.1:3199/`）。

- 运行时方法表（补测，读自同一台宿主的 observatory `__XAIHI__.remote`）：生成的代理**自身
  arity 全是 0**（`list` 与 `execute` 都是 rest 包装），所以 arity 不能当契约用；真正说话的
  是网关 —— `commands/list()` 回
  `client api: commands/list expected 1 argument(s), got 0`，**连读路径也要 `agentId`**。
  `remote.commands` 上 `has` arity 2、`install` arity 3、`invokeRemote` arity 4。
- `remote` 一侧的调用入口：`invoke` / `invokeSelected` / `prepareInvocation` 都是 arity 6，
  `invokeMethod` / `openRemoteStream` arity 4，`enqueue` arity 1。按
  `invokeSelected('commands', 'list', [])` 试一次（纯读）的结果是
  `TypeError: Cannot read properties of undefined (reading 'invoke')` —— 它实际读的第四个
  实参没有任何文档说明，Xaihi 不去猜：猜出来的调用等价于自建 RPC。
- "当前会话"能否从别的服务拿到：把 `agent`、`agentId`、`session`、`sessionId`、`sessions`、
  `activeSession`、`scope`、`store`、`chat`、`conversation` 十个名字逐个 `ctx.get()`，
  **全部 `absent`**。这条测量常驻在 `__XAIHI__.remote.identity`，不必再手工复现。

**为什么这是缺口**：命令通道的语义本来就是"给某个确切接收方"，主机侧的
`CommandRuntime.list(agent)/find(agent,name)/execute(agent,line,signal)` 全部自带 agent，
唯独客户端这侧要调用方自己填，而"当前是哪个"只有 UI 装配知道。结果是：
**第三方面板可以有按钮，但按不动**。

**建议的最小改法**（任一条即可，越靠前越省事）

1. 在客户端上下文暴露只读的"当前会话 id"（例如 `ctx.uiSession.activeId`，或
   `remote.hostFacts.sessionId`）——不需要给写权限。
2. 或者提供 `ctx.remote.invokeSelected('commands','execute', line, attachments)`：
   名字已经在代理上（实测 `hasInvokeSelected: true`），但它现在的入参形状对第三方不可猜：
   传 `('commands','execute', line, [])` 与 `('commands/execute', line, [])` 都炸在
   `Cannot read properties of undefined (reading 'invoke')`。给它一行文档或一个类型就够。
3. 或者允许业务包挂自己的 `@Remote` 命名空间（现状是 `dsh-api-remotes` 的构建期显式
   import 列表决定，第三方进不去）。

**我们现在的绕法**：`PanelHost.runCommand` 在拿不到身份时**如实失败**，错误文案直接指向
这一条（`packages/ui-host/src/client/index.ts`）。不自建 `/xaihi` 执行路由，因为那会绕开
宿主的分派语义与危险闸门。

## P2 · 插件自带静态资源的目录托管

`/plugins/<pkg>/client.js` 与 `client.<chunk>.js` 之外的文件路径拿不到公开 URL，
所以 Xaihi 自开 `/xaihi/remotes/<slug>/<rev>/<file>` 前缀服务插件产物。功能上我们已解决，
这条属便利项：宿主若原生支持"插件包内任意白名单后缀"，我们可以删掉自己的路由。

## P3 · boot 期默认选中某个 main 面板

`ctx.layout.selectPanel` 是运行时入口，没找到启动期的钩子；现在只能面板内首帧自选调或
使用者手点一次。

## P4 · 槽渲染的 Suspense / 按条目懒加载

`packages/client/web-react/README.md:19` 明说 `renderSlot` 是唯一渲染形式、无 Suspense
集成。Xaihi 已在壳内自己扛异步边界（骨架 → 落定换组件 → 失败给原因 + 重载），
所以这条是"能做就更干净"，不阻塞。
