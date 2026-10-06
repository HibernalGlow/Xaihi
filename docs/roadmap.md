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
| R1 | ~~`xaihi-ui-kit` 补 M3 state layer / focus ring / ripple~~ | 无 | **作废**：ui-kit 方向由 ADR-0006 撤掉，组件层不该存在；共享形状只从 Xiranite `src/nodes/shared/` 搬 |
| R2 | 对比度门禁的**判法**转给设计语言契约 | `design-theme` 移植 | 待重做：AA 的配对表与三条对照可以留着，但对象改成每套语言的 token 集（Xiranite 已有 `contrast.ts` 49 行做工具用） |
| R10 | **移植 Xiranite 的工作台与节点 UI**（先工作台外壳，再按节点分批，每批带自己的测试） | ADR-0006、**ADR-0007（组件放哪一层；决定 6 = 方案甲：L1+L2+L4 同一个客户端包）** | **未开始，但已解阻塞**（甲于 2026-10-06 22:03 拍定）。规模实测：231 个 `.tsx`（四个主目录）+ 31 个 `src/nodes/<id>`；**上游本来就是"UI 双树"**（`src/nodes/` 纯 UI、`packages/nodes/*/src/` 宿主，两侧只走纯数据叶子），所以是照抄拓扑不是设计。第一步 = 建工作台客户端包骨架（含 UI 源树与 Tailwind v4 的 `@source` 覆盖）+ 生成器（扫 `plugins/*/package.json#xaihi` 出懒装载表），再搬 L1/L2；L4 按节点分批 |
| R11 | **移植 CLI 与 TUI**：与网页面**同一个 npm 包**分发（`bin` + 包内相对 import 共享核心），三面各自独立安装、同仓维护 | ADR-0006 §「裁定：终端面（CLI / TUI）纳入搬运，与 GUI 同批」＋「分发形状」一节 | 前置只有一件：包里加 `bin`（实测带 bin 的 bundle 能装，rc=0）。**TUI 依赖不用做 optional**（我上一条的"吞 20 MB"是错的）：pnpm 是单一内容寻址 store，本机实测每次装机都是 `reused …, downloaded 0`，六个节点包共用一份 `@opentui/*` 只有一份字节；`dependencies` 直接写。全局 `npm i -g` 等发布（ADR-0005 同一条前提） |
| R12 | 插件自带 React 19 的**装载前提**：DSH 的 web 宿主能不能装独立 realm（`plugin-host.html` 那条）——信任栅栏 `--trusted-host` 与 `/plugins` 独占都还没对 iframe/srcdoc 过一遍 | ADR-0009 | **未量**：V1（19 的元素交给宿主 18 渲染）实机报 `Minified React error #31`，V2（同一次编译里混 18/19）报 `Cannot read properties of undefined (reading 'S')`；两条省事的路已被实测排除。量不出来就提 proposal，不绕 |
| R3 | 资源调度器 + 缩略图协调器 + 节点内存保护 | 批次 C/D 的真实负载 | 后置（计划 D14 明写） |
| R4 | 可恢复删除 + 删除历史 | R3、`dissolvef` 的 checkpoint 载荷 | 后置（同上） |
| R5 | 平台可选依赖包 `@hibernalglow/xaihi-findz-<platform>-<arch>` 的发布流程 | ADR-0004 的"后果 1" | **未定**：发布流程没拍，现在只有开发期显式 `hostBinary` |
| R6 | OS 壁纸动态取色（Material You 的第二档 seed 来源） | 已迁的 subprocess 通路 | 已排（计划 D12 推后项） |
| R7 | `flow-plugin`：节点间数据流的编排面 | ≥3 个节点真跑通 | **只立项，不实现** |
| R8 | 桌面壳适配后的 GUI 验收（计划 D9 推迟的那一段） | DSH 桌面端 | 等外部条件。**要带的读数已写死**：悬停后 `.xaihi-btn::after` 的 opacity 0 → .08、Tab 聚焦后 `outline` 宽 2px、真 agent 调用一次、面板按钮派发一次 |
| R9 | 入口 bundle `@hibernalglow/xaihi` 的装机证明 | alpha 发布（`workspace:*` 会被 `pnpm publish` 改写成真实版本） | **未验，且今天必然装不上**：`file:` 安装被 pnpm 拒在依赖树解析（实测诊断与处置见 `docs/adr/0005-entry-bundle-reachability.md`）。发布后要跑的是"新 profile 只装这一个包" ⇒ `--dump-config` 出现 xaihi 两行、`/xaihi/manifest.json` 200、`main` 面板挂上。在那之前文档里不许把它写成"可安装的入口" |

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

独立桌面壳 / 自有窗口管理 / 自有更新器 / 自有插件市场 / 自有 runtime（含再引一套 WASM 宿主）/
复杂权限系统 / 复制 DSH 的 loader 或 slots / 依赖 dockkit 内部件 / 占用 `root` 槽 /
把主题塞进 MF2 / agent-plugin 重造（DSH 自带 agent loop、subagent、schedule、workflow）/
公开 npm 首发。

以及一条执行性的：**不为了"绿灯"补假证据**。不自建 `/xaihi` 执行路由，不伪造 agentId，
不拿用户的 DSH 凭据去解锁聊天路径。
