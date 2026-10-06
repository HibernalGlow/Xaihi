# Step 4a · DSH subsystem ↔ Xiranite service 对照表（迁移门禁）

规则：**任何 Xiranite 服务在搬进 Xaihi 之前，必须在本表里落到"DSH 没有"这一列**，并给出 DSH 侧证据。判"搬"的门槛不是"我们能写得更好"，而是"DSH 的公开能力面里没有这件事"。表里的 DSH 证据都取自 `Xiranite/ref/deepseek-harness/docs/subsystems/<file>.md` 第 5 行（各子系统自述其 Service Definition 与服务名）。

## 不搬（DSH 已有）

| Xiranite 侧 | DSH 侧真源 | 结论 |
|---|---|---|
| `packages/services/src/configService.ts`、`configVersionStore.ts`（TOML + 版本快照） | `settings.md`（单份用户文档、按命名空间分节）、`persistence.md`（事件日志耐久缝）、cordis 行 `config` + `Volatile` | **不搬**。配置 = 插件行 `config` + `Config` schema；使用点 `.get()` 天然热更（见 `examples/dsh-plugin-template/src/index.ts:33-51`）。再引一份 TOML 就是第二个配置真源。 |
| `workspaceService.ts`（工作区注册表：目录、标题、会话归属） | `workspace.md`（"persistent record of a directory the user works in: a stable id over a canonical path, a display title…"） | **不搬**。Xaihi 的"工作台"是 UI 组合面，不是工作区注册表。 |
| 文件与目录操作（`packages/file-operations` 的 fs 部分、`packages/api` 的 fs 面） | `filesystem.md`（`ctx.fs` + 原子文本操作 + guards）、`sandbox.md`（文件效果策略）、`approval.md`（这一次动作能不能继续） | **不搬**基础件；Xaihi 只写"删除账本"这类域概念（见下表）。 |
| 子进程 / 命令执行（各节点的 `spawn`、`platform.ts` 里的进程调用） | `subprocess.md`（`ctx.subprocess` + `dsh-subprocess-local`）、`shell.md`（`ctx.shell`） | **不搬**。节点要外部程序就走 `ctx.subprocess`，权限与审批由 DSH 缝负责（`sleept` 是第一个用户）。 |
| 长任务与提醒 | `jobs.md`（`ctx.jobs`）、`schedule.md`（durable reminders 回到原会话） | **不搬**，也不自建队列。 |
| 工具输出落盘 / 大结果 | `spill.md`（工具输出落盘缝）、`storage.md`（非会话事件的持久化） | **不搬**。 |
| PTY、终端、代码执行、编排脚本 | `terminal.md`、`code-runtime.md`、`workflow.md`、`subagent` | **不搬**，`flow-plugin` 因此从"实现"降级为"只立项"（见 `docs/stages/step-2.md` 与计划 Step 4.5）。 |
| CLI / TUI 面（每节点 `cli.ts`、`Tui.tsx`） | DSH commands + tools + agent | **已作废（2026-10-06）→ 改判"搬"**。原判"不搬"的理由（原文：「节点动作经 `defineNode` 变成工具就是模型面」）只覆盖到"命令能触发动作"，覆盖不到终端上那套交互设计（`trename` 的路径 diff / JSON 树 / 冲突面板、`sleept` 的倒计时视图）。落点见 `docs/adr/0006-ui-source-is-xiranite.md` §「裁定：终端面（CLI / TUI）纳入搬运，与 GUI 同批」与 `docs/roadmap.md` R11。**别与上一行混淆**：上一行不搬的是 DSH 的 `terminal` 子系统（PTY / 代码执行），不是 Xiranite 的终端面。 |
| `repository` 抽象层、`packages/api` 的 HTTP 面 | DSH webserver / api-gateway / typert（`scope.md` 的 scoped-layer 模型） | **不搬**，Xaihi 只注册路由（`/xaihi/*`）不做后端框架。 |
| `nodeMemoryProtection.ts`、`resourceScheduler.ts`、`thumbnailCoordinator.ts` | 确无同类 | **确认 DSH 没有，但 v1 不搬**：这三件的前提是"每节点独立进程 + 大图缩略图"。今天节点跑在宿主进程内，搬过来就是给不存在的压力做调度。触发条件写死：出现第一个真需要独立进程/并发缩略图的节点（批次 D `findz` 的候选）时再来搬。**触发条件已部分应验**：批次 D 确实落地了独立进程（见 `docs/adr/0004-non-js-core-delivery.md`），但对应的是"内核跨界"这一层，不是这三件各自的问题——独立进程的**内存上限**与**并发缩略图**至今没有实测数据，**这三个文件仍然不搬**，等有测量再谈。 |

