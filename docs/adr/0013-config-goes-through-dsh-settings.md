# ADR-0013 配置走 DSH 的标准面：不搬 `xiranite.config.toml`，也不建 Xaihi 自己的配置文件

状态：接受（2026-10-06）
决策人：HibernalGlow（用户 2026-10-06 口径："配置走 dsh 的标准"）
相关：ADR-0010（品牌统一，本条收掉它的 B 类第二问）、ADR-0003（迁移节点的落盘状态）、
ADR-0006（UI 的真源是 Xiranite）、ADR-0008（共享 UI 包与 L4 边界）、`AGENTS.md`

## 背景

搬运那半边把上游的**整条配置通路**一起搬进来了：节点配置住在后端一个叫 `xiranite.config.toml`
的文件里，带"增量版本历史"，UI 经 HTTP/RPC 读写它。我在 ADR-0010 里把它归进"B 类：改名要连带
数据迁移"，问的是"沿用旧名还是换名"。**这个问题的问法本身是错的**——它在假设"Xaihi 要自带一个
配置文件"。使用者一句话把前提否掉了：配置走 DSH 的标准。

去装好的 DSH 里量了一遍，标准面**不只是有，而且已经接到客户端装配上**，本仓却一次都没用过。

## 实测清单（2026-10-06 现读，路径都在 `node_modules/.pnpm/` 下的已装产物里）

