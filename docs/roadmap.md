# Xaihi 路线图（已定 / 已排 / 明确不做）

中英双语只用在 README；这份文档跟 `docs/stages/*`、`docs/adr/*` 一样写中文。
每条都要能回答"谁拍的、凭什么、什么时候能动"。凭据缺失的条目一律标 **未定**。

## 现在的位置

Step 0—4 的主体都落地并有实测证据（`docs/stages/step-2.md`、`step-3.md`、`step-4.md`）：
工作台外壳、`xaihi.node/v1` 契约与 SDK、脚手架、运行账本（operation stream + checkpoint +
耐久 ledger 的读回面）、Material You 别名层（只是六套语言里的 `md3` 一份，见 ADR-0006）、批次 A `linedup` / B `sleept` /
C `dissolvef` / D `findz`。

Step 1 的 API 研究结论**不在** `docs/dsh-api-notes.md`（计划里写的这个文件名不存在），
而是进了 `.dsh/skills/xaihi-architecture/SKILL.md`。理由：那份结论的读者是"在这个仓里干活的
开发 Agent"，技能会被自动装载，文档不会。这是**有意偏离计划的一处落点**，不是遗漏。
阶段报告本身在 `docs/stages/step-1.md`，里面带着 2026-10-06 那次**锚点复验**（版本线真相、
`package.json#dsh` 的现行行号、以及 Step 1 当时漏掉的"插件图标通道"）；上游提案 P2 的范围
也按那次复验缩窄了。

## 已排：按依赖顺序，不并行抢lane

