# 配置与状态面往 Cordis 迁移的分诊（2026-10-06）

起因：使用者拍板「尽量都往 cordis 迁移，就是配置啥的」。Elysia 服务端与 Eden 已从
`packages/api` 摘除（闸见 `_scratch/xaihi-elysia-removal-2026-10-06/GATES.md`，8 条 met），
剩下的问题是：那批客户端调用换成什么。本文只落**分诊与落点**，不含实现。

## 一、先划死一条层界（这条决定后面所有判断）

Cordis 的 `provide` / `ctx.get` 只活在**宿主 Node fiber 里**。浏览器的 React 组件拿不到 `ctx`，
它只能经宿主给的那两条对外缝之一：

| 缝 | 形状 | 本仓证据 |
|---|---|---|
| Typert Remote | `ctx.remote.<ns>.<method>()`（具体函数，非 Proxy） | `@deepseek-ai/dsh-api-settings-controller/lib/typert.remote-client.d.ts:17-23` 的 `describe/update/replace/mutate/openSettingsDocument`；`api-gateway.md:58` |
| `ctx.webServer` 路由 | `(req,res)` Node 形状 | `packages/core/src/index.ts:65-71`；ADR-0001 决定 2 |

⇒ 「往 Cordis 迁移」在**宿主侧**= 把逻辑做成 Cordis 服务（而不是 handler 内联）；
在**浏览器侧**它必须落到上面两条缝之一，不存在"UI 直接 `ctx.get` 配置"这种东西。

## 二、宿主侧：配置这件事 DSH 已经给全了

- 插件自己的配置 = `Config` schema（Schemastery，逐字段 `.volatile()`）+ `ctx.config`，`.get()` 天然热更：
  `examples/dsh-plugin-template/src/index.ts:33-51`。
- 使用者的配置文档 = `ctx.remote.settings.*`，带 `expectedRevision`（乐观并发）。
- `docs/service-mapping.md` 早已判 Xiranite 的 `configService.ts`/`configVersionStore.ts`（TOML + 版本快照）**不搬**，
  理由原文："再引一份 TOML 就是第二个配置真源"。

⇒ 结论：**`/config/*` 这条 HTTP 面不该被迁移，该被删除**。节点配置 = 插件 `Config`；
节点预设/版本/备份是 Xaihi 的域账本，若要做就做成 Cordis 服务，落点见 §四 B 组。

## 三、浏览器侧的现存包袱（实测计数，不是估计）

| 域 | 触达文件数 | 落点 | 组 |
|---|---|---|---|
| 端点注入 `baseUrl`/`token`/`window.__XIRANITE_BACKEND__`/`VITE_XIRANITE_BACKEND_URL` | **23** | **删除**——DSH 下没有"插件自带的 localhost 后端"，remote 与路由都不需要 URL/token | — |
| 节点运行 `NodeRun*` | 34 | `ctx.remote` 或 `/xaihi/operations`（core 已有 `OPERATIONS_SERVICE` Cordis 服务） | B |
| 后端生命周期 `LocalBackend*`/`SystemClient` | 32 | **撤销搬运**，见 §五 | C |
| 运行历史 `NodeRunHistory*` | 10 | core `/xaihi/history.json` 已落；读回改走同一条缝 | B |
| 工作台快照/窗口尺寸 `WorkspaceSnapshot` | 8 | Xaihi 域概念（工作台布局≠DSH 的 workspace 注册表） | B |
| 可恢复删除 `FileDeletion*` | 5 | 批次 C，`service-mapping` 判 v1 不做 | D |
| 配置 `ConfigClient`/`Webview2Config` | 4 | 组 A：`ctx.remote.settings.*`（Webview2 见 §五） | A |
| 运行历史 `RuntimeHistory*` | 4 | 与 B 同缝 | B |
| 缩略图 `SourceThumbnail*` | 4 | 字节通道，需 `@Remote` 或路由（图标通道已有，任意资源是提案 P2 的窄版缺口） | B |

## 四、组的定义与做法

- **A 组（零新代码）**：宿主 remote 命名空间已存在 → UI 侧声明 `inject: ['remote','remote.settings']`
  直接调。**注意 `api-gateway.md:58` 的归属规则**：谁读 `ctx.remote.<ns>` 谁自己声明 `remote` 与
  `remote.<ns>`，装配方不替业务包代声明。