## 搬（DSH 没有，且工作台/节点直接依赖）

| 项 | 为什么 DSH 没有 | v1 落点 |
|---|---|---|
| **operation stream**：一次节点运行的 `progress` / `preview` / `result_view` 三态 | `tools` 只有"一次调用的 output schema + 呈现意图"（`@deepseek-ai/dsh-tools` 的 `DefineToolOptions.output`、`presentCall` / `presentResult`），`ctx.emit` 是通用事件缝；两者都没有"同一运行的中间态流给面板订阅"这件事 | `packages/core/src/operations.ts` + 客户端读回；节点侧经 `defineNode` 的 `reportsProgress` 打开 |
| **运行历史 / checkpoint**（`historyService.ts` 的 NodeRunHistory 语义 + `dissolvef` 的 legacy undo 依赖） | `session.md` 的事件日志是**会话**的模型，不是"某节点跑过什么、能否回滚这次效果"的域账本；`persistence.md` 只管事件日志耐久 | `packages/core/src/history.ts`（已落）+ 事件流同一缝；**落盘用 DSH 的 `ctx.storageDomain`**（域 `xaihi_runs`，实测 `durable=true`），不自建文件层 |
| **可恢复删除 + 删除历史**（`file-operations` 的 recoverable 部分） | `filesystem` 有原子操作与 guards、`sandbox` 有效果策略，但"删错了能列出来并还原"是域语义 | 批次 C（`dissolvef`）之前落，v1 不做 |

## 判据本身要可反证

- 每条"DSH 没有"必须能指出 DSH 侧最接近的那件东西并说明差在哪；写不出差别的，按"有"处理。
- 每条"搬"必须落成一个可观察面（路由/服务/事件），否则只是搬代码。

## 落 operation stream 时的两条实测更正（Step 4）

1. **存储面**：`ctx.storage` 只是挂载枢纽，插件侧 typed 面是 `ctx.storageDomain.open(defineDomain(...))`
   （`storage.md:11,24,184`）。**实测已在默认组合里**：隔离宿主 `/xaihi/debug.json` 的 loader 行里
   `storage` → `@deepseek-ai/dsh-storage`、`storage-json` → `@deepseek-ai/dsh-storage-json`、
   `storage-domain` → `@deepseek-ai/dsh-storage-domain` 三行都是 `disabled=false`。
   （我先前根据 `ls node_modules/@deepseek-ai` 得出"没装"，那是**看目录当运行时**的错判，
   已按 loader 行改正：判"有没有某个服务"要读装配后的行，不是读包目录。）
   所以落 checkpoint 用 DSH 的 storage domain，不加任何行、不自己写 JSON 文件层。
   同一份 loader 行还确认了 `subprocess` → `@deepseek-ai/dsh-subprocess-local`、
   `approval` → `@deepseek-ai/dsh-user-approval`（危险动作的 `ask` 因此真的有出口）、
   `commands` → `@deepseek-ai/dsh-commands`。
2. **事件转发面**：DSH 的主机→浏览器通道 `ctx.remote.$on` 是闭集
   （`typert.md` "selected by the Host assembly"；`dsh-api-remotes` 的
   `API_REMOTE_FORWARDED_EVENTS` 是写死的 27 项数组）。这正是"operation stream 必须自己搬"
   的证据：合法搬运面只剩 `ctx.webServer` 的命名路由，而 `WebRoute.handler` 的文档原话允许
   长挂响应（SSE）。落地的形状见 `docs/stages/step-4.md`。

## 落批次 D（`findz`）时补的两条

