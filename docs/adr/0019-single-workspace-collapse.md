# ADR-0019 多工作空间退役：工作空间塌缩成单例

状态：接受（2026-10-07）
决策人：HibernalGlow（用户 2026-10-07 口径："还保留着原本项目的工作空间，但是我感觉已经用处不大了"；
同日对"塌缩成单工作空间"的落法回复"行"）
相关：ADR-0006（搬运不发明）、ADR-0010（品牌与数据迁移）、ADR-0011（桌面壳与原生多窗口）、
ADR-0013（配置走 DSH 标准面）、`docs/service-mapping.md`、`CONTEXT.md` 工作台侧词条

## 背景

"workspace"在本仓叠了三层词义，处置前必须先拆开：

1. **DSH 的 workspace 注册表**：`$DSH_HOME/storages/` 里那份目录登记（稳定 id + 标题 +
   会话归属）。`docs/service-mapping.md:10` 已裁定**不搬**——Xaihi 的工作台是 UI 组合面，
   不是工作区注册表。本条不碰它。
2. **Xaihi 的工作台主视图**：占用 DSH `main` keyed 面板的那块（`CONTEXT.md:23`，面板 id
   `xaihi`）。这是产品门面，本条不碰它。
3. **多工作空间**：上游工作台自带的"顶层容器"层——`WorkspaceItem`（`packages/ui-host/src/types/workspace.ts:76-84`），
   每个下面挂泳道与组件实例，TopBar 有切换/新建/删除/重命名。搬运时原样带进来了
   （ADR-0006 的搬运账）。**本条的处置对象就是这一层**。

使用者裁定它用处不大。下面的实测清单说明这个裁定在架构上站得住：这层不是功能，
是同一块画布上的几套组件过滤器，而它要解决的"并行多个场面"，DSH 侧已经有更好的承接。

## 实测清单（2026-10-07 现读，均为当日盘上代码）

| # | 事实 | 出处 |
|---|---|---|
| 1 | **视图模式是全局的，不随工作空间走**：`viewMode` 挂在 uiSlice 上，六种视图（dashboard/cards/dockview/flow/lane/bento）全局共享一份 | `packages/ui-host/src/store/workspace/uiSlice.ts:88`；`src/types/workspace.ts:10`；`src/store/workspace/constants.ts:19-20` |
| 2 | 因此"多个工作空间"实际只是**同一块画布上组件实例的几套过滤器**（`useWorkspaceVisibleComponents` 按 `activeWorkspaceId` 过滤），"空间"边界名存实亡 | `packages/ui-host/src/store/workspaceStore.ts:176-181` |
| 3 | UI 入口四处：TopBar 切换/删除保护/新建；右键菜单新建；URL 深链 `?workspace=` | `src/components/workspace/TopBar.tsx:383,421,443`；`src/components/context-menu/defaults.tsx:530`；`src/components/workspace/WorkspaceUrlState.tsx:11` |
| 4 | 出厂即五个工作空间（ws-alpha/grid/kern/net/arch），label 是 i18n key | `src/store/workspace/constants.ts:39-45` |
| 5 | store 语义：增删改/重命名/图标；新建用时间戳 id；删除级联清理 components+lanes 且至少保一 | `src/store/workspace/workspaceSlice.ts:12-16,25-33,42-52` |
| 6 | 持久化三层：① `WorkspaceService` 的三枚 storage key `xiranite:workspaces/lanes/components`（走 `runtime.storage`，web 适配器是 WebStorage）；② zustand persist `xiranite-workspace-ui`（v4）**只存 UI 偏好，业务数据明确不进**；③ 快照走本地后端 HTTP `GET/PUT /workspace/snapshot` | `src/backend/services/workspaceService.ts:5-7`；`src/backend/adapters/web.ts:361`；`src/store/workspaceStore.ts:8-10,135-136`；`packages/api/src/client.ts:344,350`；`src/backend/workspaceRpcClient.ts:13-19` |
| 7 | **快照链路的服务端半边不在仓内**：全仓（含 `desktop/patches/`）搜 `workspace/snapshot` 只命中 client（`client.ts:344,350`）与保真度脚本（`scripts/verify-client-rewrite-fidelity.mjs:58`），没有服务端路由。水合失败时回退 `INITIAL_STATE.workspaces` | `src/store/workspace/backendSlice.ts:34-44` |
| 8 | 快照 DTO 是 GUI 与 TUI **共用**的：TUI 也渲染工作空间切换栏（可点击 tab）并按 workspaceId 过滤组件；`deployNode` 带 workspaceId 参数 | `packages/cli/src/Tui.tsx:78,87`；`packages/cli/src/workspace-tui-model.ts:5-16` |
| 9 | 旧品牌面：这条链上还挂着 `@xiranite/api/client`、`@xiranite/shared` 的 import、`XiraniteWorkspaceController` 类型名、三枚 `xiranite:` storage key；check-brand 现读 1309 处旧品牌（含全仓，别的 lane 在飞，数字会漂） | `src/backend/workspaceRpcClient.ts:1,7`；`packages/cli/src/Tui.tsx:19`；`scripts/check-brand.mjs` 2026-10-07 现读 |
| 10 | "并行多个场面"在 DSH 侧已有承接：组件 `placement: "window"` + 自研壳原生多窗口/文档窗（desktop 层）；会话按 cwd 组织、profile 按运行形态组织 | `src/types/workspace.ts:36`；ADR-0011；AGENTS.md 宿主隔离节 |
| 11 | 设置页那个 `WorkspaceSection.tsx` 是外观偏好（背景/chrome/轮盘），与多工作空间无关，不在本条范围 | `src/components/views/settings/WorkspaceSection.tsx:50-61` |