- **B 组（要我们自己提供）**：宿主侧先做成 Cordis 服务（`ctx.provide` + `provide` 列表，形状照
  `packages/core` 的 `OPERATIONS_SERVICE`），对外再选一条缝。两条路的门槛不同：
  - Typert `@Remote`：长期正确（还有 `mode:'stream'`，能替掉我们自挂的 SSE），
    但**两条未证**：① 生成器吃不吃本仓的 tsc/`import './x.ts'` 形状；② `descriptor.id`
    的推导规则（网关 "requires the fields in `args` to match the descriptor exactly"，手写有被判身份不符的风险）。
  - `/xaihi/*` 路由：本仓已跑通且有闸（ADR-0001 证据段）。
  ⇒ 建议：先用路由把 B 组闭环（已知能跑），`@Remote` 作为**单命名空间 spike** 并行验证，过了再换。
- **C 组（撤销）**：见 §五。
- **D 组（明确不做）**：`FileDeletion*` 5 个文件按 `service-mapping` 的批次排期，v1 不接。

## 五、已删（不是搁置）

判据来自"只为已出局能力存在的能力不算能力"。这一节的东西已在 2026-10-06 从源码、i18n、
manifest 与测试里整块摘掉，闸与阳性对照见 `_scratch/xaihi-elysia-removal-2026-10-06/GATES-affordance.md`
（5 条 met，含"把植入树再跑一遍必须变红"的对照）。

1. **`restartBackend` / 后端重启**：`packages/ui-host/src/backend/localBackendControl.ts` 整文件删除
   （它整个就是重启 + 热更 + 内存保护三件），`XiraniteSystemClient` 只剩 `health()`，
   i18n 的 `restartBackend`/`restartingBackend` 与设置页按钮、测试里的 mock 一并摘除。
   理由：插件不持有进程，宿主生命周期归宿主。真要这能力 ⇒ `docs/upstream-proposals.md` 立项。
2. **`node-source-hot-reload` 开关**：路由、客户端方法、`NODE_SOURCE_HOT_RELOAD_STORAGE_KEY`、
   设置页开关、`settings:timeline.nodeHotReload*` 全删。它是 Xiranite 开发期产物，
   我们的开发回路是 `pnpm plugin:install`。
3. **Webview2 专配**：`src/config/webview2.ts`（它 import 的 `../../config/webview2-flags.json`
   本来就不存在，这个文件此前编不过）、`Webview2ExperimentsPanel.tsx`、`configRpcClient` 的两个方法、
   `settings.webview2` 整块 21 个键、导航里的 2 条派生项与步骤 id 全删。
   **连带修正一句假话**：`developerRuntime.hotSwitchHint` 原文写着
   "开发时先运行 bun run dev，再运行 bun run dev:desktop:attach，让桌面壳附着到现有 Vite/Elysia 端口"
   ——在 DSH 下不成立，删。
4. **节点内存保护**（`service-mapping` 判"确认 DSH 没有但 v1 不搬"的那三件之一）：`NodeMemoryProtectionSettings.tsx`
   组件、`/system/node-memory-protection` 客户端方法、以及 `packages/shared/src/index.ts` 里
   只为它存在的 6 个符号（两个 zod schema、两个 DTO、`NODE_MEMORY_PROTECTION_APP_SECTION`、
   `DEFAULT_NODE_MEMORY_PROTECTION_SETTINGS`；删前现扫全仓引用为 0）。
5. **开发者工具那行菜单的标签换了出处**：原先借 `settings:webview2.openDevTools`，
   现在用新增的 `topbar.devTools`（zh"打开开发者工具" / en "Open developer tools"），两份 locale 同批改。

**证据等级**：源码级 + 解析级（10 个被改文件在 `--noResolve` 下 TS1xxx 为零，且逐文件确认被检查读到）
+ 既有三道门禁绿。**没有**运行时证据：ui-host 的 vitest `include` 只覆盖 `tests/**/*.spec.*`，
这次改的两份 settings 测试当前不被任何门禁执行；ui-host 的 `@xiranite/*` 依赖图仍未解析（那条 lane 的活）。
不许把这一节读成"界面已在真宿主上验过"。


## 六、待拍板

1. B 组先走**已验证的路由**、`@Remote` 只做 spike —— 默认如此。反对的话请指定要一步到位的域。
2. C 组三件（重启/热更开关/Webview2）按"删除 + 可见退化"处理 —— 默认如此。
3. 那 23 个端点注入文件与 18 个 client 导入文件属于**正在被另一条 lane 改写**的未提交区
   （`packages/ui-host` 630 个源文件、`lib/` 被 gitignore 所以没有脏信号）。默认：**我不碰它们**，
   本文作为它们的迁移口径；要我下场就直说，那时按 sha 台账 + 逐步 `but undo` 兜底。