1. **"内核不是 JS"这件事本身要过表**。它不属于原来任何一行：`subprocess.md` 管的是
   "怎么起进程"，不管"什么样的内核值得为它付一个进程"。这条落在
   `docs/adr/0004-non-js-core-delivery.md` 的四个决定里，判据是**故障半径**
   （`-buildmode=c-shared` 的 Go panic 在 cgo 边界不可恢复，陪葬使用者的宿主与整条会话），
   不是性能。所以"内核慢不慢"不能用来判要不要独立进程，"它崩了会不会带走宿主"才是。
2. **内核的对外形状本身也不许重写**。ADR-0004 决定 2 的原话是"复用那 4 个既有符号的语义"，
   落地就是那 4 个导出符号（`findz_abi_version` / `findz_api_info` / `findz_call` /
   `findz_free`）在帧协议下各有对应：`call` 是请求帧、`api_info` 是**问候帧**、`free` 交给
   进程退出。**"自由符号"在帧协议里没有方法名**，所以移植时凡是被 wrapper 层（Worker /
   FFI 客户端）服务过的方法，都要回头确认它的真源在哪一层——`findz` 的 `api.info` 就是
   这么漏的，症状是 `unsupported_method: api.info`。


## 缺口台账（终端面与主机缝，实测由批次 E/F 的子代理报出，逐条给出处）

这些不是"还没做完"，是**DSH 这一侧现在兑现不了**的形状；每条都写着今天代码里怎么表现的。

| # | 缺口 | 今天的表现（可复核） | 出处 |
|---|---|---|---|
| G1 | **主机进程之外没有文件系统缝**。上游 `nodes/logx/platform.ts` 的 `createNodeLogxRuntime` 直接 `node:fs` 读日志目录；本仓的 `ctx.fs` 只在 DSH bundle 的 `apply()` 里存在 | 全局 `bin`（`xlogx`）那一面**只能出计划**：`executed:false` + 退出码 2，stderr 点名 `ctx.fs` 与 `Config.logDir` | `plugins/logx/tests/cli.spec.ts`；`plugins/logx/src/cli.ts` |
| G2 | **主机进程之外没有设置缝**。上游 `@xiranite/config` 的 `loadNodeConfigWithHints` / `updateNodeConfigFile` 与 `TerminalPreferenceController`（主题 / default_mode / 语言）都映射到 `ctx.settings`，bin 里够不到 | `ui` / `gd` 两条交互腿因此不是"缺渲染器"而是**没地方读写偏好**，直接拒 | `plugins/{logx,recycleu}/src/cli.ts` 的拒答文案 |
| G3 | **`NodeCall` 不往下传取消信号**。DSH 有 `ToolExecution.signal`，但 `defineNode` 的调用形状里没有它 | `recycleu start` 的暂停/撤销只能靠自己那套；`maxCycles=0`（无限循环）被**拒**而不是假装有闸 | `packages/node-sdk/src/define-node.ts:50-54`；`plugins/recycleu/src/exec.ts:141`（`CANCELLATION_GAP`） |
| G4 | **`xaihi.node/v1` 没有"这一面尚未出货"的表示法**。上游清单里 `help.workflows.cli` 的散文还写着 `xlogx ui` / `xrecycleu gd` | 屏幕不撒谎（推导器只读 `nodeId`/`title`/`description`/`actions`），但**清单这一块确实在宣传包自己会拒的腿** | 两份 manifest 原文；`packages/node-sdk/src/help.ts` |
| G5 | **剪贴板读取在上游是缝外的直接 `node:child_process`**（`crashu/src/platform.ts:23-62`），唯一调用者是 `guided` 那条腿 | 该函数**没搬**，`ui/gd/guided` 一律可见地拒；搬它要先决定它归哪个 DSH 服务 | `plugins/crashu/src/platform.ts` 头注释 |
| G6 | **危险动作的批准只在主机侧有缝**。bin 面没有 `ctx.approval` | `danger.all` 经由 `defineNode` 的 `ask` 在宿主侧生效；从终端直接跑的那条路**没有批准环节可展示**，因此 `--force` 之类的形状一律不做 | `plugins/{crashu,formatv}/src/index.ts`；ADR-0013 |
| G7 | **帮助页与真注册的斜杠命令两头都能对不上**（现读：13 份 `plugins/*/src/help.ts` 传了 `command:'/…'`，而 `inject` 里带 `commands` 的只有 `findz` 与 `sleept`，且 `findz/src/help.ts` **不在**那 13 份里） | 两个方向都错：12 个包印了一条宿主里不存在的 `/id`；`findz` 反过来注册了命令却不印。修法：`command` 改成可选参数、只在包真注册时传，并给这条加一把尺（`help.ts` 传了 `command` 的包必须在 `inject` 里带 `commands`，反向也要报） | `packages/node-sdk/src/help.ts`；各 `plugins/*/src/{help,index}.ts` | `packages/node-sdk/src/help.ts`；各 `plugins/*/src/help.ts` |

