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
   它**已经在默认组合里开着**：隔离宿主的 loader 行里 `storage` / `storage-json` /
   `storage-domain` 三行分别指向 `@deepseek-ai/dsh-storage{,-json,-domain}` 且
   `disabled=false`。我中途根据 `ls node_modules/@deepseek-ai` 判过"没装"，那是**把包目录
   当运行时**的错判，已按 loader 行改正：落 checkpoint 直接用 `ctx.storageDomain`，
   既不加 bundle 行也不自己写 JSON 文件层。同一份行表还确认了 `subprocess` →
   `@deepseek-ai/dsh-subprocess-local`、`approval` → `@deepseek-ai/dsh-user-approval`
   （所以危险动作的 `ask` 真的有出口）、`commands` → `@deepseek-ai/dsh-commands`。
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
落盘（用 `ctx.storageDomain`，组合里已有，见 §5）、可恢复删除账本、sleept 的电源方案读写、
Material You 桥与 UI Kit、`.dsh/skills`。

## 8 批次 B：sleept（macOS 与 Windows 同期）

### 改了什么

新包 `plugins/sleept`（**由 `create-xaihi-plugin` 生成后填充**）：

- `src/platform.ts`：平台差异的唯一落点，纯函数。`planCommand` 出 argv，`parse*` 读输出。
  mac ①`pmset -g custom` / `-g assertions` ②`caffeinate -di [-t 秒]` ③`pmset sleepnow`；
  Windows ①`powercfg /query SCHEME_CURRENT SUB_SLEEP {STANDBYIDLE,HIBERNATEIDLE}` +
  `reg query ... HibernateEnabled` ②PowerShell `SetThreadExecutionState(ES_CONTINUOUS|ES_SYSTEM_REQUIRED)`
  长驻子进程 ③`SetSuspendState` 的 PInvoke（真睡眠）/ `rundll32 ...,1,1,0`（休眠）。
- `src/exec.ts`：`createRunner`（一律经 `ctx.subprocess`，不自建 spawn）与
  `createInhibitor`（持有 / 解除 / 到期自己落回未持有 / 起不来时绝不报"已阻止"）。
- `src/index.ts`：`inject = ['tools','subprocess']`，四个动作经 `defineNode` 变工具，
  `danger.actionIn dangerous:['sleep']` → 睡眠这一步走 DSH 的 `ask`；卸载时 `ctx.effect`
  放掉拦截。
- `tests/fixtures/*`：六份**真机抓取**的输出，两份 Windows 分别留了 UTF-8 与 GBK 原样。
- `tests/platform.spec.ts` + `tests/exec.spec.ts`：22 条，含三条阳性对照。

### 为什么这样设计

- **②③在两平台是两套语义**，同期做才证明 `xaihi.node/v1` 的平台分支是真抽象：
  "阻止休眠"两边都归成"养一个子进程，杀掉就归还"，所以生命周期代码只有一份。
- **Windows 的休眠歧义按测到的事实处理**：这台盒子 `HibernateEnabled=0x1`，正是
  "要求睡眠结果去休眠"的那个经典坑；真睡眠因此走 `SetSuspendState(hibernate=false,...)`
  的 PInvoke 而不是 rundll32；反过来要求休眠但系统关了休眠时**抛原因**，因为那条命令
  会返回 0 却什么都不做。
- **状态里刻意没有 pid**：0.2.0-rc.2 真正发布的 `SubprocessHandle` 不暴露 pid
  （`docs/subsystems/subprocess.md` 写了 pid，是文档与发布物的漂移，以
  `@deepseek-ai/dsh-subprocess/lib/types/types.d.ts` 为准）。要知道"谁在拦"就读
  `pmset -g assertions`，那是操作系统说的话。
- **危险面只有一个出口**：本包不实现审批、不自带确认框，只把 `ask` 交给宿主
  （`approval` → `@deepseek-ai/dsh-user-approval` 在组合里开着，所以 `ask` 有真出口）。

### 与 DSH API 的关系（读证）

- `SubprocessSpawnSpec` 完全显式（`argv`/`cwd`/`stdio` 每条都要给处置、`graceMs` 必填、
  `argv` 永不经 shell 解释）：`docs/subsystems/subprocess.md` "The fully-explicit spawn spec"。
- `terminate()` 是这条缝唯一的终止动词且是**树级**的（POSIX 打进程组、Windows 走
  `taskkill /T`）：同文档 SubprocessHandle 段——这正是"宿主退了、拦截进程还活着"的解药。
- `ctx.get(name)` 不需要 `inject`、未提供返回 `undefined`：`vendor/cordis/src/reflect.ts:19,225-243`。

### 测出来的两条平台约束（要写进 `xaihi-migration` 技能）

1. `powercfg` 的输出**标签是本地化的**（这台盒子 zh-CN：`当前交流电源设置索引`），解析只能
   依赖 ASCII 别名 token、GUID 形状与 `0x` 值的**位置**；测试里同一份内容换成英文标签也必须
   解析得出，才算守住这条。
2. 控制台**编码不可假设**：`powercfg /availablesleepstates` 直接经 SSH 拿回来是 GBK 字节
   （夹具 `windows-availablesleepstates.gbk.txt` 原样保留）。任何"读文字"的判据在那一刻都会
   变成乱码，所以状态判断只认十六进制与 ASCII。

## 9 批次 B 的证据

1. 门禁：`pnpm test` → `GATE_RC=0`；build / typecheck 全绿；13 个 spec 文件、97 条用例
   （core 39 / node-sdk 23 / sleept 22 / ui-host 9 / create-xaihi-plugin 4）。
2. 夹具不是过拟合：重跑一次 `pmset -g custom` 与 `-g assertions` 现读现解析，得到与夹具
   推出的同一份结果（AC 600/600/mode 3、Battery 900/600/mode 3；4 个持有者，第一个
   `Vorssaint` pid 1984）。
3. Windows 证据来自 `ssh 30902@100.122.176.77`（PTEROSAUR / Win11，只读查询）：
   `HibernateEnabled REG_DWORD 0x1`；`STANDBYIDLE` 的 AC/DC 都是 `0x00000000`；
   `HIBERNATEIDLE` 的 DC 是 `0x7fffffff`（这条同时证明"0 与 0x7fffffff 不是一回事"）。
4. 装载链：`pnpm plugin:add file:$PWD/plugins/sleept` → `ADD_RC=0`；`pnpm profile:dump` →
   `DUMP_RC=0` 且 `xaihi-core / xaihi-hello / xaihi-ui / xaihi-linedup / xaihi-sleept` 五行齐全；
   第五项由 DSH 自己的 reconciler 写进 `dsh.profile.bundles`（不是我手改的）。
5. 发现面：`/xaihi/debug.json` → `locate errors: []`、`problems: []`、
   `registered: [hello, linedup, sleept]`；三条子路径行归进 `subpaths` 而不再被报成
   "定位失败"（顺手修掉诊断噪声，配 `isSubpathSpecifier` 两条测试）。
6. 浏览器实机：侧栏三项（行去重过滤 / **休眠管理** / Hello），点进休眠管理面板渲染出
   "休眠管理面板（待填）"，`window.__XAIHI__.modules` 里 `sleept/Panel` 的
   `sameReactAsHost=true`、`reactVersion 18.3.1` —— **脚手架生成的包**第二例走通全链。

### 批次 B 未证与原因

- 四个工具被**真 agent 调用**：缺模型凭据，同 §6 那一条。
- ③「立即睡眠/休眠」的**真实触发**：按计划条款需要使用者当场说"跑"。默认只做到
  "计划出的 argv 正确 + 危险闸门把它变成 `ask`"。附带一条没测的：macOS 上 `pmset sleepnow`
  是否需要管理员权限——跑它本身就会睡，所以没跑。

