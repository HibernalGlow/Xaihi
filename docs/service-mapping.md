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
| CLI / TUI 面（每节点 `cli.ts`、`Tui.tsx`） | DSH commands + tools + agent | **不搬**：节点动作经 `defineNode` 变成工具就是模型面。 |
| `repository` 抽象层、`packages/api` 的 HTTP 面 | DSH webserver / api-gateway / typert（`scope.md` 的 scoped-layer 模型） | **不搬**，Xaihi 只注册路由（`/xaihi/*`）不做后端框架。 |
| `nodeMemoryProtection.ts`、`resourceScheduler.ts`、`thumbnailCoordinator.ts` | 确无同类 | **确认 DSH 没有，但 v1 不搬**：这三件的前提是"每节点独立进程 + 大图缩略图"。今天节点跑在宿主进程内，搬过来就是给不存在的压力做调度。触发条件写死：出现第一个真需要独立进程/并发缩略图的节点（批次 D `findz` 的候选）时再来搬。 |

## 搬（DSH 没有，且工作台/节点直接依赖）

| 项 | 为什么 DSH 没有 | v1 落点 |
|---|---|---|
| **operation stream**：一次节点运行的 `progress` / `preview` / `result_view` 三态 | `tools` 只有"一次调用的 output schema + 呈现意图"（`@deepseek-ai/dsh-tools` 的 `DefineToolOptions.output`、`presentCall` / `presentResult`），`ctx.emit` 是通用事件缝；两者都没有"同一运行的中间态流给面板订阅"这件事 | `packages/core/src/operations.ts` + 客户端读回；节点侧经 `defineNode` 的 `reportsProgress` 打开 |
| **运行历史 / checkpoint**（`historyService.ts` 的 NodeRunHistory 语义 + `dissolvef` 的 legacy undo 依赖） | `session.md` 的事件日志是**会话**的模型，不是"某节点跑过什么、能否回滚这次效果"的域账本；`persistence.md` 只管事件日志耐久 | `packages/core/src/history.ts`，与 operation stream 同一存储缝 |
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