| G8 | **模型省略布尔时，声明式默认不生效**。`xaihi.node/v1` 的 `fields[].default` 只有表单侧会填；`define-node` 把省略的布尔折成 `false` | `rawfilter` 因此出现"内核默认 `dryRun=false`、清单默认 `true`"的分叉，两份各钉一条测试钉住现状；这不是 DSH 的缺口，是**我们 SDK 侧的落差**，修法在 `packages/node-sdk/src/define-node.ts` 的入参折叠处补"省略 ⇒ 用清单默认" | `plugins/rawfilter/src/index.ts` 注释与其 `tests/core.spec.ts` 两条 |
| G9 | **一方节点界面在 2026-10-07 之前根本没有消费者**（见 `docs/adr/0014-first-party-node-ui-in-realm.md`） | 表现是"搬进来了、类型过了、注册了 12 条，屏上一个都没有"；判据是产物字面命中（`lib/client.js` 里搜 `上次任务失败` 命中 0）。修法与验收条件写在 ADR-0014 的后果一节 | `packages/ui-host/src/components/modules/packageModules.generated.ts`、`packages/ui-host/src/client/workspace.tsx` |
| G10 | **`inputBindings` 的 `trim` 把"省略"折成空串**。内核写 `input.x ?? 默认` 判不出"用户没填"与"填了空" | `bitv` 因此发现：`transferMode` 省略 ⇒ `''`，而 `''` 会走 `move` 那条 **unlink** 分支——真会删源文件。修法是在该节点的白名单里把空串折回默认（`bitv`/`crashu` 同条纪律），并各有测试钉住；根修在 `packages/node-sdk/src/define-node.ts` 的折叠处 | `plugins/bitv/src/index.ts`（`TRANSFER_MODES` 白名单）与其 `tests/core.spec.ts` 那条"源文件不在了：这一趟走的是 move 那条腿" |
| G11 | **`xaihi.node/v1` 的 `help.workflows` / `help.commands` 是单语 `string[]`**，装不下上游那份 `{zh, en}` 数组 | 那两块整块不搬（它们本来就在教人被拒的终端腿），但这表达能力的缺口留着 | `plugins/bitv/src/help.ts`、上游 `packages/nodes/bitv/src/help.ts` |
| G12 | **vendored `cli-support.ts` 的 flag 语法窄于上游**：没有位置参数、没有短 flag、重复 flag 取后者 | 终端面因此不接受上游那种 `xbitv a.mp4 b.mp4`；这是有意的取舍（一份 vendored 件比 26 份方言好），但要写进账，别让它以后被当成 bug | `plugins/linedup/src/cli-support.ts`（26 份一致，`check-vendored` 守） |
| G13 | **`danger` 谓词里的 `actionIs` 在否定式上会反噬**：`conditions.ts` 见 `actionField` 只读 `args['action']`，而 `define-node.ts` 不把动作选择器放进参数表 ⇒ 拿到的是空串，`negated: true` 的那条**恒真** | 实测上游 `cleanf` 的清单里 `undo`+`preview:false` 因此**也要批准**（它本该是"非撤销才危险"）。方向是"多问一次"，不是"少问"，所以不危险但**错**；同时暴露两处不一致：`actionIn`（`define-node.ts:186`）有 actionId 回退而 `actionIs` 没有，`fields[].rules[].when` 那份 `actionField` 目前从不求值，界面侧一旦求值会同一条病 | `plugins/cleanf/src/contract.ts` 与其 `tests/definition.spec.ts` 那格（含"把 `actionField` 塞回自己清单必须红"的正控） |
**共同形状**：G1/G2/G6 都是同一条边界的两面——DSH 的服务缝活在插件进程里，
而"能装进 `$PATH` 的那一面"活在它外面。要么给 DSH 提提案（非主机进程的 fs/settings/approval 入口），
要么接受"bin 面 = 计划器 + 只读查询"这一条明确的口径；两种都比在 bin 里私开一套强。