## 10 耐久运行账目（checkpoint / history 的落地）

### 改了什么

- `node-sdk`：`RunRecord` / `HistorySnapshot` / `HISTORY_SCHEMA='xaihi.ledger/1'` /
  `HISTORY_SNAPSHOT_PATH='/xaihi/history.json'` 进契约（浏览器读回不许依赖 core 的 Node 模块）。
- `core/src/history.ts`：用 DSH 的 storage domain 声明 `xaihi_runs` 域（`defineDomain` +
  `domainTable` + zod），`openLedger` 给出 `RunLedger`（`durable` / `reason` / `append` /
  `list` / `close`），拿不到缝时退化成内存账本并把原因带在响应里；`historyHandler` 是路由。
- `core/src/index.ts`：订阅事件流，在 `finished` / `failed` 时落一条记录（含该运行的事件条数）；
  注册 `/xaihi/history.json`；卸载时关域。
- `core` 依赖新增 `@deepseek-ai/dsh-storage-domain@0.2.0-rc.2` 与 `zod@4.6.5`（都是精确钉版，
  check-pins 覆盖前者）。
- `discover` 顺带带出 `services`：Xaihi **可选**使用的宿主服务是否真解析到了实现。
  这是回读路径，不是日志——"检查点没存"必须能被区分成装配问题与代码问题。

### 为什么这样设计

- 存储**不自己造**：DSH 的 `ctx.storageDomain` 就是"非会话事件的持久化"这件事的正解
  （`storage.md:5`），运行账目是域概念但落盘是通用能力。
- `RunRecord` 不留可选字段：没有就写 `''` / 0。JSON 里"字段缺失"与"值为空"混在一起时，
  读回方无法区分"这条记录没说"和"这条记录说了没有"。
- `checkpoint` 字段先占位为空串，载荷形状等批次 C（`dissolvef` 的 legacy undo 就是它的活样本）；
  现在发明一个没人用的载荷 schema 就是给将来的人添堵。
- 退化路径要**可读出**而不是不可用：`durable=false` + `reason` 出现在正常响应里，
  所以"这台宿主没有存储缝"是一个能被观察到的状态，而不是一个静默的行为差异。

### 测到的三条文档没写的约束

1. `defineDomain` 在 import 时就拒绝带连字符的域名：`/^[a-z][a-z0-9_]*$/`。
   我第一次写 `xaihi-runs` 直接被抛，改成 `xaihi_runs`。
2. 0.2.0-rc.2 发布的 `SubprocessHandle` **没有** `pid`（文档写了），所以账本与状态里
   都不出现 pid；见 §8。
3. `ctx.get(name)` 在**本 fiber 提供它之前**读不到自己的服务：boot 期的形状打印里
   `xaihiOperations=absent` 是这个原因，不是故障。请求期现读才是 `true`。
   所以可用性探针每次请求现算，不在 boot 缓存。

### 证据

1. 门禁 `pnpm test` → `GATE_RC=0`；core 单测从 40 涨到 50（`history.spec.ts` 10 条），
   全仓 108 条。阳性对照：账本打不开时路由是 500 带原因，不是 200 空清单；
   内存账本溢出时淘汰的是旧的。
2. 真机装载：`plugin:install` rc=0 后启动隔离宿主，
   `GET /xaihi/history.json` → `HTTP=200`、
   `{"schema":"xaihi.ledger/1","durable":true,"reason":null,"records":[]}` ——
   **`durable:true` 是 core 在宿主进程里真的 `open()` 开了 DSH 的 storage domain 才可能出现的值**。
3. 后端根目录是真的：verbose 启动日志读出
   `storageDomain=closeAll,config,ctx,domains,get,open,reserved`；
   `$DSH_HOME/storages/` 里已有 DSH 自己的 `workspace.json`，
   `xaihi_runs.json` 要等第一条记录写入才出现（json 后端按需落盘）。
4. 装配事实（纠正 §5 的记录方式）：请求期 `debug.json.services` =
   `{storageDomain:true, approval:true, commands:true, xaihiOperations:true}`。
   我之前用 `createRequire(profile/package.json)` 试解析 `@deepseek-ai/dsh-storage-domain`
   得到 MODULE_NOT_FOUND，那是**假阴性**（组合的导入基准与我的不同）；
   判"有没有某个服务"只能问运行时。

### 还差的一条

写入-重启-读回的完整耐久回路要等**一次真运行**（同上，缺模型凭据）。目前证明的是
"缝开得住"，还没证明"字节落得下"——差别说在这里，不含糊过去。

## 11 非模型入口：节点动作也能从命令进来

### 改了什么

- `defineNode` 现在返回 `NodeHandle { invoke(actionId, args) }`，工具的 `execute` 与
  非模型入口共用同一份记账（开运行、绑输入、结算），不再是两套。
- `sleept` 注册了 `/sleept status|block [minutes]|unblock`（`ctx.commands.register`），
  并且**按定义算闸门**：`dangerFor` 判危险的动作在命令入口直接 `kind:'error'` 拒绝，
  留给带审批的 agent 路径。`invoke` 不过 `tools/pre-execute`，这一点写在返回处的注释里。
- `core` 新增 `probeCommands(ctx)`，`/xaihi/debug.json` 里多出 `commands`：宿主认识的命令名。

### 为什么这样设计

DSH 的命令是"**不送给模型**就在接收 agent 上执行"的入口（`commands.md` 的
`CommandDefinition.handler` 注释原话），这也是面板按钮该走的路，不是第二条 RPC。
危险动作在命令入口拒绝而不是在命令入口再实现一遍审批：Xaihi 没有权限系统，也不该有。

`probeCommands` 存在的理由是补一个真实缺口：manifest 只证明包装好了、loader 行只证明声明了，
**插件的 `apply` 到底跑没跑完是看不见的**。命令注册在 apply 最后一步，所以"命令在列表里"
就是"宿主半边起来了"的可读回路径。

### 证据

1. `/xaihi/debug.json` → `commands = {"ok":true,"names":["export","feedback","permission","sleept"]}`
   —— `sleept` 在里面，这是"节点宿主半边确实激活并跑完 apply"的直接证据（之前只能靠
   "面板渲染出来了"这种客户端侧的间接推断）。
2. 门禁 `pnpm test` rc=0（core 50 / node-sdk 23 / sleept 22 / ui-host 9 / create 4 = 108）。

### 没证到的（不含糊）

- **浏览器里点一下真的跑起来**：没做到。合成输入（paste / beforeinput + 发送）在 composer
  里落进了普通消息路径，没触发命令分派；而面板侧要经 `ctx.remote.commands.execute`，
  它的客户端代理到底怎么绑 `agent` 参数我没读证（主机签名是
  `execute(agent, line, signal)`）。
  我**没有**为此在 `/xaihi` 下自建一条"执行节点动作"的路由——那是绕开宿主分派语义的假证据，
  违反第一条原则。这条留作下一步：先测客户端 `remote` 的真实形状，再接面板按钮。
- 因此 §10 的"写入-重启-读回"仍缺一次真运行（命令入口通了，但触发它需要 UI 或凭据）。

## 12 面板→宿主的控制通路：量出来的契约与一个诚实的失败

### 做了什么

面板不再只能显示：`PanelHost` 加了 `runCommand(line)`，包的是 DSH 的命令通道；
sleept 的面板换成四个按钮（读状态 / 阻止 25 分钟 / 解除 / 立即睡眠-应被拒）。
`ui-host` 的客户端 `inject` 加了 `remote` 与 `remote.commands`。

### 一条条量出来的契约（不是从文档读的）

