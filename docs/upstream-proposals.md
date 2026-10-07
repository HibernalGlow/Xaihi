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

**我们现在怎么绕开**：官方桌面端与 `dsh web` 下不绕 —— 原生多窗那一格显式空着，界面读出"这是单窗形态"
（0006 之后连这句都印在文档页上）。自家壳在**本仓的 `desktop/` 那一层**以 submodule + patch series 实现
（`docs/adr/0011-desktop-shell-is-a-sibling-vendor-repo.md`；这一句原先写的"同级独立仓"已随 ADR-0011 的改判作废），
落地的是 0001/0002/0004/0005/0006/0007/0008 那几条：动词、纯 URL 判策、按 node 去重、发起者放宽、标题读回、
产品文档替被嵌帧转达，以及 0008 把 opener 放宽到产品文档（**这条让"被嵌帧开节点窗"不再需要新桥动词**）。本提案落地后这些 patch 就该撤。

## P8 · `window.open` 的发起者身份里没有"哪一帧"，preload 也不进子帧

这条不是"想要更多功能"，是**量出来的一条断路**（2026-10-07 在自家壳上实测，读数记在
`desktop/README.md` 的 0007 一节与 ADR-0011 那行）：

- Electron 44 的 `HandlerDetails`（`node_modules/.pnpm/electron@44.0.0/node_modules/electron/electron.d.ts:21990`）
  只有 `url / frameName / features / disposition / referrer / postBody` —— **没有发起那一帧的
  `WebContents`/`Frame`**。于是 `setWindowOpenHandler` 里能拿到的"发起者"只能是**窗的主帧 URL**：
  被嵌在 `<iframe>` 里的文档自己 `window.open(自家文档)` ⇒ 判策看的是宿主那份文档的 URL ⇒ 不通过 ⇒
  `popup=null` 且一个新窗都没有（实测 `createdCount: 0`）。`referrer` 理论上能带帧地址，但它受
  referrer policy 摆布，不能当安全主语用。
- 同一时刻，桌面端 preload 暴露的 `window.dshDesktop` **在子帧里是 `undefined`**（实测
  `typeof frame.contentWindow.dshDesktop === 'undefined'`）⇒ 被嵌的那一层连"经 IPC 问一句"也没有。

**为什么是缺口**：插件类产品的界面天生跑在宿主的 iframe/guest 里（DSH 自己的 `browser-guests.ts`
也是这个形状）。两条路同时封着的结果是：**iframe 内的内容没有任何办法请求一个原生窗**，
只能由外层页面替它转达 —— 而外层要转达就得自己带上目标地址，这就把"URL 由谁定"这条信任线
从"只有壳"挪成了"外层页面给、壳校验"（我们的 0007 就是这条路，且校验按自家路由形状收死）。

**现状与暴露面**：0008 已经把"被嵌帧开自家文档窗"这条路走通（opener 放宽到产品文档根/index.html，目标形状四条守卫不松，去重把上限收成节点数）⇒ 这条缺口现在只挡住"按发起帧精确判策"那一类需求，不再是开窗的阻塞项。

**建议的最小改法**：`HandlerDetails` 里给发起帧一个稳定身份（例如 `frame: ElectronFrame` 或
`initiator: { url, frameId }`），让 handler 能按**发起帧**判策略；或者给 `webPreferences` 一个
"把 preload/`contextBridge` 面暴露给指定 origin 的子帧"的开关。任一到位，0007 那条"外层转达 +
显式路径"就可以退回"帧自己发起、URL 仍由壳改写"的更窄形状。

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

**我们现在怎么绕开**：本仓 `desktop/patches/dsh/` 自己实现——0001（开窗动词）、0002（URL 判策）、
0003（`XAIHI_DESKTOP_PROFILE`，即本提案第 1 条的形状，缺省仍是 `desktop`，坏形状直接抛）。
官方桌面端与 `dsh web` 下这三格都读不到，Xaihi 侧必须探测后走可见退化（ADR-0011 决定 4）；
本仓也不往官方那份 `~/.dsh/profiles/desktop` 写任何文件。上游接了哪条，对应 patch 撤哪条。

## P7 · 设置标准面缺"每节点配置的版本历史与预设"

上游的节点界面普遍带一份"这份配置的第几版、改回去了、存个预设"的能力，形状是
`NodeConfigCapability` 的 18 个成员（搬运源仓 `packages/contract/src/index.ts`，`get` / `save` /
`getPresets` / `createPreset` / `updatePreset` / `deletePreset` / `getVersions` / `inspectVersion` /
`restoreVersion` / `exportConfig` / `importConfig` / `createBackup` / `getHistoryRepository` /
`setHistoryRemote` / `syncHistory` / `getUi` / `saveUi` / `openFile`）。