## 决定

1. **多工作空间整层退役，工作空间塌缩成单例。** 删除全部 UI 入口（TopBar 切换栏、
   新建/删除/重命名、右键新建、`?workspace=` URL 参数），`activeWorkspaceId` 概念退役。
2. **数据模型不动。** `WorkspaceItem` / `ComponentInstance.workspaceId` / `Lane.workspaceId` /
   `WorkspaceSnapshotDTO` 的形状原样保留，`workspaceId` 恒指单例。理由：flow 画布快照、
   bento 布局、lane、dockPanel 全嵌在 `WorkspaceItem` 底下，整个拆掉是六套视图的连带手术；
   保留字段让 GUI、TUI、DTO 三面这一轮只动 UI 层。
3. **单例 id 与存量数据：** 单例 id 取存量快照里第一个 workspace 的 id（组件归属全部保留，
   零迁移）；快照为空时用 `ws-alpha`。存量第 2..N 个工作空间连同其下组件与泳道**级联丢弃**
   （复用 `removeWorkspaceState` 的级联语义），落在 hydrate 一处（`backendSlice.ts` 的
   `hydrateState`）。**不开新持久化版本门**——workspaces 本就不进 zustand persist，
   迁移点只有 hydrate 这一处；若第 7 条的孤儿边成立（水合一直失败回退 INITIAL_STATE），
   这条迁移分支天然是 no-op，必须按"可能没有存量"来写，不许炸。
4. **TUI 同批塌缩：** `Tui.tsx` 的工作空间 tab 栏退役，`deployNode` 的 workspaceId 参数退化为
   单例常量。DTO 形状不动，所以这一步可以跟 GUI 同批、也可以随后单独落，随终端面 lane 的状态定。
5. **旧品牌 key 不在本条改名。** `xiranite:workspaces/lanes/components` 与
   `@xiranite/api/client` 的引用属于 ADR-0010 的"改落盘名 = 数据迁移"类，等快照链路真正
   接到 DSH storage domain（域名 `xaihi_*`）时一并收口销账；本条只把 `xiranite:workspaces`
   的内容缩成一条，缩小暴露面。
6. **不提 proposal、不接 DSH。** DSH 的 workspace 是目录注册表（`service-mapping.md:10`），
   没有"面板内多布局注册表"可对接；为一个使用者已裁定没用的功能去提 proposal，方向反了。
   将来真需要"多块板子"，正当路径是 storage domain `xaihi_*` + `docs/upstream-proposals.md`，
   不复活本层。

## 处置清单（本轮只落决策，未动代码；执行时逐行核对行号，有别的 lane 在飞先重新读盘）