1. **不声明就读不到**：`ctx.remote` 直接抛 `cannot get property "remote" without inject`，
   `ctx.get('remote').commands` 抛 `cannot get property "remote.commands" without inject`。
   ⇒ 必须显式 `inject: ['remote', 'remote.commands']`（与 `docs/api-gateway.md` 的说法一致）。
   声明之后 shell 照常装载（三块面板 + 两个 remote 模块都在），所以这不是危险改动。
2. **参数个数**：`execute(line)` 被客户端拒成
   `commands/execute expected 3 business argument(s) plus an optional AbortSignal, got 1`；
   补齐三参 `execute(agent, line, submittedAttachments)` 之后请求打到网关。
3. **第一个参数必须是 routed Agent**：网关回 `gateway/arguments-invalid {endpoint:
   "commands/execute"}`，而 `remote.hostFacts` 只有 `{isLoopback:true}`；
   `invokeSelected` / `invokeMethod` 各自要另一种入参形状（实测分别炸在
   `reading 'invoke'` 与 `reading 'context'`）。
   ⇒ **插件客户端在 0.2.0-rc.2 里拿不到"当前 Agent 身份"**，这是通路唯一还缺的那一环。

### 因此现在的行为是如实失败

拿不到 agent 时 `runCommand` 直接返回 `{ok:false, reason: "cannot name the routed Agent…"}`
并指向本节；面板显示 ERROR 原文。**没有**为了让按钮"看起来能用"去：
自建 `/xaihi` 执行路由（绕开宿主分派语义）、伪造 agent 常量（会让命令打到错的会话上）、
或把网关的 `ok:false` 收成成功（这条正是实验期真踩到的 bug，现在有
`command-result.spec.ts` 的阳性对照钉住：`ok:false` 绝不能被读成成功）。

### 下一步与上游提案候选

- 待查：客户端有没有会话/Agent store 能读到当前 routed agent（`remote.mutations` /
  `remote.streams` / 某个 `dsh-client-*` 服务）；找到就只改 `agent` 一个实参。
- **新增上游提案候选**：给插件客户端一个"在当前 Agent 上执行命令"的入口
  （哪怕是把 `invokeSelected` 的入参形状写进文档）。当前第三方只能拿到 endpoint 名，
  拿不到身份，等价于命令通道对插件半开。

### 证据

1. 三种失败原文都来自浏览器实机 `window.__XAIHI__.commandAttempts` 与面板 `<pre>`，
   逐条抄在上面。
2. 声明 `remote`/`remote.commands` 后：`.xaihi-shell` 在、`.xaihi-nav-item` 三块、
   `__XAIHI__.modules = [linedup/Panel, sleept/Panel]`、`__XAIHI__.remote.present = true`。
3. 门禁 `pnpm test` rc=0：ui-host 从 9 涨到 13 条（新增 `command-result.spec.ts`），全仓 112 条。

## 13 Material You 桥（Step 4.4 的第一层）

### 改了什么

- `packages/ui-host/src/client/theme/material-you.ts`：一个 seed → 一套 `--xaihi-*` 别名的
  明暗两值。唯一数值来源是 `@material/material-color-utilities@0.4.0` 的 `DynamicScheme`
  + `MaterialDynamicColors`（与 Xiranite 的 `src/lib/design-theme/md3/color.ts` 同一策略：
  零硬编码 hex、静态访问器已 `@deprecated` 所以走实例方法）。
- `apply()` 里一行：`ctx.theme.overrideTokens('xaihi.md3', xaihiMd3Layer())`，挂在
  `ctx.effect` 上随 fiber 收回；`inject` 补 `theme`。
- `tests/theme.spec.ts`（6 条）与 `packages/ui-host/vitest.config.ts` 的一处必要内联。

### 为什么只叠别名、不动 `--dsw-*`

壳的每条颜色都写成 `var(--xaihi-*, var(--dsw-alias-*))`。所以这一层缺席时宿主原样回落，
不会花屏；Xaihi 换风格也不碰 DSH 自己的表面。主题引擎仍然只有一套：明暗模式、切换、
token 分层全归 `ctx.theme`，我们只是它的一个 override 来源（它的文档原话就是给
"dynamic packages" 用的）。

### 量出来的三条

1. 0.4.0 的 `DynamicScheme` 收的是 **`sourceColorHct`**，不是 `sourceColorArgb`；
   构造形状由编译器钉住，猜不得。
2. `ThemeTokenOverrides = Record<string, {light, dark}>` —— **两个模式都是必填**，
   所以"只配明色"这种半成品在类型层面就过不去。
3. 自定义名（`--xaihi-*`）能被 `overrideTokens` 接受并落到元素作用域里
   ——不在 `documentElement` 上，第一次探针读错了节点，差点把"生效"读成"没生效"。
4. MCU 0.4.0 的 ESM 产物内部是**无扩展名 import**，Node 加载器解不了：vitest 必须把
   这个包内联（配置里写了原因），否则任何引到它的 spec 都是 `Cannot find module`。

### 证据

1. 门禁 `pnpm test` rc=0；ui-host 13→19 条，全仓 **121** 条。
2. 判据不循环：期望值不是再调一次被测函数，而是钉性质 —— 格式全 `#rrggbb`、
   同 seed 下 light/dark 必须分家（surface 变暗、onSurface 变亮，按 WCAG 相对亮度比）、
   primary 必须带彩度、**换 seed 必须换值**（阳性对照）、
   以及一条跨文件覆盖率：`styles.ts` 里出现的每个 `--xaihi-*` 都必须在这一层里有值，
   这条是唯一能抓住"加了别名忘了配色"的尺。
3. 实机（隔离宿主，深色模式）：`.xaihi-shell` 的计算值
   `--xaihi-surface #141218`、`--xaihi-on-surface #e6e0e9`、`--xaihi-primary #cfbcff`、
   `--xaihi-outline #948e9c`、`--xaihi-secondary-container #4d4465`，
   `backgroundColor = rgb(20, 18, 24)` —— 与 seed `#6750a4` 的 M3 FIDELITY 深色值一致，
   说明这一层是真的走到了渲染，不是只存在于类型里。

### 没做

用户可配 seed（需要一个能读回的设置面，不做"只有按钮没有回读"的控件）、OS 壁纸取色
（依赖已迁的 subprocess 通路，排在后面）、M3 组件观感的 UI Kit（下一批）、
以及把 `--xaihi-*` 再映射回 `--dsw-*` 的"整体换皮"选项。

## 14 批次 C：dissolvef 内核移植（checkpoint 第一次有真内容）

### 改了什么

- `plugins/dissolvef`：脚手架生成后填充。`src/core.ts`（915 行）与 `src/platform.ts`
  从 tag `noxide`（提交 `ccf465fe`）**逐字搬**，只改两处：`@xiranite/contract` 的类型
  换成自带的 `src/contract.ts`（形状抄自基线 `packages/shared` 的 zod schema），
  以及"默认历史路径"的来源（见 `docs/adr/0003-migrated-node-file-state.md`）。
- 上游自带的 7 组测试一起搬来当**保真门禁**（`tests/core.spec.ts`），不是重写。
- `src/index.ts`：四个动作 `plan` / `dissolve` / `undo` / `history`；
  `danger.actionIn dangerous:['dissolve','undo']` → 由 DSH 审批；
  内核的 `progress` / `log` 事件桥到运行账本的 `run.progress()` / `run.preview()`。
- 契约与账本第一次连起来：`OperationRun` 新增 `checkpoint(payload)`
  （事件种类多一个 `checkpoint`），core 在运行时留最后一条、结算时写进耐久账目
  的 `checkpoint` 字段——那个字段之前恒为 `''`。