| # | 项 | 前置 | 状态 |
|---|---|---|---|
| R1 | ~~`xaihi-ui-kit` 补 M3 state layer / focus ring / ripple~~ | 无 | **作废**：ui-kit 方向由 ADR-0006 撤掉。**措辞澄清**（ADR-0008）：撤的是"我自建的那份组件层"，不是"共享控件出口"这个位置 —— 出口要留，内容换成 Xiranite 的 shadcn 原语（落在 `@hibernalglow/xaihi-ui`，插件经 MF2 `shared` 共享）；共享形状仍只从 Xiranite `src/nodes/shared/` 搬 |
| R2 | 对比度门禁的**判法**转给设计语言契约 | `design-theme` 移植 | 待重做：AA 的配对表与三条对照可以留着，但对象改成每套语言的 token 集（Xiranite 已有 `contrast.ts` 49 行做工具用） |
| R10 | **移植 Xiranite 的工作台与节点 UI**（先工作台外壳，再按节点分批，每批带自己的测试） | ADR-0006、ADR-0007（四层落点）、**ADR-0008（L1+L2 同包、L4 各自成包、共享走 MF2 `shared`）** | **未开始，前置已定**。规模实测：231 个 `.tsx`（四个主目录）+ 31 个 `src/nodes/<id>`；上游本来就是"UI 双树"（`src/nodes/` 纯 UI、`packages/nodes/*/src/` 宿主，两侧只走纯数据叶子），所以是照抄拓扑不是设计。第一步 = 搬 L2（`src/components/ui` 的 104 个原语 + `cn` + `lib/design-theme`）并在 `remote-modules.ts` 的 `shared` 里加键；L1 外壳与 L4 按节点分批。**待确认**：L2 是否从 `packages/ui-host` 拆成独立包（ADR-0008 §待确认）—— 不拍也能开工，但**别把原语放进 `packages/ui-host`**（那等于默认了不拆） |
| R11 | **移植 CLI 与 TUI**：与网页面**同一个 npm 包**分发（`bin` + 包内相对 import 共享核心），三面各自独立安装、同仓维护 | ADR-0006 §「裁定：终端面（CLI / TUI）纳入搬运，与 GUI 同批」＋「分发形状」一节、ADR-0007 决定 6 | 前置只有一件：包里加 `bin`（实测带 bin 的 bundle 能装，rc=0）。**TUI 依赖不用做 optional**（我上一条的"吞 20 MB"是错的）：pnpm 是单一内容寻址 store，本机实测每次装机都是 `reused …, downloaded 0`，六个节点包共用一份 `@opentui/*` 只有一份字节；`dependencies` 直接写。全局 `npm i -g` 等发布（ADR-0005 同一条前提） |
| R12 | ~~插件自带 React 19 的装载前提：DSH 能不能装独立文档~~ **已量：能，不用提 proposal**（DSH 全程不发 CSP/`X-Frame-Options`；客户端 `index.html` 825 B 里没有 `http-equiv`；`frontend-static:73` 只写 `content-type`；DSH 自己的侧栏就在框外部站点）。剩下的两条是**我们自己的代价**：`/xaihi/*` 具名路由不过 `authorizeIndex`（文档里不许有密钥），同 origin 的 iframe 会带 `dsh-auth-*` 会话 Cookie（`SameSite=Strict` 不挡同源嵌套）⇒ 插件文档内禁止直接打 DSH API，一切宿主调用走 `postMessage` | ADR-0009 后果 3 / 3a / 3b | **已量（22:25 隔离宿主 3199 实时表头 + 装机代码两路）**；V1（19 的元素交给宿主 18 渲染）实机报 `Minified React error #31`，V2（同一次编译里混 18/19）报 `Cannot read properties of undefined (reading 'S')`，两条省事的路已被实测排除。**待使用者拍**：是否采纳 (a)「整个 Xaihi 一份自己的文档、边界只放在 DSH↔Xaihi 那一刀」。实测的增量不是再搬一套渲染器：`ModuleRenderer.tsx`(312) 与 `hostApi.ts`(422) 本来就在工作台闭包里，装载器差集只剩 8 文件 / 2,305 行，其中 998 行是他的插件管理器（DSH 的 bundle/profile 已取代，不搬）⇒ 净新增≈装载器外壳一份。桥的动词表也用他现成的：`NodeHostCapabilities` 9 组（`contract`/`state`/`workspace`/`runner`/`clipboard`/`downloads`/`localFiles`/`config`/`env`）。ADR-0008 与之可共存（`shared` 在同一份 Xaihi 文档内照常生效），只有 `sameUiAsHost` 的主语要改 |
| R13 | **品牌收口**：搬运批次落地时**顺手改名**（A 类：包名与 scope、`bin`、CSS 类名、`data-*`、import 说明符、落盘路径、界面与 i18n 文案），最后一条 A 类命中被改掉的那个提交把 `check:brand` 接进根 `test` 串与 CI | ADR-0010（尺 = `scripts/check-brand.mjs`，剥掉注释之后再判） | **归正在飞的那一侧收口，我不远程替换**：读数在几分钟内 134 → 504 → 757，全部增量是别人正在写的搬运产物；此刻接线等于把红线画在别人正在重写的文件上。**B 类两条等使用者拍板**（属数据归属不属拼写）：`xiranite-rule-tree/v1` 跨 TS/Go 两侧比对的格式判别符、`.xiranite/*.jsonl` 与 `xiranite.config.toml` 这两个写在使用者磁盘上的文件名 |
| R3 | 资源调度器 + 缩略图协调器 + 节点内存保护 | 批次 C/D 的真实负载 | 后置（计划 D14 明写） |
| R4 | 可恢复删除 + 删除历史 | R3、`dissolvef` 的 checkpoint 载荷 | 后置（同上） |
| R5 | 平台可选依赖包 `@hibernalglow/xaihi-findz-<platform>-<arch>` 的发布流程 | ADR-0004 的"后果 1" | **未定**：发布流程没拍，现在只有开发期显式 `hostBinary` |
| R6 | OS 壁纸动态取色（Material You 的第二档 seed 来源） | 已迁的 subprocess 通路 | 已排（计划 D12 推后项） |
| R7 | `flow-plugin`：节点间数据流的编排面 | ≥3 个节点真跑通 | **只立项，不实现** |
| R8 | 桌面壳适配后的 GUI 验收（计划 D9 推迟的那一段） | **两条腿分开**：(a) 官方桌面端——已可下（`HEAD https://download.deepseek.com/desktop/dsh-latest-macos-arm64.dmg` 200，`application/x-apple-diskimage`，369,764,183 B，`last-modified: Tue, 29 Sep 2026 10:46:35 GMT`），但挂载入口不是我们的脚本：桌面端只 boot 写死的 `profiles/desktop`（`apps/desktop/src/paths.ts:19-20`）且 npm 那条 `dsh` 被 `apps/cli/src/args.ts:84-85` 拒于该 profile ⇒ 走桌面端自带 Web Plugin Manager（`apps/desktop/README.md:131`，**前置 = R9 发布**）或桌面端安装的 carrier 命令；(b) `desktop/` 自家壳（R14） | 拆腿后仍未跑。**读数两条都要带**：悬停后 `.xaihi-btn::after` 的 opacity 0 → .08、Tab 聚焦后 `outline` 宽 2px、真 agent 调用一次、面板按钮派发一次。**不许拿 (b) 的结果替 (a) 签字**（ADR-0011 后果 1）。(a) 这一腿已有一条现读：官方壳产品文档上 `dshDesktop` 只有 6 个成员、`xaihiWindow=undefined`，SDK 探测对真形状判 `stock-shell` ⇒ 独立成窗在官方桌面端上确实是「没有」，界面必须把这句显示出来；"面板按钮派发一次"这一条在两条腿上都会撞 P1 的 agentId 缺口，按可见失败交 |
| R9 | 入口 bundle `@hibernalglow/xaihi` 的装机证明 | alpha 发布（`workspace:*` 会被 `pnpm publish` 改写成真实版本） | **未验，且今天必然装不上**：`file:` 安装被 pnpm 拒在依赖树解析（实测诊断与处置见 `docs/adr/0005-entry-bundle-reachability.md`）。发布后要跑的是"新 profile 只装这一个包" ⇒ `--dump-config` 出现 xaihi 两行、`/xaihi/manifest.json` 200、`main` 面板挂上。在那之前文档里不许把它写成"可安装的入口"。**它现在还是 R8(a) 的前置**（官方桌面端只能用应用内插件管理器装发布包） |
| R14 | **`desktop/` 壳这一层**：submodule 锁上游 + `patches/dsh/` 重放，第一个 patch = 「Xaihi 自有文档的原生窗」，节点各自独立成窗放第二批 | ADR-0011（改判一节 + 决定 3/4/5）、P5/P6 | **0001 已落地并有尺**：`node desktop/sync-dsh.mjs --verify` rc=0（IPC 面 26 条通道、`dsh-desktop:xaihi-window-open` 在场，减法对照能抓）。四条硬约束：① submodule 只管"拿源码 + 锁版本"，**package closure 仍走上游 `core-package-set.ts`/`prepare-dsh.ts`**；② gitlink 必须等于 `desktop/UPSTREAM_PIN`（今天踩过一次：记成了 `git am` 造的本机提交 ⇒ `--check` 现在判它）；③ pin 与 `check:pins` 同档（`dsh-v0.2.0-rc.2` = `639ed015…`，**不是** master 的 `5badb150…`）；④ 只有自家壳支持的能力必须探测→退化→退化可读。**0002 也已落地**（纯 URL 判策 + `setWindowOpenHandler` 接线，11 条用例实跑，`tsc -b apps/desktop` 与 bundle 双 rc=0）。**实机起窗已过九条判据**（`node desktop/live-check.mjs` rc=0：产品文档上 `xaihiWindow` 在场、非自家文档被按原因拒绝、放行分支窗口数 2→3 且 URL 带壳改写的 `node`；根因链见 `desktop/README.md`——当时是 `apps/web/dist` 0 个文件被报成 `Web authentication failed`）。**0003 也落地了**（`XAIHI_DESKTOP_PROFILE`，缺省仍 `desktop`），而且 **Xaihi 真内容已进原生第二窗**：`node desktop/live-check.mjs` 13 条全绿（`ui.rev=b6a8cb8bc96f`、正文回显 `node=xaihi-linedup`、入口 `./main.js`、窗口数 2→3）。**从零重放也拿到 13/13 全绿**（deinit → sync → install → `pnpm run build` → 起壳 → live-check；顺序与症状链在 `desktop/README.md` 的启动配方一节——少 `pnpm run build` 会得到网关空 `lib/`、`/api` 404、欢迎面 `Web request failed`、主进程卡在原生模态框）。**0004 也已落地**（同一个 node 不叠窗、换 node 才多开、标题带 node 名，`live-check` 18 条全绿）。**环境已经命令化**：`desktop/dev-shell.mjs` 的 `profile|check|launch|stop|verify` 一条路跑通（全新 home 实测 `verify` rc=0、18/18 绿），并把两处今天真栽过的坑焊进代码（新 profile 的 `[]` 不能追加块序列；端口被占时禁止 launch，防连到旧实例拿假结论）。**没做完的**：① ~~桥动词表里的 `openNodeWindow`~~ **0008 之后不是开窗的阻塞项**：被嵌帧直接 `window.open(/xaihi/ui/<rev>/index.html?node=X)` 就能出原生窗（活体 J 段六条、判策 15 用例），要动的是壳侧 opener 判据而不是我们的桥契约，也不需要新增能力组。剩下的只有界面侧那个入口本身（归搬运 lane 的面板）。② 那个按钮本身（面板里"在独立窗口打开"）与真节点面板的渲染归搬运 lane。③ `main.tsx` 那一档失败面仍没上屏：08:2x 现读 `pnpm exec rspack build -c rspack.document.mjs` **rc=1、4 条错**（比早先的 6 条收敛），逐条都归搬运那刀——`RuntimeSection.tsx` 引一个盘上不存在的 `./NodeMemoryProtectionSettings`；`ClassfDeletionHistoryDialog.tsx` 引 `@xiranite/node-classf/deletion-history`，而全仓零个 package 用 `@xiranite/` 这个 scope（现读确认，这条永远解析不出来）；`WorkflowEditor.tsx` 引 `@xyflow/react` 与它的 CSS，而 `packages/ui-host/package.json` 没声明、根 `node_modules/@xyflow` 也不存在（要不要引这个依赖是搬运 lane 的决定，不该由我替它装）。我这侧同批重取全绿：`rspack.realm.mjs` rc=0、`boot-notice.spec.ts` 12 条、`desktop-windows.spec.ts` 11 条。**顺带把这一档的实机读数换到最新**：16 条 patch 的冷重放整链跑通并留了逐条表（`--reset --force` ⇒ `sync` 得 `head=64683866 tree=b55efa8c1286 patches=16/16 dirty=0`，两次 reset 之间**树哈希逐字相同** ⇒ 幂等判据本体 ⇒ `pnpm run build` **rc=0** ⇒ `--verify` rc=0 ⇒ `dev-shell check` rc=0（bundles=6）⇒ 起壳 ⇒ `dev-shell verify` rc=0、**89 条 OK、0 FAIL**，段覆盖 R/A/B/C/D/E/F/H/I/J/K/L/M/N/O/P；本轮之后 F 段又长两条（顶层窗里同源服务面 200 + 两条编造路径必须 404）⇒ **91 条 OK**），逐条读数在 `desktop/README.md` 的 0005/0006/F/0007 四节加"16 条 patch 的冷重放"一节。**第一遍这条链是红的，红在构建面**：`tsc -b tsconfig.client.json` 报 TS6307 —— 客户端面把 `apps/desktop/src` 的文件逐个登记在 include，0011 起 `ipc.ts` 就 `import type` 那份纯模块却没登记它，而 `tsc -b .` 与 desktop 的 `bundle` 都绕得过这条 project 清单 ⇒ 登记补进 **0011 自己**（新增源码文件与"登记进编译面"必须同批，否则系列的中间态编不动），并给 `--verify` 加了一条一般形式的尺（阳性对照两层：尺内内存里摘掉登记、**真树上**删那一行 ⇒ 种子 6→5、未登记=1、rc=1，按原字节补回后 `dirty=0`）。顺带把 **R12 那条「待使用者拍」拍掉**：选项 (a) 成立 ⇒ ADR-0009 状态已改「接受」（R12 那一行本身没动，它和 R13 落在别人在飞的同一个 hunk 里） |

