# Step 4（进行中）· 服务层第一批：运行账本与事件流

本文件按计划的四段式记录 Step 4 已落地的部分。4a 是对照表（`docs/service-mapping.md`），
4b 的第一件是 operation stream；checkpoint / 可恢复删除还没做，原因在文末"未做"。

## 1 改了什么

- `packages/node-sdk/src/operations.ts`（新）：`xaihi.operations/1` 的词表 —— 事件种类
  （`started` / `progress` / `preview` / `result_view` / `finished` / `failed`）、
  `ActiveRun`、`OperationRun`、`OperationJournal`、`OperationsSnapshot`，以及三条常量
  （服务名 `xaihiOperations`、`/xaihi/operations/stream`、`/xaihi/operations.json`）。
  包新增子路径导出 `@hibernalglow/xaihi-sdk/operations`。
- `packages/core/src/operations.ts`（新）：账本实现（seq 单调、事件与运行概要各自有上界、
  溢出可读出 `dropped` / `oldestSeq`）、SSE 路由 `operationsStreamHandler`、快照路由
  `operationsSnapshotHandler`。
- `packages/core/src/index.ts`：`provide = [OPERATIONS_SERVICE]`，`ctx.effect(() => ctx.provide(...))`
  挂上服务，注册两条路由。
- `packages/node-sdk/src/define-node.ts`：每次动作调用自动开一条运行（`started` →
  `finished` / `failed`），把句柄作为 `call.run` 交给实现；账本可以传实例也可以传取用器。
- `packages/ui-host/src/client/run-feed.tsx`（新）+ `workspace.tsx` / `styles.ts` / `locales.ts`：
  壳的状态栏渲染最近运行，`EventSource` 优先、失败退到快照轮询，退避状态如实显示。
- `plugins/linedup`：改用 `journal: () => ctx.get(OPERATIONS_SERVICE)`，并发出 `result_view`
  （它的定义早就声明了 `resultExport`，此前没人发）。
- `packages/create-xaihi-plugin`：生成物自带账本接法，并有断言守住。
- 新测试：`packages/core/tests/operations.spec.ts`、`packages/node-sdk/tests/define-node-operations.spec.ts`。

## 2 为什么这样设计

**为什么 Xaihi 有这件事**：DSH 的工具只有"一次调用的输出"，`ctx.emit` 是通用事件缝；
两者都没有"同一次运行的中间态流给面板订阅"。这不是我们能写得更好，而是词表里没这件事。

**为什么走 SSE 而不是别的**：DSH 唯一的主机→浏览器推送通道是 `ctx.remote.$on`，而它的
合法事件集是主机装配侧写死的数组（`dsh-api-remotes` 的 `API_REMOTE_FORWARDED_EVENTS`，
`lib/types/remote-events.d.ts` 里是一个 27 项的 `readonly [...]`），第三方事件加不进去——
文档原话是"forwarding one more event requires one entry in that array"。剩下的合法面是
`ctx.webServer` 的命名路由，而 `WebRoute.handler` 的文档注释就写着
"may hold the response open, e.g. SSE"。所以事件流走自己前缀下的路由，不碰 `/plugins`，
不改宿主。

**为什么还留一条快照路由**：桌面宿主不用这台 HTTP 服务器（web-server 文档原话：Electron
用 `file://` 加载产物，fetch 走 IPC 桥），长连接在那个形态下不保证可用。快照与流是同一份
账本的两个视图，字段同源，所以浏览器侧退化成轮询而不是退化成"没有回显"。传输方式在界面上
如实标出来（`data-transport`），不假装是实时。

**为什么账本按调用现取**：`ctx.provide` 的服务在 fiber 激活后可见，但插件与 core 谁先激活
不由插件决定。注册时读一次会在"core 后激活"的排布下永久读空，症状是"节点能跑但没有运行
记录"。所以 `defineNode` 接受取用器，每次调用现取；读不到且节点声明了 `reportsProgress`
时喊一次（只喊一次，否则每次调用一行日志）。

**为什么内存有界且把截断说出来**：v1 不搬持久化（见 §5），但一个不声明边界的缓冲就是
将来的内存事故。`maxEvents` / `maxRuns` 都有默认值，且快照里 `truncated` / `oldestSeq`
可读——读取方能区分"这段历史没有"和"我没拿到"。

**为什么浏览器只准从子路径取值导入**：这条是本步的门禁抓出来的。`run-feed` 一开始从
`@hibernalglow/xaihi-sdk` barrel 取常量，把 Node 侧的工具管线（连带 `@deepseek-ai/dsh-tools`
的 `node:module` / `url`）整个内联进了浏览器产物。purity 测试当时就红了，修法是 SDK 单列
一个 `./operations` 入口。类型导入不受影响（编译期擦除），值导入必须走子路径。

## 3 与 DSH API 的关系（读证）

| 用到的东西 | 出处 |
|---|---|
| `WebRoute.handler` 可以长挂响应（SSE） | `docs/subsystems/web-server.md`，`interface WebRoute` 的 handler 注释 "may hold the response open, e.g. SSE" |
| 重复 `(kind, path)` 抛错、exact→最长前缀→fallback 的匹配次序 | 同上，"Match order is fixed" 段 |
| `ctx.provide(name, value)` 的可见时机与自动收回 | `docs/cordis-api/context.md` "Register a service implementation owned by the current fiber … unregistered … when the returned disposer runs or the fiber unloads" |
| 插件元数据可以声明提供哪些服务 | `docs/cordis-api/registry.md` `Plugin.Base.provide?: string \| string[]` |
| `ctx.get(name)` 不必 `inject`，未提供返回 `undefined`；`strict` 默认只看 ACTIVE fiber | `vendor/cordis/src/reflect.ts:19`（`get(name: string, strict?: boolean): any`）、`:225-243` |
| 主机→浏览器事件通道是闭集，第三方进不去 | `docs/subsystems/typert.md`（`TypertClientRemote.$on` "selected by the Host assembly"）+ `@deepseek-ai/dsh-api-remotes` README "Its legal keys are exactly the Host assembly's forwarding selection" |
| 桌面形态不走这台 HTTP 服务器 | `docs/subsystems/web-server.md` 首段 |
| 浏览器侧禁止 import Node 侧模块 | 我们自己的门禁 `packages/ui-host/tests/purity.spec.ts`（基线 externals 表），本步由它抓出真实违规 |