- `run-feed.tsx` 的事件种类改成从契约取（`OPERATION_EVENT_KINDS`），
  不再手抄一份清单——加了 kind 忘了订阅是静默错误。
- `plugins/dissolvef/tsconfig.json`：只关 `noUncheckedIndexedAccess` 与
  `exactOptionalPropertyTypes` 两面旗（`strict` 保留），理由写在文件里。

### 为什么这样设计

- **移植不许顺手改行为**：915 行里给每个数组下标加断言，是一次没人能复核的行为改动面。
  所以选择"让移植件吃它原来的编译器"，把放宽**限制在一个包**并写明收回条件。
  这条不是空话——本包新写的 `src/index.ts` 同样吃 strict，
  我把历史字段写成 `record.createdAt`（其实是 `timestamp`）就是被类型检查当场抓出来的。
- **文件操作不改写成 `ctx.fs`**：那条缝是给模型面工具调用做策略的，节点内核的进程内
  IO 不是它的用例（ADR-0003 里有原文引用与备选比较）。权限边界改由**动作分级**承担：
  危险动作只能经宿主的 `ask` 执行。
- **撤销账本必须显式配置**：没配就拒绝动手，不"先搬完文件再乱写账本"。
  界面上还没有填它的地方，这条写在 ADR 的"待还"里，不当已完成。

### 证据

1. 上游那 7 组测试在移植件上全绿（含真临时目录里的 nested dissolve + undo、
   以及读旧 Python 单记录 journal 再 undo 那条）——保真度由原作者的断言守，不由我重述。
2. 门禁 `pnpm test` rc=0：6 个测试包、128 条用例（dissolvef 7 条新增）。
3. 装载：`plugin:add file:$PWD/plugins/dissolvef` rc=0；`debug.json` →
   `registered: [hello, linedup, sleept, dissolvef]`、`problems: []`、
   `locate errors: []`（子路径行仍单独归类）。
4. 基线可核对：`git worktree add --detach … noxide` 后 HEAD 是 `ccf465fe`，
   与 `packages/nodes/dissolvef/src/core.ts` 的行数（915）与导出面一致。

### 没做

`dissolvef` 的 `mediaTypes` / `enableSimilarity` / `protectFirstLevel` / `skipBlacklist`
等参数**内核里都在**、也仍是默认值生效，只是没进工具参数表（表单先窄，逻辑不缩）；
面板 UI（四个按钮之外）、以及把 `historyPath` 做成有读回的设置面，排在后面。

## 15 批次 B 补：关屏与进屏保（用真机可测的两条替掉"必须真睡一次"）

使用者指定：真睡眠可以不跑，先测**关闭屏幕**与**进入屏保**。这两条都比睡眠可逆得多，
所以第一次拿到了"节点真的把电源动作发出去了"的实机证据。

### 改了什么

`sleept` 的动作从 4 个变 6 个：新增 `displayOff` 与 `screensaver`，两平台各一条 argv 计划：

| 平台 | 关屏 | 屏保 |
|---|---|---|
| macOS | `pmset displaysleepnow` | `open -a ScreenSaverEngine` |
| Windows | `SendMessageW(HWND_BROADCAST, SC_MONITORPOWER=0xF170, 2, 0)` | `SendMessageW(HWND_BROADCAST, SC_SCREENSAVE=0xF140, 0, 0)` |

两者都**不声明危险**（关屏与屏保是可逆的显示状态，不动后台任务），所以也不走审批缝；
`sleep` 仍然只有那一条是危险的。

### 实机证据（这台 Mac，使用者授权后跑的）

1. 关屏：`pmset -g log` 里 `Display is turned off` 计数 **97 → 98**，命令 rc=0。
   尺是不可伪造的内核日志计数，不是"我看屏幕黑了"。
2. 屏保：基线 `pgrep -x ScreenSaverEngine` 不在 → 启动后 **pid 6144 在** → `pkill` 收尾 →
   再数已停。三步都打了出来，不是只看中间那一步。
3. Windows（PTEROSAUR / Win11，SSH）：两条 PInvoke 脚本原样落盘执行，
   **无任何错误输出** —— 说明 `Add-Type` 编过了 user32 声明且 `SendMessageW` 可调。
4. **尺子校准（重要）**：故意把方法名写错的对照脚本 `SendMessageTypo` 输出了
   `MethodNotFound` 异常，但 `powershell -File` 的**退出码照样是 0**。
   所以 Windows 侧判据只能是"有没有错误文本"，不能用 rc；上面第 3 条成立的依据是
   输出为空，不是 rc 为 0。SSH 子进程在会话 0，因此这条证的是**脚本有效性**，
   不是"那块屏幕真的黑了"——差别写在这里，不混过去。

### 顺手修的一处自伤

加这两条的测试时，我用一个自称"no-op guard"的 replace 把 `planAssertionProbe` 的
import 删掉了，门禁当场红在 `ReferenceError`。那是我自己写的注释与行为不符，
不是移植件的问题；修回后 130 条全绿。

## 16 面板按钮的最后一环：量到签名级，然后停在 DSH 的真缺口上

接着 §12 往下量，拿到的是**权威形状**而不是猜测：
`@deepseek-ai/dsh-commands/lib/typert.remote-client.d.ts`（生成物）写的是

```ts
'commands/execute': (agentId: SessionId, line: string, submittedAttachments, signal?) => ...
'commands/list':    (agentId: SessionId) => ...
```

也就是说第一个参数不是 Agent 对象而是 **SessionId**。接着找"当前会话 id 从哪读"，
四条路都是空的（每条都实机读过）：`currentSession` 在 `dsh-client-ui-agent-preset` 里是
private；`dsh-client-ui-session` 只有按会话键控的 observable，没有"当前"这一个；
`remote.hostFacts` 只有 `{isLoopback:true}`；`remote.namespaces` 是空集合；URL 是裸 SPA 路径。

结论：0.2.0-rc.2 里**第三方插件客户端拿不到 agentId**，所以面板"有按钮但按不动"。
这写成了 `docs/upstream-proposals.md` 的 P1，附三种最小改法（只读暴露当前会话 id /
给 `invokeSelected` 一个可猜的形状或一行文档 / 开放业务包自挂 `@Remote` 命名空间）。

现在的行为保持"如实失败"，并把缺的参数名写进错误文案，指向 P1。没有为了绿灯去自建
`/xaihi` 执行路由。

## 17 批次 D：findz（ADR-0004 的进程外内核第一次落地）

批次顺序（`.dsh/skills/xaihi-migration/SKILL.md`）里 D 是最后一个：
A `linedup` → B `sleept` → C `dissolvef` → **D `findz`**。前三个都是"纯 JS 内核搬到
本仓"，findz 不是 —— 它的内核是 4468 行 Go，所以先有 `docs/adr/0004-non-js-core-delivery.md`
（**批次 D 的前置门禁**），才动节点代码。

### 改了什么

- `native/findz-go/`（新）：从 tag `noxide`（提交 `ccf465fe`）**逐字搬** 12 个内核
  `.go` + 4 个 `*_test.go` + `go.sum`。改动只有三处，而且都可以 `diff` 复核：
  `go.mod` 的 module 路径；`ffi.go` 加 `//go:build cshared` 并把单例移出去；
  新增 `singleton.go`（无 build tag，两种形态共用一份声明）与 `host.go`
  （`!cshared`，NDJSON 帧协议的可执行入口）。
- `native/findz-go/probe/`（新）：`probe-host.py`（17 项）与 `probe-bench.py`，
  对**真内核、真目录**说话，不进 `pnpm test`（要 Go 工具链）。