| # | 事实 | 出处与逐字形状 |
|---|---|---|
| 1 | 服务端配置面是**一个正式服务**：`ctx.settings`（`SettingsForms`） | `@deepseek-ai/dsh-settings/lib/types/index.d.ts:25-28`（`declare module '@deepseek-ai/cordis' { interface Context { settings: SettingsForms } }`）；方法 `configure():80` / `get writable:85` / `get documentPath:87` / `prepareDocument():91` / `describe():96` / `update():102` / `replace():108` / `mutate():114` |
| 2 | 配置的**声明**就用每个包自己的 schemastery `Config`，值由 patch 层组合 | 视图里 `schema` 逐字为"Serialized schemastery schema envelope (`schema.toJSON()`)；rehydrate with `new Schema(json)`"（`dsh-settings/lib/types/types.d.ts:23-25`），`value` = "schema defaults → composition base → user layer"，`base` / `user` 分层（`:27-30`），字段出现在 `user` 里即"使用者覆写过" |
| 3 | 写是**乐观并发**的，冲突是数据不是异常噪声 | `SettingsConflictError`，`readonly code = "SETTINGS_CONFLICT"`，带 `expected` / `actual`（`dsh-settings/lib/types/index.d.ts:32-45`）；每次写都收 `expectedRevision`（`:102,108,114`），`revision` 注释逐字："Send it back as `expectedRevision` on a write so a stale editor is refused rather than silently overwriting a concurrent change."（`types.d.ts:36-40`） |
| 4 | **密钥永不出线**，改密钥有专门的形状 | `SettingsSecretView.path/set`，注释逐字 "Whether the slot currently holds a value; the value itself never rides."（`types.d.ts:7-12`）；`SettingsPathOp` 的理由写在类型注释里：拿脱敏文档整段 `replace` 会"silently deletes every secret the wire never returned"（`index.d.ts:47-59`）⇒ 必须用 path op（`mutate`） |
| 5 | 变更有**可读回的事件**，且它就在转发白名单里 | `settings/document-updated(ns, revision)`（`dsh-settings/lib/types/types.d.ts:64-74`）；白名单的唯一真源 `@deepseek-ai/dsh-api-remotes/lib/types/remote-events.d.ts:2-6`（"Both compiler faces list this file… the legal key set of `ctx.remote.$on`"），`settings/document-updated` 在其中（`:85`），`credentials/record-updated` 也在（`:43`） |
| 6 | 插件**客户端够得着**这条面：remote 命名空间 `settings` 是生成好挂进装配的 | `@deepseek-ai/dsh-api-remotes/lib/client.js:5953-5955`：`id: "…dsh-api-settings-controller#settings/describe", service: "settingsController", namespace: "settings"`；同批还有 `settings/mutate:5971-5973`、`settings/openSettingsDocument:6021-6023`、`settings/replace:6040-6042`、`settings/update:6090-6092`；控制器注释逐字："Host service backing the generated `ctx.remote.settings` namespace. Every remote read uses `redactSecrets: true`"（`dsh-api-settings-controller/lib/types/index.d.ts:27-31`） |
| 7 | 上游的"自带配置文件"这条路，**DSH 自己已经废弃并迁走了** | `dsh-settings/lib/types/index.d.ts:70` 的私有方法注释逐字："Move the sections of the **removed `settings.yaml`** into the active profile once the Loader has settled every entry"；落点是 profile patch（`documentPath:87`、`prepareDocument():91`）⇒ 结论：新仓再带一个自己的配置文件，是逆着上游自己的迁移方向走 |
| 8 | Xaihi 的服务半边**已经在用声明侧的标准形状**，只差读写口没接上 | `plugins/findz/src/index.ts:65-67`（`export const Config = Schema.object({ indexDir: … .volatile(), hostBinary: … .volatile() })`）、`:249`（`apply(ctx, config)`）、`:257`、`:281`（`config.<key>.get()`）；值来自 `$DSH_HOME/profiles/xaihi/cordis.patch.yml:21-24`（`- id: xaihi-findz / config: { indexDir, hostBinary }`）——同文件 `:8-16` 里 DSH 自带的 `webserver` / `ui-settings-general` 用的是**同一个形状** |
| 9 | **本仓对 `ctx.settings` / `ctx.remote.settings` 的引用数是 0** | 现扫 `packages/{core,node-sdk,bundle}` 与 `plugins/*/src`（排除搬运目录）对 `ctx.settings`、`remote.settings`、`SettingsForms`、`settingsController`、`settings/document-updated` 的命中：**0** |
| 10 | 搬运那半边带进来的**第二套配置通路**：28 个文件 | 命中数按符号：`xiranite.config` 10、`nodeConfigApi` 8、`AppConfigSync` 6、`NodeConfigPopover` 6、`configRpcClient` 6、`nodeConfigVersions` 4、`nodeConfigSourceView` 2、`useNodeConfig` 1；入口文件 `packages/ui-host/src/backend/configRpcClient.ts`、`src/lib/nodeConfigApi.ts`、`src/hooks/useNodeConfig.ts`、`src/components/workspace/AppConfigSync.tsx`、`src/nodes/shared/NodeConfig{Popover,HistoryPanel,SourceView}.tsx`、`packages/cli-runtime/src/tui/opentui/app.tsx`；使用者能读到的句子在 i18n 里（"通过 xiranite.config.toml 管理…"、"本地后端就绪后才能读取和保存 xiranite.config.toml"） |
| 11 | 我自己也造过一条**并列的**配置贡献点，且**没有任何包在用** | `packages/node-sdk/src/manifest.ts:56-61`（`SettingsContribution { remote, export }`）、`:82`（`settings?: SettingsContribution[]`）、`loader.ts:53-57`（`SettingsProps`）；现扫全部 16 份 manifest：`xaihi.settings` 命中 **0** ⇒ 纸面契约。这与 ADR-0006 里"UI Kit 是凭空造的组件层"是同一种错：DSH 已经有 `describe()` 的 `schema` + `configure({auto})` 的页面策略，我又声明了一个"设置页从哪个 remote 的哪个 export 取" |

## 决定

1. **Xaihi 不自带配置文件。** 不搬 `xiranite.config.toml`，也不新建 `xaihi.config.toml` /
   `xaihi.jsonc` 之类。配置的**声明**只有一个地方：每个包自己的 `Config = Schema.object({...})`
   （cordis/schemastery 标准形状，见第 8 条）；配置的**值**来自 DSH 的 patch 层组合
   （bundle patch → profile patch → home patch → `--patch`），要改就改那一层，落点由
   `ctx.settings.documentPath` / `ctx.remote.settings.openSettingsDocument()` 指给使用者。