### R7 的立项边界（为什么现在不做）

`flow-plugin` 要解决的是"一个节点的输出喂给下一个节点，并且中间态可视化"。它同时依赖三件
现在还不确定的事：账本的事件形状会不会随 R3/R4 变（`xaihi.operations/1` 目前只有
`started/progress/preview/result_view/checkpoint/finished/failed`）、编排归 DSH 还是归 Xaihi
（DSH 自带 workflow / jobs / schedule，重造一次就违反第一条原则）、以及面板侧的批量操作入口
（现在还卡在 P1 的 agentId 缺口上）。三条里任何一条没拍，做出来的都是要扔的。
**触发条件**：R3 定案，且 P1 有上游答复。

## 等外部条件（不是"待办"，是"这里我不动"）

- **一次真运行的耐久回路**（§10 / §19）：`/xaihi/history.json` 现在是
  `durable:true, records:[]`。缺的是触发入口，不是代码。
- **面板按钮真派发**：0.2.0-rc.2 的第三方插件客户端拿不到 `agentId`，`commands/list` 与
  `commands/execute` 都要它（`docs/upstream-proposals.md` P1，已补 arity 表与 identity 全
  `absent` 两组数字）。上游任选一种改法落地后，Xaihi 侧只改 `resolveAgent()` 的取值来源。