- `plugins/findz`（新）：`src/core.ts` / `worker-protocol.ts` / `watcher-service.ts`
  逐字移植（只改 import 边界，并删掉那个硬绑 in-process `Worker` 的 `runFindz` 包装，
  换成 `runFindzWithGateway(input, gateway, onEvent)` 这条注入缝）。
  `src/gateway.ts` **替代**基线那三件（`findz-worker.ts` + `worker-client.ts` +
  `findz-native`）：起进程、握手、按行收发、死讯。
  `src/index.ts` 接线（handler 表从定义推导），`src/command.ts` 是 `/findz` 命令面，
  `frontend/Panel.tsx` 是面板。
- 定义：13 动作 / 14 字段，`danger: {type:'none'}` —— 与上游一致，v2 内核不解压成员、
  不写使用者的文件（`docs/findz-v2-design.md`："No member is extracted to disk"）。
- `plugins/findz/tsconfig.json`：与 §14 同一个理由，只关 `noUncheckedIndexedAccess`
  与 `exactOptionalPropertyTypes` 两面旗（`strict` 保留、范围限本包）。

### 为什么这样设计

- **为什么不 FFI**：ADR-0004 决定 1 的原话是 `-buildmode=c-shared` 的 Go panic 在 cgo
  边界不可恢复，陪葬的是使用者的宿主与整条会话。所以走子进程；协议"复用那 4 个既有符号
  的语义"就是一行一个 JSON 信封；分发按 `<platform>-<arch>` 一个可选依赖包。
  Extism/WASM 与 TS 重写也在同一份 ADR 里被否掉了，理由是原话，不在这里重述。
- **`api.info` 必须由 `gateway.ts` 回答，不能写成请求帧**。这是移植里最不显眼的一处：
  基线 `findz-worker.ts` 的 `case "api.info"` 走的是 FFI 的**自由符号** `findz_api_info`
  （`packages/findz-native`），不是 `findz_call` —— 所以它从来不经过方法表。
  换成帧协议以后，那个自由符号就是第一帧问候（`host.go` 的 `success("", currentAPIInfo())`），
  名字也不在 `service.go` 的方法表里。**漏掉这条的症状是 `api_info` 动作报
  `unsupported_method: api.info`**，看起来像内核不支持，其实是移植漏了一层。
  这一条是 `tests/kernel.integration.spec.ts` 的真内核判据抓出来的，不是读代码看出来的。
- **`hostBinary` 与 `indexDir` 都没有默认值，而且拒绝猜**。内核自己的默认索引路径是
  `$LOCALAPPDATA/Xiranite/findz/indexes/`（非 Windows 退到 `os.UserCacheDir()`）——
  索引库是使用者的数据，不写进一个以别的产品命名的目录。同一条理由在 ADR-0003 里
  已经用在 dissolvef 的 `historyPath` 上。`hostBinary` 留空则按平台可选依赖包解析，
  解析不到就在**装载期**抛（ADR-0004 决定 3 的原话："节点在装载期就报"），
  而不是等第一次搜索给出"空结果"。
- **终态名照声明抄**。`FindzTask.status` 的终态是 `completed` /
  `completed_with_warnings`，不是 `succeeded`。集成判据里我按 `succeeded` 写，
  症状是轮询一直等到超时 —— 这类错误的表象离原因很远，所以判据里的终态集合
  现在直接取自 `contract.ts` 的联合类型，不另抄一份。
- **死讯必须带上内核自己打到 stderr 的那段**。原先 stdout 一关就报
  `closed its stdout`，而内核的 `diagnose()` 把 panic / 启动失败的原因写在 stderr
  （`host.go`）—— 也就是说最坏的那条路上，唯一有用的信息被吞掉了。现在 stdout 结束
  只触发"等死讯"（有界兜底），死讯由 `handle.done` 统一给（只有它带得上退出码，
  而且 `close` 在 stdio 全关之后才发，所以那时 stderr 一定收完了）。
- **`text` 字段必须显式收窄可见性**。最初它没有 `visible`，于是 `api_info` / `scan` /
  `close_library` / `task` 这些根本不读它的动作也把这个槽位摆给了模型 —— 模型填了、
  内核丢掉、两边都不报错，这是最坏的一种静默。现在只在 `core.ts` 真正消费它的四个
  动作上可见（`query_archives` / `query_members` / `export_rows` / `treemap`）。
- **命令面比动作清单窄是有意的**。面板按 `xaihi-node-ui` 技能只能走 DSH 的命令入口
  （不许自建 RPC），而 `/findz` 装不下全部分页/前缀/排序组合。所以命令面覆盖 13 个
  动作的常用形状，剩下的明说只有 agent 的工具路径能到，而不是摆一个"看起来能翻页"
  但按不动的控件。合法值（`areaBy` / `scopeKind`）从定义里读，`tests/command.spec.ts`
  断言这张表恰好等于清单 —— 加了动作而没想它在命令面长什么样，判据当场红。

### 证据

1. **移植可核对**：`diff -q` 逐文件比 12 个内核 `.go`、4 个 `*_test.go` 与 `go.sum`
   对 `noxide`（`ccf465fe`）逐字相同（rc=0）；差异面只有上面列的三处。
2. **内核自测**：`go test -count=1 ./...` rc=0（上游那 4 个测试文件全绿，30 个顶层用例）。
3. **两种构建形态同源**：`go build -o dist/findz-host .` 得 14,864,034 B 的可执行文件；
   `go build -buildmode=c-shared -tags cshared` 得 9,778,898 B 的库，生成的
   `.h` 里导出符号恰好四个：`findz_abi_version` / `findz_api_info` / `findz_call` /
   `findz_free` —— 即"那 4 个符号的语义"这句 ADR 话的可核对版本。
4. **帧协议实机 17/17**：`probe-host.py` 对真内核读回握手（ABI 1、requestVersions 含 1、
   15 项必需能力齐）、真 ZIP/CBZ 的中央目录、真 PNG 的 IHDR 宽高（120×80 / 64×64 / 300×40）、
   以及三条结构化拒绝（未知方法 / 不认识的 requestVersion / 超长 requestId）。
5. **ADR-0004「后果 2」要的那笔账**（`probe-bench.py`，本机 darwin-arm64）：
   起进程→问候 36.8 ms；冷扫 24 归档 / 768 成员 / 96 MiB **20.9 ms**；
   二次扫（未变）6.7 ms；查询往返中位数 1.28 ms；
   全量图像头分析 768 成员 76.6 ms，768 done / **0 failed**。
6. **走节点这条路再量一次**（`tests/kernel.integration.spec.ts`，真内核 + 真 `gateway.ts`
   + 真 `core.ts` 翻译层）：冷扫 28 ms、二次扫 25 ms、查询往返中位数 **0.173 ms**
   —— 本层帧收发的开销在同一量级，没有把内核的优点吃掉。
7. **本包门禁**：`pnpm --filter @hibernalglow/xaihi-findz run test:unit` rc=0，
   6 个文件 66 条（gateway 真进程假宿主 13 条、真内核 8 条、定义/命令 37 条、移植件 8 条）。
8. **仓库门禁**：`pnpm check:pins` rc=0、`pnpm check:skills` rc=0；
   `pnpm -r run build` / `run typecheck` / `run test:unit` 对**除 `@hibernalglow/xaihi-ui`
   以外**的全部包 rc=0（`xaihi-ui` 当时正被同仓并发的另一个写入方改着，
   见下面"并列写入"一条，与批次 D 无关）。
9. **装载与命令**：`pnpm plugin:add file:$PWD/plugins/findz` rc=0；真宿主
   （独立 `DSH_HOME`、3199 被别的会话占着所以另起 3299）读回 `debug.json`：
   `registrations` 5 个（hello / linedup / sleept / dissolvef / **findz**）、
   `commands.names` 里**有 `findz`**（与 `sleept` 并列）、`located` 5 条 `hasXaihi: true`。