2. **读写只走 `ctx.settings`（服务半边）与 `ctx.remote.settings`（客户端半边）。**
   `describe()` 拿 `schema` + `value` + `base` + `user` + `revision`；写按语义挑
   `update` / `replace` / `mutate`，一律带 `expectedRevision`，把 `SETTINGS_CONFLICT` 当**可读回的状态**
   呈现（谁改了、改成第几版），不当成 toast 上的"失败"。变更用 `settings/document-updated` 事件回读，
   这条事件已在转发白名单里（第 5 条），不需要我再开一条 SSE。
3. **配置页优先用 DSH 自动生成的那一页。** 判据是 `SettingsNamespaceView.autoGenerate` 逐字
   "Generate a page if no custom page is registered for this instance"（`types.d.ts:19-20`）+
   `ctx.settings.configure({ auto })`（`index.d.ts:76-80`）。搬过来的 `NodeConfigPopover` 这类自定义页
   **只在确实需要上游那种交互时留**（历史/diff/多字段联动），而且数据源必须换成第 2 条；
   否则删掉，别留第二张表单。
4. **密钥走 path op，不走整段替换。** 远程读永远是脱敏的，所以 UI 手上那份文档天生不完整；
   拿它 `replace` 会把线上从没返回过的 secret 静默删掉（第 4 条逐字理由）。Xaihi 里凡是可能含密钥的
   命名空间，写路径只允许 `mutate` 的 `set` / `unset`；`secrets[].set` 是"配没配"的**唯一**回读面。
5. **上游那套"配置增量版本历史"不在标准面里 ⇒ 它是 proposal，不是自建的第二个存储。**
   DSH 给的是 `revision`（单调计数，用来做并发裁决），不是可回溯的历史。要历史就先提
   `docs/upstream-proposals.md`，不许先把 toml + 版本快照那套搬进来当过渡。
6. **删掉我这条并列贡献点**：`SettingsContribution` / `XaihiManifest.settings` / `SettingsProps`
   （第 11 条）。0 个消费者，且它的存在会让下一个 agent 以为"设置页要自己声明导出名"。
   删除时机见"后果"里那条构建污染——不是"顺手清理"，是有明确判据之后的一次收口。

## 处置清单（第 10 条那些文件归搬运那一侧改，我不远程替换；这里是判据，不是我的 diff）

| 上游形状 | 在 Xaihi 的处置 | 依据 |
|---|---|---|
| `configRpcClient` / `nodeConfigApi`（HTTP 打后端 toml） | **整块不接**；调用点改打 `ctx.remote.settings` | 决定 1、2 |
| `AppConfigSync.tsx`（把整份配置同步进前端 store） | 改成"订阅 `settings/document-updated` → 重读 `describe()`"，前端不持有配置副本 | 决定 2、第 5 条事件 |
| `NodeConfigPopover` / `NodeConfigSourceView` / `NodeConfigHistoryPanel` | 先按决定 3 判要不要留；留则数据源换 settings 面，历史面板在决定 5 落地前只能显示 `revision`，不许显示"版本列表" | 决定 3、5 |
| i18n 里 19 行提到 `xiranite.config.toml` 的文案 | 改成 DSH 的说法（profile patch / 配置页），或直接删掉对应设置页 | 决定 1、ADR-0010 A 类 |
| `.xiranite/*.jsonl` 这类**数据**路径 | 不是配置文件：耐久数据走 DSH 的 storage domain（本仓已是这形状，`packages/core/src/history.ts:16` 引 `@deepseek-ai/dsh-storage-domain`，域名 `xaihi_runs`）；要落文件的位置由使用者在 `Config` 里给（findz 的 `indexDir` 就是范例：没配就**拒绝动手**，`plugins/findz/src/index.ts:139`） | ADR-0003、ADR-0010 B 类 |
| TUI 面（`packages/cli-runtime`）自己那套 `xiranite.config` 偏好 | 终端面读同一条 `Config`；**不许**在终端进程里另开一个配置文件读写 | ADR-0010 §分发形状（三面共享核心） |

