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

**范围缩窄（2026-10-06 复验）**：宿主其实已经开了一条图片通道 —— `package.json#icon`
（`@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:15`：SVG/PNG/JPEG/WebP、相对清单目录、
≤256 KiB、realpath 解析后仍须在目录内），读出来以 **base64 data URL** 的形式进展示 DTO
（同文件 `:49-50`；wire 侧 `@deepseek-ai/dsh-plugin-manager/lib/typert.host.js:90,119,137,155`）。
所以本提案**不再包含图标**，只剩两件事：(1) 任意的非图标静态资源需要一个公开 URL
（图标那条给的是内联 data URL，不是可引用的 URL）；(2) 展示端之外还有没有别的目录能按路径取。
渲染端我们没实机验到（在桌面宿主 app 包里），所以这条也只当"已存在的能力"记录，不当已用能力。

## P3 · boot 期默认选中某个 main 面板

`ctx.layout.selectPanel` 是运行时入口，没找到启动期的钩子；现在只能面板内首帧自选调或
使用者手点一次。

## P4 · 槽渲染的 Suspense / 按条目懒加载

`packages/client/web-react/README.md:19` 明说 `renderSlot` 是唯一渲染形式、无 Suspense
集成。Xaihi 已在壳内自己扛异步边界（骨架 → 落定换组件 → 失败给原因 + 重载），
所以这条是"能做就更干净"，不阻塞。

## P5 · 产品文档可申请原生窗口（含 `window.open` 归属）

**实测**（`master` @ 5badb150 / tag `dsh-v0.2.1-alpha.1`，2026-10-06 现读，全部 file:line）

- `apps/desktop/src/main.ts:206` 定义 `createWindow(preload, show, primary)`，全仓唯一调用点在
  `main.ts:1066`（`primary=true`）。欢迎窗、更新遮罩、强制更新窗、授权测试窗各自另有
  `new BrowserWindow`，但没有一条路径是由产品文档发起的。
- `main.ts:239-242` 把主窗口的所有 `window.open` 判成 `{action:'deny'}`，http(s) 甩给
  `shell.openExternal` ⇒ 插件面板要"再开一个窗"，结果只会是**系统浏览器的一个窗口**，
  拿不到原生窗、原生菜单与 tray 归属。
- `apps/desktop/src/ipc.ts:8-34` 的 25 条通道里没有任何 window 动词；对外接口
  `DshDesktopProductApi`（`ipc.ts:72-87`）只有 `browser / keyboard / shortcuts / deviceInfo / updates`。
- `assertDesktopSender`（`ipc.ts:97-104`）只允许 `dsh-app://` 的白名单 hostname 走 IPC，
  所以"插件自己找路子开"这条路也不存在——这是有意的设计，不是漏了。

**为什么是缺口**：一个工作台型产品天然要"把某个面板/某次运行拎到旁边那块屏上"。现在的形状下
第三方只能把内容塞进宿主唯一那份文档，尺寸与可见性都被主窗绑住。

**建议的最小改法**：给产品文档一条受控的开窗动词，例如
`desktopApi.windows.open({ url, features })`，其中 `url` 必须落在**同一个已认证宿主 origin** 下
（复用 `ipc.ts:97-104` 的 sender 校验，不要新造信任边界），`features` 只接受尺寸/位置一类；
`setWindowOpenHandler`（`main.ts:239-242`）对这种请求改成 `allow`，其余照旧 deny。
子窗生命周期、关闭确认、任务中断检查可以沿用 `quit-inspection` 那一套（README 里"每次退出先问宿主"）。

**我们现在怎么绕开**：不绕。原生多窗这一格在 Xaihi 里显式空着，由**同级独立仓**自己出壳实现
（`docs/adr/0011-desktop-shell-is-a-sibling-vendor-repo.md`），官方桌面端与 `dsh web` 下
Xaihi 只有主窗一条腿、并且界面能读出"这是单窗形态"。本提案落地后那条 patch 就撤。

## P6 · 桌面端 profile 可选 / guest 允许宿主 origin 的具名路由

两个方向都封着（同一批 file:line）：

- **Electron 侧写死**：`apps/desktop/src/paths.ts:19-20` 固定 `join(dshHome,'profiles','desktop')`，
  `main.ts:98/320` 调用 `resolveDesktopPaths()` 时不传参；`apps/desktop` 里出现的 44 个
  `DSH_DESKTOP_*` 变量（APP_ID / NODE_BINARY / NPM_REGISTRY / PRIMARY_RUNTIME_DIR / USER_DATA_DIR /
  DSH_DIR …）**没有任何一个**能改 profile 名。能改的只有 `DSH_HOME`（`scripts/dev.ts:66`）。
- **CLI 反向封禁**：`apps/cli/src/args.ts:84-85` `error: profile "desktop" is managed exclusively
  by the Electron application`；`args.ts:143,195` 的 `manageDesktopProfile` 只对桌面端自己安装的
  carrier 放行；`apps/cli/src/plugin.ts:10-12` 要求"先开一次桌面端把 profile 初始化出来，
  然后完全退出"。⇒ npm 装的那条 `dsh` 既不能 boot 也不能写 `profiles/desktop`。
- **内嵌 guest 挡住宿主 origin**：`apps/desktop/src/browser-guests.ts:29` 的租约模型本来支持多个
  `<webview>` guest（每 workspace 一份分区），但 `configureSession`（:141-146）关掉全部权限与下载，
  `isHostRequest`（:164-168）按 **端口 + hostname** 拒绝宿主 ⇒ 不能拿 guest 跑第三方产品自己的文档。

**建议的最小改法**（任一条就够，越靠前越省事）：

1. `DSH_DESKTOP_PROFILE`（或 `--profile`）允许把桌面端指向 `profiles/<name>`，默认仍是 `desktop`。
   独占语义不用改——只是把那个名字变成可配。
2. 或者给 guest 开一条**按路径前缀**的例外：允许宿主 origin 下由插件自己声明的具名路由
   （Xaihi 侧是 `/xaihi/*`），其余照旧拒绝。这样"多份独立文档"在现有单窗壳里就能做，
   也就不需要 P5 的开窗动词。

**我们现在怎么绕开**：不绕。多窗与"自己的文档"两条都在 Xaihi-Desktop 那侧自己实现，
本仓不往 `profiles/desktop` 写任何文件（见 ADR-0011 决定 4 的降级铁律）。