## G1–G13 复验：四条以本节为准，其中一条是我自己编出来的机制名（2026-10-07 03:14）

派子代理逐条对着今天的树重量了一遍。**它答应写的那份 `docs/port/gap-recheck-2026-10-07.md` 在磁盘上不存在**
（`ls` 零命中，`git log --all --diff-filter=A` 也零命中 ⇒ 它不是被删了，是从来没写过），所以下面每一条的读数都是我本人重跑的，
不引它的报告当证据。它报回来的数字里有两条是 inflated 的，另一条（`timeu/src/index.ts:114` 读
`context.signal`）连那行都不存在——本节所有 file:line 均按"读同一份文件"复验过。
下面四条以本节为准，上面原文保留作账。

| 条 | 原文的说法 | 现测 | 谁错 |
|---|---|---|---|
| **G3** | "所有 17 个内核签名都要求 `AbortSignal`，SDK 不传 ⇒ 取消是假的"，并点名 `plugins/timeu/src/index.ts:114` 读 `context.signal` | `rg -c 'signal: AbortSignal' plugins/*/src/*.ts` ⇒ **3 份文件**声明过这个形参；`rg -n 'signal' plugins/timeu/src/index.ts` ⇒ **零命中**；`rg -n 'signal' packages/node-sdk/src/define-node.ts` ⇒ **零命中**（handler 上下文只有 `{args, inputs, run}`，`define-node.ts:255`） | 代理的两个数与那条 file:line 都不成立。真话是"**取消这条缝还没接**"，不是"17 个内核在等一个假信号" |
| **G5** | 剪贴板 2 个文件 / 3 处 | `rg -l 'navigator\.clipboard' packages/ui-host/src` ⇒ **9 个文件 / 16 处**（最多的是 `components/modules/hostApi.ts` 6 处、`client/node-mount.tsx` 4 处） | 我先前的 2/3 与代理的 7/13 **都错**；这一档差距是实质性的（宿主注入那条路要覆盖 9 个文件，不是 2 个） |
| **G9** | "注册表已生成但没有消费者" | 消费者确实有了（`packages/ui-host/src/nodes/*/entry.ts` 12 份都 value-import 那份生成物，`gen-node-registry: 12 个界面目录 → 12 条注册`），但**这把尺当时没接进任何门禁**：`rg 'gen-node-registry' --glob package.json` ⇒ 零命中 | 半对：消费侧已闭合，门禁侧当时真是悬空。**现已修**——根 `package.json` 加了 `check:noderegistry` 并排进 `test`（`… && pnpm check:cliregistry && pnpm check:noderegistry && pnpm test:contract && …`），实测 `--check` rc=0 |
| **G10** | "已白名单化并有测试"，机制名写的是 `scripts/check-no-os-trash.mjs` | **那个脚本从来不存在**：`ls scripts/ \| rg -i trash` 零命中、`rg 'check-no-os-trash'`（排除 node_modules/desktop）全仓零命中、`git log --all --diff-filter=A -- scripts/check-no-os-trash.mjs` 空 | **是我自己写的假机制名**。真相是防御确实存在，但落点是一个**具名测试**：`plugins/bitv/tests/definition.spec.ts` 里那条 "Config 与模型都没给 transferMode ⇒ 走内核默认的 copy，而不是 move 那条 link+unlink"，注释原话"这条尺读的是盘上，不是文案"。`rg -n 'rmSync\(|unlinkSync\(|fs\.unlink' plugins/*/src/*.ts` ⇒ 零命中 |