- **P2 插件自带静态资源、P3 boot 期默认面板、P4 槽的 Suspense**：都是便利项，Xaihi 已有
  自处办法（自建 `/xaihi/*` 路由 / 首帧 `selectPanel` / shell 内部自管异步边界）。

## 明确不做

这些能力住在本仓 **`desktop/` 那一层**（上游是 `desktop/dsh` 的 submodule，我们的改动是
`desktop/patches/dsh/*.patch`，见 ADR-0011 的改判一节）。"不做"的意思收窄成一条边界：
**不许散进 `packages/` 或 `plugins/`**——那里不许出现 Electron、上游源码或 dsh 的本地路径，
bundle 侧仍然只经 registry 装机，并且只有自家壳才支持的能力必须可降级且退化可读。

独立桌面壳（→ 已由 ADR-0011 改住 `desktop/`，不许进 `packages/`/`plugins/`）/
自有窗口管理（同上）/ 自有更新器（同上）/ 自有插件市场 /
自有 runtime（含再引一套 WASM 宿主；同上，壳仓的 runtime 不算本仓的 runtime）/
复杂权限系统 / 复制 DSH 的 loader 或 slots / 依赖 dockkit 内部件 / 占用 `root` 槽 /
把主题塞进 MF2 / agent-plugin 重造（DSH 自带 agent loop、subagent、schedule、workflow）/
公开 npm 首发。

以及一条执行性的：**不为了"绿灯"补假证据**。不自建 `/xaihi` 执行路由，不伪造 agentId，
不拿用户的 DSH 凭据去解锁聊天路径。