## 未证（如实留着，不当已证写）

1. **装机后 `ctx.remote.settings.describe()` 会不会把 `xaihi-findz` 这条 entry 列出来。** 类型与生成物都在
   装配里（第 6 条），但"第三方 bundle 声明的 `Config` 也进 `namespaces[]`"这一步我只在类型层看到
   "one view per profile plugin entry"（`dsh-settings/lib/types/types.d.ts:61-62`），没在跑的宿主上读回过。
   取证据的方式：起隔离宿主（`pnpm host`，端口 3199），在 ui-host 的 debug 端点里补一条
   `remote.settings.describe()` 的读数；判据是清单里必须出现 `xaihi-findz`，且它的 `schema` 反序列化后
   有 `indexDir` / `hostBinary` 两个字段。
2. **插件客户端要不要在自己的 `inject` 里显式写 `remote.settings`。** 命令面那条实测是
   `cannot get property "remote.commands" without inject`（`packages/ui-host/src/client/index.ts:51-57`），
   按同一条机制推 settings 应当一样，但那是**推断**，要跑一次才算数；同理 `package.json#dsh.client.inject`
   现在只写了 `@deepseek-ai/dsh-client-ui-layout`，settings 面属于哪个客户端包、要不要加一行，未量。
3. **`writable` 什么时候是 `false`**（注释只说"whether the profile accepts writes"）。不量清楚就会写出
   一个"按钮按下去没反应"的控件——按既有教训（开关映射成 None 就是装饰品），接线时必须同时读回
   `writable=false` 的原因并显示出来。

## 后果

- `AGENTS.md` 增加"配置只有一个出口：DSH 的标准面"一节；`CONTEXT.md` 新增 **## 配置面** 一节
  （`settings 面` / `namespace(ns)` / `revision`+`expectedRevision` / 脱敏读 / 自动生成页五个词）。
- **CONTEXT.md 那一节此刻没提交**：GitButler 把它和 findz lane 还未提交的「内核算独立进程的节点」
  挤成了同一条 hunk（`non:4`），按 hunk 提交会把别人在飞的词条算进我的提交名下。等那条 lane
  提交后，这一节随它们的 diff 一起落地；文字已在盘上，不是漏做。
- ADR-0010 的 B 类第二问由本条收口：**不问"沿用还是换名"，答案是这东西不进仓**。
- 决定 6 的删除**不在本轮做**：实测过我的包 `build` 会把别人 241 个在飞文件一起编进产物，而 `lib/`
  被 gitignore ⇒ 没有脏信号，重建一次就可能把半成品固化成"我的产物"。删除要落在那条 lane 的搬运
  提交之后，并且按 `docs/adr/0010-brand-is-xaihi.md`（品牌）那条同样的判据——改完当场跑尺，不靠事后发现。
- 本轮另量到一条**上游发布的装不动的版本**，直接写给搬运那一侧：
  `@diceui/tags-input@0.7.3` 与 `@diceui/combobox@1.2.3` 都钉 `@diceui/shared@0.12.1`，而两个 registry
  现读 `@diceui/shared` 的版本列表是 `[…, 0.11.0, 0.12.0, 1.0.0]`，**没有 0.12.1**；manifest 里钉 `0.7.2`
  时它的依赖是 `@diceui/shared@0.12.0`（存在）。量到这次踩坑的现场读数是
  `pnpm profile:dump` **rc=1**：`ERR_PNPM_NO_MATCHING_VERSION … No matching version found for
  @diceui/shared@0.12.1`（之后 manifest 回到 `0.7.2`，`pnpm check:pins` 又 rc=0）。所以这不是镜像滞后，
  是上游那次发布本身缺一个包：**升到 0.7.3/1.2.3 会让全仓装不动**。
