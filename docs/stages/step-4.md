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