DSH 0.2.0-rc.2 的设置标准面只有五个动词（实测
`@deepseek-ai/dsh-api-settings-controller/lib/types/index.d.ts:49-85`：
`describe` / `update` / `replace` / `mutate` / `openSettingsDocument`）。
对下来 **13 条没有对应物**：预设那四条、版本历史与检查/恢复那四条、备份、导出/导入、
以及仓库远程的读/写/同步三条。

**为什么这条值得上游做而不是我们自建**：按 ADR-0013，配置只有一个出口就是这条标准面；
我们自己长一份"版本历史存储"等于在同一份配置下面挂第二个真源，
而那份历史既进不了使用者的设置文档，也拿不到宿主的 `SETTINGS_CONFLICT` 语义。
现在我们的做法是把这 13 条在握手时**如实报 `no-provider`**（`packages/node-sdk/src/host-bridge.ts`
的 `SHELL_SERVED_METHODS` 与 providerOf 那张表，钉在 `packages/node-sdk/tests/host-bridge.spec.ts`），
界面上那格显示成退化状态——能跑，但节点原有的"撤销这次配置改动"就没了。

**建议的最小改法**（任一条就够，越靠前越省事）：

1. 给 `update` / `mutate` 那条路加一层**可选的命名空间历史**：`history.list(ns, {limit})` /
   `history.inspect(ns, revision)` / `history.restore(ns, revision)`。revision 已经在冲突语义里存在
   （`expectedRevision`），把它升成可查询的历史比新增一套概念便宜。
2. 或者允许插件在自己的 ns 下挂一个**有名字的子文档**（预设就是这种东西：一串值 + 一个标签），
   由宿主持久化，这样"预设/备份"就都是同一份子文档表上的行。
3. 或者明说"版本历史与预设属于业务包"并给一条**规定的存储面**（storage domain 是现成的），
   那我们照第 2 条自己实现并把它写进 ADR-0013——现在缺的正是这句"可以自己存"的明文。

**我们现在的绕法**：不绕开标准面去自建第二份配置存储；那 13 条在桥的握手里以
`no-provider` 露出，界面上是可读回的退化状态（ADR-0011 决定 4 的降级铁律）。

**2026-10-06 在真宿主里补的三条读数**（独立 home + 端口 3399，父页 = DSH 客户端，
调用从 Xaihi 文档里穿过 `xaihi.bridge/1` 落进 `ctx.remote.settings`，所以这三条同时也是桥的读数）：

| 试的东西 | 结果 | 这条为什么重要 |
|---|---|---|
| `settings.update` 写我们**自己声明过**的 ns（`xaihi-core`，字段 `verbose`） | **成功**，97 ms，回来的 `SettingsNamespaceView` 带着该 ns 的 schema 与 `value` | 标准面确实能当持久出口用，不是只读装饰 |
| 写一个**没声明的 ns**（`xaihi`、`no-such-ns`） | 拒：`settings/rejected: No configurable plugin entry "…"` | 名字表就是这道闸；我们的 ns 只能从 bundle 的 config schema 长出来 |
| 在**已声明的 ns 里写一个没声明的字段**（`__xaihi_probe_unknown__`） | 拒：`settings/rejected: Config field "…" is not volatile` | **这条定住了"节点数据能不能借设置面存"**：字段必须事先在 schema 里声明成 volatile，任意 JSON 塞不进去。要拿设置面当 `state.getData/patchData/replaceData` 的落点，就得先在本仓的 config schema 里声明一个装得下节点数据的 volatile 字段（形状是"每个节点一份 JSON"），而那件事属于 ADR-0013 的边界决定，不是桥这边可以顺手做的 |

推论与**当天就把出路①跑通的那一步**（同一次实测之后）：本包 `Config` 里加了一个
`nodeState: Schema.dict(Schema.string()).default({}).volatile()`（键=节点 id，值=那份状态的 JSON 文本），
然后在端口 3399 那台宿主上从文档里穿桥写了一遍，读数：

- 写**成功**，值按节点 id 分格落进 `profiles/xaihi-realm/cordis.patch.yml` 的用户层
  （`nodeState: { xaihi-probe-node: '{"hello":1,"n":42}', xaihi-state-node: '{"marked":"across-restart"}' }`）；