## 4 后续扩展方式

- **节点报进度**：实现里 `call.run.progress({ done, total })` / `.preview(payload)` /
  `.resultView(payload)`，事件名不许自造（`OPERATION_EVENT_KINDS` 是唯一词表）。批次 C
  `dissolvef` 的递归枚举是第一个真需要 `progress` 的用户。
- **面板订阅自己节点的事件**：把 `useRuns` 提升为 `PanelProps.host` 上的订阅口，载荷
  （`preview` / `result_view`）交给定义里 `previewExport` / `resultExport` 指的渲染函数。
  这一步等批次 C，因为那时才有值得渲染的载荷形状。
- **持久化**：`OperationJournal` 已经是缝，落盘实现（检查点、回滚账本）接在 core 里，
  存储用 DSH 的 storage domain（见 §5），不改契约。
- **换传输**：`EventSource` 不通的宿主形态已经退到快照轮询；将来 DSH 若开放事件转发白名单
  （上游 proposal 候选），只换 `run-feed.tsx` 的取数方式。

## 5 对照表的两处实测更正（写进 `docs/service-mapping.md`）

1. `ctx.storage` 不是键值存储；插件侧的 typed 面是 `ctx.storageDomain.open(defineDomain(...))`。
   它在 0.2.0-rc.2 **有对应发布包**（`@deepseek-ai/dsh-storage-domain`、`@deepseek-ai/dsh-storage`
   的 `next` 标签都是 0.2.0-rc.2，`latest` 又是撒谎的 0.0.1-rc.1），但**不在默认 web/headless
   组合里**——我这台隔离宿主的 146 个包里搜不到 `dsh-storage-domain`。落 checkpoint 时按
   "往 profile 的 bundles 里加一行"处理，那是合法装配，不是 fork。
2. 运行历史不能用 `ctx.sessionPersistence`：它只持久化 `SessionEvent`，键是 SessionId，
   文档明说"no parallel persisted event type"。这条支持了对照表里"搬"的判定。

## 6 证据

命令的 rc 都显式打印。

1. `pnpm test` → `REAL_GATE_RC=0`；`check:pins` 通过；7 个工作区包（`packages/*` 5 +
   `plugins/*` 2）build 与 typecheck 全绿；单测 11 个 spec 文件、73 条用例全部实跑
   （core 37 / node-sdk 23 / ui-host 9 / create-xaihi-plugin 4），其中本步新增
   `operations.spec.ts` 与 `define-node-operations.spec.ts`。
2. 隔离宿主重启（先 `kill` 旧实例）→ `pnpm plugin:install` `ISO_INSTALL_RC=0` →
   `pnpm host` 起在 `http://127.0.0.1:3199`（隔离 `DSH_HOME`，不碰日常 profile）。
3. `GET /xaihi/operations.json` → `HTTP=200`、`content-type: application/json`、
   `{"schema":"xaihi.operations/1","seq":0,"oldestSeq":0,"truncated":false,"kinds":[…6 项…],"runs":[]}`。
4. `POST /xaihi/operations.json` → `HTTP=405`。
5. `curl -N /xaihi/operations/stream?since=0` → 连接挂住并立刻收到
   `event: hello` + `data: {"schema":"xaihi.operations/1", … "replayed":{"count":0,"firstSeq":0} …}`，
   证明确实是"长挂响应"而不是普通请求-响应。
6. 浏览器实机：侧栏 "Xaihi 工作台" → `.xaihi-shell` 出现，`nav` 两项
   （行去重过滤面板 / Hello 面板），状态栏 `2 已加载`；此时 `.xaihi-feed` 不存在
   ——**没有运行就不画回显**，这是期望行为而不是缺件。
7. 顺带证实的一条设计：`main` 面板选中后 DSH 的会话输入框整体卸载（`[contenteditable]`
   查询为空），即 D11 的"半接管"是真的接管而不是叠一层。

### 未证与原因

- **一次真 agent 调用产生一条运行**（以及浏览器里看到它跳出来）：做不到。隔离
  `DSH_HOME` 里没有模型凭据，web 宿主弹"添加一个 API Key 开始使用"，`dsh --help`
  也没有直接调工具的子命令，环境里没有 key 变量。这是隔离换来的必然代价，不是代码缺陷；
  需要使用者往 `.scratch/dsh-xaihi-home` 里放一份 key（或告诉我可以临时读用日常 home 的
  凭据）才能补这两条。
- **实时推送在浏览器里的观测**：单测覆盖了"连接后的新事件会被转发"，浏览器侧目前只证到
  "连接 + 握手 + 空态"。补齐同上，卡在同一条 key 上。

## 7 明确没做

`preview` 的渲染、`result_view` 的渲染函数（等批次 C 的载荷形状）、checkpoint / 运行历史
落盘（需要先给 profile 加 storage 行）、可恢复删除账本、Material You 桥与 UI Kit、
`.dsh/skills`。