| 文件 | 动作 |
|---|---|
| `packages/ui-host/src/components/workspace/TopBar.tsx` | 切换/新建/删除菜单整块删（现 `:383,421,443` 一带） |
| `packages/ui-host/src/components/context-menu/defaults.tsx` | 右键"新建工作空间"删（现 `:530`） |
| `packages/ui-host/src/components/workspace/WorkspaceUrlState.tsx` | `workspace` parser 删，`view`/`settings` 保留；双向同步里 workspace 分支删 |
| `packages/ui-host/src/store/workspace/workspaceSlice.ts` | `setActiveWorkspace` / `addWorkspace` / `removeWorkspace` / `renameWorkspace` / `setWorkspaceIcon` 退役；`setWorkspaceFlowCanvas` / `setWorkspaceFlowCamera` 保留（挂单例） |
| `packages/ui-host/src/store/workspace/backendSlice.ts` | `hydrateState` 加"塌缩为第一个 + 级联丢弃其余"分支（决定 3） |
| `packages/ui-host/src/store/workspace/constants.ts` | `INITIAL_STATE.workspaces` 五个 → 一个（`ws-alpha`）；`activeWorkspaceId` 字段随决定 1 处理（删除或恒等，随类型收窄一并定） |
| `packages/ui-host/src/store/workspace/types.ts` | `WorkspaceListActions` 与相关 state 字段收窄 |
| `packages/ui-host/src/backend/services/workspaceService.ts` | 多空间 API（`deleteWorkspace` 等）收窄或保留内部不再被 UI 调；三枚 key 不改名（决定 5） |
| `packages/cli/src/Tui.tsx` + `workspace-tui-model.ts` | TUI 工作空间栏退役；`deployNode` 签名收窄（决定 4） |
| i18n（`src/i18n/locales/{zh,en}.json`） | `workspaceN`、`topbar:workspace.*` 等词条清理 |
| 测试 | `workspaceSlice` / `backendSlice` / `WorkspaceUrlState` / `workspace-app-render` / `Tui.test` 等对应断言同批更新 |

**时机约束**：ui-host 这片文件有别的 lane 在飞（`docs/port/gap-recheck-2026-10-07.md:172`：
`workspace.tsx` MM、`node-mount.tsx` 未跟踪）。执行要挑搬运提交落地后的窗口；只提交自己
拥有的文件；验证只跑自己那一档（`pnpm --filter @hibernalglow/xaihi-ui exec vitest run …`
加 `check:brand` 现读对比），全仓 `pnpm test` 的结果在别人在飞时不可归因。

## 未证（如实留着，不当已证写）

1. **快照水合在现装机上到底走没走通。** 服务端半边现读不在仓内（第 7 条），若孤儿边成立，
   用户的"存量多工作空间"可能根本不存在（一直是 `INITIAL_STATE` 兜底）。验证方式：起隔离
   宿主（`pnpm host`，端口 3199）开工作台，读 `backendReady` 与水合后的 `workspaces` 条数。
2. **`/workspace/snapshot` 是否经 desktop patch 重放后有活路**（`desktop/dsh` 全量 rg 未命中，
   但 patch 是文本重放，运行期路由要实机确认）。
3. **findz 的 `FindzSwimlaneWorkspace` 与 `WorkspaceItem` 的耦合度**：它按命名和位置判断是
   节点内自有布局，未逐行核对它与顶层 workspaceId 零耦合；塌缩执行前核一遍
   `src/nodes/findz/` 对 `activeWorkspaceId` 的引用数。

## 后果

- `CONTEXT.md` 工作台侧的 **workspace** 词条补一句"单例"（塌缩落地时同批改，避免文档先于代码承诺）。
- ADR-0010 的逐地点名清单里，`xiranite:workspaces` 这一类豁免在决定 5 的收口时机可以销掉
  （`xiranite:lanes/components` 要等 storage domain 接线，不是现在）。
- 本条是产品裁定不是新机制，`AGENTS.md` 不加节；但处置清单执行时，涉及的多空间断言
  属于"阳性对照"性质的测试要同批改，不许留一条永远测旧行为的绿测试。
- 上游出处照旧记在 ADR-0006 的搬运账里：这层是 Xiranite 原有的，本条是它在 Xaihi 的退场记录，
  不是对上游的评判。