- **重启宿主之后仍读得回来**（`state.getData('xaihi-probe-node')` 回的是上一个进程写的那一份）⇒ 这是真持久，不是缓存；
- 两格同时在场 ⇒ 路径级 `mutate` 各写自己那一段，第二个节点窗口的写不会盖掉第一个；
- 握手随之从 `refused=[state]` 变成 `granted=[contract, state, config, env]`，界面上那句
  `必给却没兑现：state` 消失（这条读数是这把尺的判据，它先红后绿）。

所以这条提案剩下的部分不是"能不能存"，而是**存得对不对**：节点状态今天寄存在配置文档里，
它因此会跟着配置一起被备份/导入/导出，也会被 `SETTINGS_CONFLICT` 那套版本号管着——
这对"每个节点一小份 JSON"是够的，但对大的、二进制的、要历史回溯的状态不合适。
第 1、2 条建议（命名空间历史 / 有名字的子文档）要的还是那两件事，请不要因为上面这段跑通了就撤掉。

## P9 · 桌面端把宿主凭证只发给主窗那一个 webContents，次级窗拿不到任何带作用域的 Peer

这条也是**量出来的**，不是推测（2026-10-07 08:5x—09:0x，自家壳上同刻逐窗对照；逐条读数与 file:line 记在
`../docs/adr/0011-*.md` 的路线行）：

- 桌面壳给网关流面（`ws://127.0.0.1:<port>/api/remote.mux`）附加凭证的那条 hook 写死了主窗：
  `apps/desktop/src/main.ts:1008` 判 `details.webContentsId !== mainWindow?.webContents.id` 就
  `callback({})`；只有主窗那一份被改写成 `origin: target.origin` + `cookie: hostCookie` +
  `sec-fetch-site: same-origin`（`:1011-1018`）。
- admission 只有两档：`packages/client/connection/src/rpc-host.ts:104-113` —— 过了 Host/Origin 闸
  **并且** `browserAuth.isAuthenticated` 就整块发 `operator` Peer，**没有**按 origin/按窗的中间档。
- 实测三条：① 壳开出来的次级窗里 `window.dshDesktopBoot.ready()` **成立**，`keys=["injections","streamBaseUrl"]`、
  `streamBaseUrl=http://127.0.0.1:19387`（那个动词来自 `apps/desktop/src/preload-app.ts:104-107`，
  sender 闸只按 hostname `app` 放）——门牌读得到；② 同一个窗里 `new WebSocket(.../api/remote.mux)`
  **握手失败**（`readyState:3`）；③ 同一时刻主窗跑同一段代码 `opened:true`。差别只在 webContentsId，
  不在 CSP、不在网络。
- 顺带澄清一条容易搞错的：**同源不等于同通道**。`protocol.handle` 把 `dsh-app://app` 下非静态路径转给
  Host（`apps/desktop/src/main.ts:761-776`），但 `GET /api`、`GET /api/remote.mux` 与编出来的路径
  在两只窗里都 **404** —— 那个 origin 从来不是 RPC 通路。自家服务面（`/xaihi/*`）反倒在任何 `app` 窗里都通
  （`live-check` F 段把它钉成判据了）。

**为什么是缺口**：ADR-0009 要的形态是"每个节点有自己的原生窗"，而那些窗里的内容需要宿主服务面。
今天的形状下它们一条路都没有：要么界面只在主窗里渲染，要么插件**自己再实现一层服务端语义**
（我们正被推到这一档）。把凭证原样放宽给所有窗**不是**修复 —— 那是把 operator 范围发给任意同 origin
文档（包括第三方 bundle），是安全退化，不是便利。

**建议的最小改法（任一即可，按优先级）**：
1. 那条 hook 按"**壳自己创建并登记过的 webContents**"发凭证，而不是硬编码 `mainWindow`；
   改写 `origin`/`sec-fetch-site` 的形状保持不变。
2. 或者给 admission 一个**带作用域的 Peer**（按 origin 或按登记过的能力集授权，能力清单是白名单而不是
   整块 operator），使次级窗最多只能问到被明确授予的那几组方法。
3. 或者**明确文档化**"次级窗不得访问宿主 RPC"。那我们就不必再把它当一条潜在路去试——今天已经把
   它当事实写进 ADR 了，但"上游本意如此"与"上游还没想到这一层"读起来不一样，值得写清。

**现状与暴露面**：`desktop/patches/dsh/0001–0016` 只解决"开得出窗 + 窗能问自家服务 + 退化读得回来"，
桥仍然只在产品主窗那一侧。路线选择（服务侧自己实现 host 语义 vs 壳内中继）记在 `desktop/README.md`
的交接一节，等使用者拍。