### 并列写入

做批次 D 期间，同一个工作区有另一个会话在改 `packages/ui-host/src/client/index.ts`、
`packages/create-xaihi-plugin`、`plugins/sleept`，并新加了 `packages/ui-kit`
（材料化组件库）。第 8 条门禁之所以要按包排除，就是因为跑门禁的那一刻
`ui-host` 里有一个"声明了但还没接上"的函数（`probeCommandMethods`，TS6133）。
批次 D 的改动面**不包含**那些文件，所以这里按包分别报 rc，而不是报一个笼统的"绿"。

### 没做

- **跨进程 watcher 语义**。ADR-0004「后果 3」的原话就是"这部分尚未设计"，所以它没有
  被顺手发明出来：`watcher-service.ts` 是移植过来、有保真判据的纯逻辑，
  `watcher.set_health` / `watcher.apply_changes` / `scan.reconcile` 也都在帧协议上够得着，
  但**没有人驱动它们** —— `library.open` 之后不会自动跟踪文件变化。基线那部分逻辑在
  `findz-worker.ts` 里（`startLibraryWatch` 那一套），它正是被 `gateway.ts` 替代掉的文件，
  所以这件事必须显式设计，不能靠搬。
- **平台可选依赖包没有发布**（`@hibernalglow/xaihi-findz-<platform>-<arch>`）。
  ADR-0004 的"后果"第一条"发布流程未定"仍然生效；装机路径目前只有开发期的显式
  `hostBinary`。也就是说这个节点现在**还不能作为一个包直接装给使用者**。
- **面板与命令面不覆盖的组合**：分页游标 / 每页条数 / 路径前缀 / 矩形图文本过滤 /
  排序字段 —— 只有 agent 的工具路径能到（见上"命令面比动作清单窄"）。
- **面板按钮的"按下去真的派发"没证到**。findz 的面板走的是与 sleept 同一条被许可的缝
  （`host.runCommand('/findz …')`，不自建 RPC），因此**继承 §12 / §16 量到的那个 DSH 缺口**
  （0.2.0-rc.2 里第三方插件客户端拿不到 agentId，见 `docs/upstream-proposals.md` 的 P1）。
  已验证的是**注册**：真宿主 `debug.json` 的 `commands.names` 里有 `findz`。
  没验证的是**点击派发** —— 现在的行为是如实失败并指向 P1，不是静默什么都不发生。
- **与上游 Windows 数字的对比**：本机是 macOS，没有同机对比数据，所以第 5 条的
  数字不能直接拿去和 `docs/findz-v2-benchmarks.md` 里的 Windows 数字并列。

## 18 UI Kit：面板唯一的上色出口

### 改了什么

新包 `packages/ui-kit`（`@hibernalglow/xaihi-ui-kit`，纯浏览器侧）：

- `src/tokens.ts`（45 行）：`ALIAS` 九个语义槽、`SHAPE`、`SPACE`、`STYLE_TAG_ID`、`KIT_CSS`。
  每个 `ALIAS` 值都是 `var(--xaihi-*, var(--dsw-alias-*，兜底))` 的三层链。
- `src/components.tsx`（75 行）：`XButton`（filled / tonal / text）、`XField`、`XPanel`、
  `registerKitStyles()`。
- `tests/`：`tokens.spec.ts` 3 条 + `components.spec.tsx` 3 条 = 6 条，`KIT_TEST_RC=0`。
- `plugins/sleept/frontend/Panel.tsx` 改写成 kit 组件（67 行），脚手架生成的面板同样改写并
  在 `devDependencies` 里带上 kit。

`package.json` 的 `exports` 里**删掉了 `./styles.css`**：tsdown 不产 CSS 文件，`KIT_CSS` 是
注入用的字符串，留着那条就是声明一个不存在的产物。

### 证据

1. `pnpm -F @hibernalglow/xaihi-ui-kit run build` rc=0 ⇒ `lib/index.js` 4695 B、
   `lib/index.d.ts` 3322 B；`run typecheck` rc=0；`run test:unit` rc=0（2 files / 6 tests）。
2. `pnpm -F @hibernalglow/xaihi-sleept run build` rc=0（tsdown + rspack）⇒
   `dist/__federation_expose_Panel.js` 6830 B，内含 `xaihi-card` ×2（kit 被打进 remote 的
   expose chunk）；同目录 `remoteEntry.js` 里 module `1144` 的条目是
   `{shareScope:"default",shareKey:"react",import:null,requiredVersion:"^18.3.1",singleton:true}`
   —— **React 没被内联**，是共享消费方。
3. 装机：`dsh plugin --profile xaihi add file:…/plugins/sleept` rc=0，安装副本的
   `dist/__federation_expose_Panel.js` 也是 6830 B（装的是新产物，不是旧快照）。
4. Core 路由：workspace `rev=8e3f007a73d0`、sleept `rev=bdf63b0897b9`；响应头
   `Cache-Control: public, max-age=31536000, immutable`；把 rev 换成假值 ⇒ 404
   `rev mismatch (current bdf63b0897b9)`；`../` 与 `..%2f` 两种穿越形式都 404。
   （第一次的"假 rev 负控"我自己写错了：替换的串是旧 rev，等于没换。上面这条是重做的。）
5. 浏览器实机（`http://127.0.0.1:3199/`，独立 `DSH_HOME`）：`<style id="xaihi-ui-kit">`
   1666 字符、只有一份；别名落点在 **`body` 的 inline style**（`--xaihi-surface:#141218`、
   `--xaihi-on-surface:#e6e0e9`、`--xaihi-outline:#948e9c`），不是 `:root`。计算样式：
   卡片 `rgb(20,18,24)` / `rgb(230,224,233)` / 边框 `rgb(148,142,156)` / 圆角 12px / padding 12px；
   filled 按钮 `rgb(207,188,255)` 底 + `rgb(56,30,114)` 字，tonal `rgb(77,68,101)` + `rgb(191,178,218)`，
   text 变体底 `rgba(0,0,0,0)` 字色取 primary；面板 `reactVersion 18.3.1` 且
   `sameReactAsHost: true`。数字与 MCU `DynamicScheme(FIDELITY, dark, seed 0x6750a4)` 一致。
6. 门禁的减法跑测（证明这把尺看得见违规）：往生成模板里泄漏一行
   `const LEAK = '--dsw-alias-text-primary'` ⇒ `scaffold.spec.ts` 立刻 rc=1（断言原文
   `expected … not to contain '--dsw-'`）；撤回后 `shasum` 与探针前一致
   （`93d438e6701cb68eeaaf94aba74c078c7498966c`），重跑 rc=0。
7. 干净检出（新包必须能自证）：仓库外 `git worktree add --detach 21124de` ⇒
   `pnpm install --frozen-lockfile` rc=0、`pnpm -r run build` rc=0（14 条完成行）、
   `pnpm -r run typecheck` rc=0、`pnpm -r --no-bail run test:unit` rc=0（19 个文件），
   且产出的 `plugins/sleept/dist/__federation_expose_Panel.js` 里 `xaihi-card` ×2 ——
   kit 是在那份提交里自己编出来的，不依赖工作区残留。
   顺带量到一条：lockfile 里带着 `plugins/findz` 这个 importer，而那次检出的树里没有它，
   pnpm 12 照样 rc=0（它按目录跳过），所以"lockfile 引用了未提交的包"这一类不一致
   **install 门是抓不到的**，只能靠 `pnpm -r` 的构建/测试清单核对包数（7 个包 vs 工作区 8 个）。

### 为什么这样设计