代理报告里其余各条我复读后**成立**，摘在这里免得再查一遍：
G1（`@xiranite/file-operations` / `services` 已按 ADR-0013 整块删边 ⇒ 那条现在是 `obsolete`）、
G2 `ctx.remote.settings` 在场（`dsh-client-protocol` 的 `SettingsService`：`describe/update/replace/mutate/openSettingsDocument`），
G4 的"面里声称未迁能力"这一档从 11 处涨到 **55 处命中 / 15 份文件**（`ui` 16、`guided` 9、`gd` 6 是前三），
G6 审批只在宿主侧（`dsh-client-protocol` 里 `approval` 零命中），
G7 的 12 份 `help.ts` 传 `command: '/<id>'` 而只 `findz`/`sleept` 真的 inject 了 `commands`，
G8 省略布尔折成 `false` 的站点是 **2 处而不是 9 处**（`plugins/bitv/src/index.ts:121` 与 `:278`；
其余命中读的是 `=== true` 或 `if (args.x)` 这类**不会**折叠的写法），
G11 `HelpWorkflow.commands: string[]`（`packages/node-sdk/src/help.ts:32`）装不下 `{zh,en}`，
G12 那份 vendored `cli-support.ts` 与基线差在"不剥 `--key` 前缀、只剥 `=值` 后缀"（`--help=true` 会被当成真值）。

**G13 那条修过的仍然成立**：`packages/node-sdk/src/define-node.ts:186` 现在读
`danger.actionField`，`actionIn` 与 `actionIs` 走同一句取值。

一条流程教训，写在这里而不是藏在报告里：**代理的 file:line 必须回读同一份文件**。
这次它给的两条"证据"（`timeu/src/index.ts:114` 读 signal、7 个剪贴板文件）我照着写进台账就会变成
一条假事实加一条被低估的债；而我自己那条 `check-no-os-trash.mjs` 更糟——它不是数字错，
是**我替仓库发明了一个不存在的防御机制**，而这正是本仓最禁止的形状（"不许伪造它没给的数据"）。

### 复验之后又量了两条（2026-10-07 03:43，都是我自己重跑的）

- **G7 的真数既不是 12 也不是代理说的 25**：把 26 份已构建的 `plugins/*/lib/help.js` 逐个读进来找
  `command: "/<id>"` 这一形状 ⇒ **15 个包**命中
  （bandia classq crashu dissolvef enginev formatv linedup linku logx nameu rawfilter recycleu samea sleept timeu）。
  代理报"25"是因为它把 help 模块**加载后现算**的产物也数进去了（`help.ts:108` 那条
  `command ?? \`/${nodeId}\`` 的默认式，一 import 就全都"有 slash 命令"），量的其实是默认值而不是源码。
  这一档的修法仍然要先有"命令注册"这条缝（`ctx.commands` 现在只有 findz / sleept inject），
  不是把 `command` 字段删掉就完事。
- **G4 我连着写错两次，第三次是遍历真数**（第一次我说"55 处 / 15 份"，把 `src/cli.ts` 里
  **主动拒绝**的那批文案一起数了——而那些恰恰是不撒谎的一半；第二次我照代理的话写成
  "谎面只有 bitv 清单里那 2 条"，而 `bitv` 的 `help` 现读只有 `whenToUse` / `safety` 两个键，
  它根本没有 `workflows`，那两条不存在）。
  口径改成可机械查的那一条：把 27 份 `package.json#xaihi` **整棵对象**走一遍字符串，
  找 `x<bin> (ui|gd|guided)` 这种"点名一条跑不起来的腿"的句子。
  改之前命中 **2 句、2 个包**：`logx` 的 `help.workflows.cli[1]`
  （"Run `xlogx` for guided mode or `xlogx ui` for OpenTUI."）与
  `recycleu` 的 `help.workflows.cli[0]`（"…for the guided mode when the command supports interactive prompts"），
  而这两个包的 `src/cli.ts` 对 `guided` / `ui` 都是 rc=2 响亮拒绝（`plugins/recycleu/src/cli.ts:5`、
  `plugins/logx/src/cli.ts:20` 各自点名"未接的第二条腿"）——**清单在宣传包自己会拒的东西**。
  两句都改成 refusal 形状的英文（"not wired in this build: the CLI exits 2 and names the missing seam"），
  改后同一把探针剩 1 处命中，那 1 处就是我新写的那句里的 "the guided mode"（正则把它当 `x bin guided` 认了），
  不是假申报。两包 `vitest run` 仍各 18 条 rc=0（它们的 `definition.spec` 不钉这两句散文）。