- **颜色只有一个出口**：主题归 `ctx.theme`，Material You 只叠 `--xaihi-*` 一层。组件里若出现
  字面量 hex 或直接引用 `--dsw-*`，宿主换 seed / 换明暗时就会分成两套，所以 hex 只允许出现在
  `ALIAS` 的兜底位，并由 `tokens.spec.ts` 守住（strip 掉 `var(...)` 之后不许剩颜色，且带
  "strip 之前一定有 hex"的阳性对照）。
- **kit 内联进每个 remote**：这是 ADR-0002「一个包就是一个 bundle」的直接后果。不做共享
  组件包，就不引入"版本对齐"这一层；重复的只是几 KB 规则，`STYLE_TAG_ID` 保证多次挂载也只
  注入一份。
- **不用 dockkit**：D4 已定 v1 自建布局层，kit 只提供 M3 观感的部件，不提供停靠/分割。

### 与 DSH API 的关系

- 别名层由 `packages/ui-host/src/client/index.ts:345` 的
  `ctx.theme.overrideTokens('xaihi.md3', xaihiMd3Layer())` 叠上；`--dsw-alias-*` 这套命名来自
  ui-theme（`ui-theme/src/client/index.ts:78-330`）。实测落点是 `body`，写 DOM 的仍是宿主
  的 ui-layout presenter，Xaihi 没有直接改 `:root`。
- MF2 侧 `shared: { react: { singleton: true, import: false } }`：拿不到宿主 React 就硬失败，
  所以第 2 条里"React 未内联"是构建配置的必然后果，不是巧合。
- 面板渲染仍只有 `renderSlot` 这一种形式（`packages/client/web-react/README.md:19`），没有
  Suspense 集成，因此加载态与错误边界留在 shell 内部（§2 已记）。

### 后续扩展方式

新组件只进 `components.tsx` 并把类名加进 `KIT_CSS`；新增语义槽必须同时改 `ALIAS` 与
`tokens.spec.ts` 的前缀尺（只许 `--xaihi-` / `--dsw-`）；OS 壁纸动态取色仍然是后续项，
它依赖已迁的 subprocess 通路，不在这次范围内。

### 没做

- M3 的 state layer / ripple / focus ring 没有做（现在只有 `disabled` 的透明度）。
- 没有对比度门禁（WCAG）——色值是 MCU 算出来的，但没有一条尺断言"文字对底色 ≥ 4.5:1"。
- 表单控件只到 `XField` 的形状，没有 checkbox / switch / slider。

## 19 面板→宿主的控制通路：把运行时账记全，并给 RPC 加上界

### 改了什么

`packages/ui-host/src/client/index.ts`：

- `probeIdentity()`（`:87`）、`resolveAgent()`（`:119`）、`probeCommandMethods()`（`:170`）、
  `probeRemoteInvokers()`（`:212`）—— observatory 现在把"这台宿主让不让面板走命令通道、
  给了什么身份、方法实际几个参"记成常驻可读回的 `__XAIHI__.remote`。
- `makeRunCommand()`（`:300`）给 `commands/execute` 加了 `COMMAND_TIMEOUT_MS = 8000`（`:285`）
  的上界，并透传**真的** `AbortSignal`（第四个实参，符合量出来的契约）。
- `plugins/sleept/frontend/Panel.tsx`：`busy` 的清理进 `finally`、接住 rejection、
  `statusTone` 改由 `outcome.ok` 决定（原来靠 `startsWith('ERROR')`，而文本第一行是命令行，
  所以永远判成 info）。脚手架生成的面板补了 `.catch`。

### 一处更正

§16 之后面板"按钮永久变灰"的**成因不是宿主挂起**：是 `(ctx as any).agent` 这个属性读被代理
拒成 `cannot get property "agent" without inject`，在 async 函数里变成 rejected promise，而
面板当时只有 `.then`。症状与挂起一模一样，成因不同。现在两条路都被接住：属性读换成非严格的
`ctx.get(name)`，且调用有上界。

### 证据

1. 身份：`agent` / `agentId` / `session` / `sessionId` / `sessions` / `activeSession` /
   `scope` / `store` / `chat` / `conversation` 十个名字逐个 `ctx.get()`，**全部 `absent`**；
   属性读仍抛 `cannot get property "agent" without inject`。
2. 方法表：`remote.commands` 的 `list` 与 `execute` 自身 arity 都是 **0**（rest 包装），所以
   arity 不能当契约；网关才是权威 —— `commands/list()` 回
   `client api: commands/list expected 1 argument(s), got 0`（**读路径也要 agentId**）。
   `has` arity 2、`install` arity 3、`invokeRemote` arity 4。
3. `remote` 侧入口：`invoke` / `invokeSelected` / `prepareInvocation` arity 6，
   `invokeMethod` / `openRemoteStream` arity 4，`enqueue` arity 1。按
   `invokeSelected('commands','list',[])` 只读试一次 ⇒
   `TypeError: Cannot read properties of undefined (reading 'invoke')`，即它读的第四个实参
   无文档；**没有继续猜**——猜出来的调用形状与自建 RPC 无异。
4. 实机点击（同一宿主，profile `xaihi`）：状态行 `data-tone="error"`，文本为
   `/sleept status` + `ERROR: no Agent identity reachable (…) (see docs/stages/step-4.md §12)`，
   六个按钮**全部 enabled**（不再有 `busy` 卡死）。这条同时是"错误语气"的读回证据。
5. 门禁：`pnpm -F @hibernalglow/xaihi-ui run typecheck|build|test:unit` 全 rc=0
   （4 files / 19 tests）；`pnpm -F @hibernalglow/create-xaihi-plugin run test:unit` rc=0
   （6 tests，含 §18 的 kit 尺与语法门禁）。

### 为什么这样设计

- **不把 `'agent'` 写进 `inject`**：DSH 的 `inject` 是硬依赖，装配里没有这个服务时
  `@hibernalglow/xaihi-ui` 整个不挂载。为了"按钮能不能按"押上"外壳在不在"不划算，
  所以用非严格取用 + 常驻 observatory，把事实记下来而不是把赌注写进依赖表。
- **上界是给外部边界准备的**：`commands/execute` 是一次真 RPC。没有上界时，任何一次不返回
  都会把整排控件变灰且没有解释；有了上界，最坏情况是"看得见的一句超时失败"。上界不隐藏
  失败，只是让失败可读。
- **语气由结果决定**：状态行的红/灰属于回读路径，不该由字符串前缀猜。

### 与 DSH API 的关系

- `docs/api-gateway.md:11`：名为 `agent` 的宿主参数在 wire 上变成 `agentId` 字段，网关按
  `TypertLookupMap` 把它解析成宿主对象；`:70` 的客户端示例直接以 `declare const agentId: SessionId`
  起手。也就是说**这个值天生是调用方给的**，而 0.2.0-rc.2 的第三方插件客户端没有任何公开
  途径拿到它 —— 这正是 `docs/upstream-proposals.md` 的 P1，本次把 arity 表与 identity 全
  `absent` 这两组数字补进了 P1 的"现状实测"。

### 后续扩展方式

P1 一旦落地，要改的只有 `resolveAgent()` 里"从哪儿取值"这一处；`makeRunCommand` 的三参形状、
上界与面板侧都不动。若上游给了 `@Remote` 自挂命名空间的能力（P1 的第三种改法），Xaihi 才
会考虑把自己的事件面收进那条合法缝。

### 没做

- 没有自建 `/xaihi/run` 执行路由，没有伪造 agentId，没有读用户凭据来"让按钮动起来"。
- 真 agent 工具调用仍未在本机跑通：隔离 home 里没有 `DEEPSEEK_API_KEY`，聊天里敲
  `/sleept status` 会回 `MISSING_CREDENTIAL`（实测文本见本次浏览器读回）。所以 §10 欠的
  "写入-重启-读回"仍然欠着：刚刚重读的账本是
  `{"schema":"xaihi.ledger/1","durable":true,"reason":null,"records":[]}` —— **`durable:true`
  只证明缝开得住，`records:[]` 就是一条真运行都还没落过盘**。这一点与"面板按钮按不动"是
  两个独立缺口：前者缺触发入口（模型凭据或宿主侧命令派发），后者缺客户端身份。

## 20 面板上色收口：五个面板全走 kit，并把规则变成门禁

### 改了什么

- `plugins/{hello,linedup,dissolvef}/frontend/Panel.tsx` 从"裸 `<div>` + inline `opacity`"
  改写成 `XPanel` / `XField` / `XButton` + `registerKitStyles()`；三个包的 `devDependencies`
  补 `@hibernalglow/xaihi-ui-kit`。现在**五个节点面板**（含 §18 的 sleept 与批次 D 的 findz）
  都不自带颜色。
- 新门禁 `scripts/check-panels.mjs`，挂在根 `check:panels` 与 CI（`pnpm test` 链里排在
  build 之前）：对 `plugins/*/frontend/Panel.tsx` 剥掉注释后禁
  `hex` / `--dsw-` / `rgb(a|hsl|hwb)(` / `createRoot|hydrateRoot`，并要求它从 kit 取组件。
- `packages/ui-kit/src/components.tsx`：`XPanelProps.children` 改为可选（"只有动作行和状态行"
  是合法面板，不是待填）。
- 补上两个**从来没有过测试**的包：`plugins/linedup/tests/core.spec.ts`（9 条，钉 noxide
  那份内核的行为）与 `plugins/hello/tests/manifest.spec.ts`（4 条，钉清单/容器名/工具名/文案）。
  两个包的 `tsconfig.json` 的 `include` 加上 `tests`，否则新 spec 不会被 `typecheck` 覆盖。
- 修掉一条真缺陷：`plugins/hello/locale/` 只有 `en.json`，中文界面里这个包的元信息整段是英文。
  补 `zh.json`，并由用例钉住"两份语言的 meta 都存在"。

### 证据

1. `pnpm check:panels` rc=0 ⇒ `check-panels OK（5 个面板都只经 kit 上色）`。
   **尺本身能红**：`--self-check` rc=0（4 条规则各被抓到一次，命中 5 处）；真文件减法跑测——
   往 `plugins/hello/frontend/Panel.tsx` 塞一行
   `const LEAK = { color: '#b3261e', background: 'rgba(0,0,0,.2)' }` ⇒ rc=1 并点名
   `Panel.tsx:11 hex-color` 与 `css-color-fn`；撤回后 `shasum` 与探针前一致
   （`cbc47e061fc6bbab667083402d370dce136bf7eb`），重跑 rc=0。
2. 仓库门禁：`pnpm test` rc=0 —— 含 `check:pins`、`check:skills`、`check:panels`、
   `pnpm -r run build`（16 条完成行）、`typecheck`、`test:unit`（**10 个包**：ui-kit 6、
   node-sdk 23、create 6、dissolvef 7、core 50、ui-host 19、**hello 4**、**linedup 9**、
   sleept 24、findz 66）。
3. 装机 + 实机（同一隔离宿主，profile `xaihi`）：`dsh plugin --profile xaihi add file:…/{hello,linedup,dissolvef}`
   rc=0 后重启，依次挂三个面板，读回
   - `document.querySelectorAll('#xaihi-ui-kit').length === 1`。**这条同时是去重守卫的阳性对照**：
     三个面板各自内联了一份 kit 的 JS 与 CSS，若守卫不生效，换面板就会追加到 3 个 `<style>`；
   - 三张卡片计算样式同为 `rgb(20, 18, 24)` / 圆角 `12px`（同一个 `--xaihi-surface` 源）；
   - `__XAIHI__.modules` 三条都是 `reactVersion 18.3.1 / sameReactAsHost true`。
4. 一处我一开始写错的断言（记下来防重犯）：hello 的 spec 我按"生成物"的形状写了
   `xaihi.manifest` 嵌套键与单行 `exposes: { … }`，实测三条全红——`package.json#xaihi`
   **就是清单本体**，而这个包的 `exposes` 是多行写的。改成按片段断言后 4/4 绿。
   hello 也没有 `xaihi.node`：它是"最裸的 cordis 插件"样本（工具名 `xaihi_hello_ping` 被钉成断言），
   SDK 形状由 linedup 与脚手架承担，这一点写进了 spec 的文件头。
5. 枚举门禁的漏口与它的减法跑测：门禁按 `plugins/*/frontend/Panel.tsx` 枚举，所以"某包的
   面板文件缺失或改名"会让它**静默变窄**——干净检出里 `findz` 不在，报的就是"4 个面板"
   （实测：`git worktree add --detach 9815041` ⇒ install / `check:panels` / build / typecheck /
   `test:unit` 全 rc=0，9 个测试文件）。补了 `findMissingPanels()`：有 `frontend/` 却没有
   `Panel.tsx` 的包直接判违规。这条新机制自己也做了减法跑测——临时建
   `plugins/zz-hole/frontend/`（不放 Panel.tsx）⇒ `rc=1` 并点名该包；删掉目录后 `rc=0`。
   `--self-check` 现在也覆盖这个洞（合成两个目录、只有一个有 frontend ⇒ 必须恰好报 1 处）。


### 为什么这样设计

- **规则要变成机器能红的东西**：`§18` 只守住了 kit 自己与"脚手架生成的新面板"；仓里已有的
  四个手写面板没有覆盖，`examples/` 之外也没有任何一处会因"面板自带颜色"而变红。这类漂移
  的症状是"换 seed 之后有两套颜色"，而它**不会让任何东西变红**，所以必须在提交前拦。
- **尺排在 build 前面**：它只读源码文本，不需要产物；放前面能让"面板自带颜色"这种错误在
  两秒内报出来，而不是等完 16 条构建。
- **`XPanel.children` 放开**：可选而不是给个空 `<></>`。空片段进 grid 布局会多一个空隙，
  那是把"没有正文"伪装成"正文是空的"。

### 与 DSH API 的关系

- kit 的 CSS 只经 `registerKitStyles()` 注入到文档（面板没有别的资源通路：DSH 的插件 URL
  空间只有 `/plugins/<pkg>/client*.js`，`§` Step 1 已记，这也是提案 P2 的来由）。
- 每个面板仍由 `ctx.slots` 渲染、React 仍从宿主共享消费（`§2` 与 `§18` 的两条判据在这次
  三个 remote 上重读仍然成立）。

### 后续扩展方式

新增面板会自动被 `check-panels` 覆盖（它按 `plugins/*/frontend/Panel.tsx` 枚举）；要放行
例外就得改规则表，而规则表带着 `--self-check`，删一条规则会让自照立刻红。测试形状现在
两种样本都有：`hello`（裸 cordis 插件）与 `linedup`（`xaihi.node/v1` 契约节点）。

### 没做

- 门禁只看 `Panel.tsx`，不看 `container-entry.ts` 与可能新增的其它前端文件——按 `§18` 的
  说法这是"唯一出口 + 一条尺"，还没做成全量扫描。
- 没有 a11y / 对比度门禁（`docs/roadmap.md` 的 R2），所以"文字对底色够不够"仍然是未测项。
- `hello` 保持"不带节点定义"的旧形状。把它迁到 `defineNode` 会丢 `presentResult`
  （工具结果卡片的渲染），而 `xaihi.node/v1` 现在还没有承载它的字段。
