# ADR-0011 桌面壳放在同级独立仓 `Xaihi-Desktop`：本仓不 vendor、不 patch DSH

状态：接受（2026-10-06）
决策人：HibernalGlow（使用者原话："而且我还有多窗口独立窗口打开的需求，所以还是自己拉吧"
＋"整个xaihi一个窗口 节点它本身支持独立打开窗口"＋"同意，直接写 ADR 按计划推进"）
相关：ADR-0009（本文件接受它的选项 (a)）、ADR-0006（搬运不发明）、ADR-0002（自包含包）、
ADR-0010（品牌）、`AGENTS.md`「不碰 DSH 的三样东西」、`docs/roadmap.md`「明确不做」与 R8、
`docs/upstream-proposals.md` P5 / P6

## 背景

使用者要**原生多窗口 / 独立窗口**。官方桌面端读下来确认这是缺口而不是配置问题（见下表 §1–§5）：
主窗口只有一个、`window.open` 一律 deny、preload 的 IPC 表里没有任何 window 动词、唯一像"多面"
的内嵌 `<webview>` guest 被按端口挡住宿主 origin。所以"只装 bundle 进官方桌面端"这条路满足不了需求。

"那就在本仓 vendor 一份 DSH 源码 + `patches/dsh/`"是外部建议的形状（ChatGPT，2026-10-06）。它被
**实测否掉**（§6–§8）：DSH 桌面端不是"几个目录"，它的 workspace 闭包覆盖 341 个包里的 310 个；
vendor 之后本仓会出现两条版本线与两套 workspace 定义。所以决定是**拉，但拉到本仓外面**：
同级独立仓 `Xaihi-Desktop` 持有 vendor 与 patch，本仓继续只做 bundle 的生产者。

## 实测清单（全部 2026-10-06 现读上游 `master`；上游在本机要过代理，`api.github.com` 整段被重置）

| # | 事实 | 数字与出处 |
|---|---|---|
| 1 | 官方桌面端只有一个产品窗 | `apps/desktop/src/main.ts:206` 定义 `createWindow(preload, show, primary)`，全仓**唯一**调用点在 `main.ts:1066`（`primary=true`）；其余 `new BrowserWindow` 属于 welcome / update-overlay / mandatory-update / policy-test-auth 这些系统窗 |
| 2 | 产品文档申请不到窗口 | `main.ts:239-242` `setWindowOpenHandler(({url}) => { if (http/https) void shell.openExternal(url); return { action: 'deny' } })` ⇒ 任何 `window.open` 被丢给**系统浏览器** |
| 3 | IPC 面上没有 window 动词 | `apps/desktop/src/ipc.ts:8-34` 共 **25** 条通道（shortcuts×6 / boot×5 / browser×3 / directoryPick / deviceInfo / locale×2 / updates×3 / nativeThemeSet / windowFullscreen / windowsAppearance / windowsMenu）；对外的 `DshDesktopProductApi`（`ipc.ts:72`）只有 `browser / keyboard / shortcuts / deviceInfo / updates` |
| 4 | 内嵌 guest 不能承载 Xaihi 文档 | `apps/desktop/src/browser-guests.ts:29` `acquire(owner, workspace)` 每 workspace 一份分区、可多租约；但 `configureSession`（:141-146）权限全关、下载全拦，`isHostRequest`（:164-168）按 **端口 + hostname** 拒宿主 origin |
| 5 | profile 也不能指定（两个方向都封） | `apps/desktop/src/paths.ts:19-20` 写死 `join(dshHome,'profiles','desktop')`，`main.ts:98/320` 调用时不传参；`apps/desktop` 里 **44** 个 `DSH_DESKTOP_*` 变量中没有任何 profile 开关；反向 `apps/cli/src/args.ts:84-85` `error: profile "desktop" is managed exclusively by the Electron application`，`args.ts:143/195` 的 `manageDesktopProfile` 只放行桌面端自己安装的 carrier，`apps/cli/src/plugin.ts:10-12` 还要求"先开一次桌面端初始化 profile，然后完全退出" |
| 6 | "只拿需要的源码"不成立 | 以 `@deepseek-ai/dsh-desktop` + `-desktop-host` + `@deepseek-ai/dsh` 为种子沿 `workspace:*` BFS：**含 devDeps 310/341 包 / 7,363 文件**，只算运行时 268 包 / 6,409 文件；全仓 tracked 14,208 个 ⇒ 闭包 **51.8%**。被排除的 27 个包全是**别人的插件**（`browser-use`、`computer-use`、`ssh/*`、`lsp/*`、`subagent-*`、`web-search-perplexity`），不是核心。再加上根 `pnpm-workspace.yaml`（含 `link:vendor/cosmokit`、`link:vendor/schemastery` 两条 override）、`tsconfig.*.json`、`tsdown.config.ts`，sparse-checkout 省下不到 8% 的包 |
| 7 | vendor 会造出第二条版本线 | 上游 `master` 的 root 与 `@deepseek-ai/dsh`（`apps/cli`）都是 **0.2.1-alpha.1**，`pnpm-workspace` 钉 `pnpm@11.7.0`；本仓 `check:pins` 要求所有 `@deepseek-ai/dsh*` **精确 0.2.0-rc.2**，根 `packageManager` 是 `pnpm@12.6.0`。外部建议举的 pin 例 `5badb150…` 实测是 tag **`dsh-v0.2.1-alpha.1`**，不是我们要的那一档（`dsh-v0.2.0-rc.2` = `639ed015…`） |
| 8 | 桌面端的壳不是"一小层" | `apps/desktop/README.md` 单文件 **115,126 B**，覆盖 Apple 签名+公证、Windows **硬件 token** 签 PE、COS updater feed 与 blockmap、自带的 Python/Node/pnpm 三套运行时、账号 OAuth 内嵌文档、遥测策略、tray 与快捷键拦截 |
| 9 | 但"外部插件"是官方的设计目标，本仓的形状不用改 | `apps/desktop/package.json:2` 自述 *"Electron desktop shell for a bundled dsh runtime **and external plugins**"*；`.agents/notes/implemented/architecture/2026-09-08-desktop-bundled-runtime-and-external-plugins.md`：*"loads enabled plugins from `$DSH_HOME/profiles/desktop`"*、*"Runtime preparation still verifies every retained byte and **boots the complete Host with an external plugin**"*；`apps/desktop/README.md:131`「The shared Web plugin manager reports package-operation errors」；`docs/user/develop/basic/publish.md:105` 解析规则 *"shared by npm, Desktop, and source launches"* |
| 10 | 官方桌面端今天可下（所以本 ADR 不是为了"能不能跑桌面端"） | `HEAD https://download.deepseek.com/desktop/dsh-latest-macos-arm64.dmg` → **HTTP/2 200**，`content-type: application/x-apple-diskimage`，`content-length: 369764183`，`last-modified: Tue, 29 Sep 2026 10:46:35 GMT` |

## 决定

1. **本仓（Xaihi）不 vendor、不 patch、不引 Electron。** `AGENTS.md` 里"不碰 DSH 的三样东西"
   与版本闸门在本仓内一字不改地继续有效。任何"上游没有的能力"在本仓的落点仍然是 proposal。
2. **桌面壳是另一个仓：同级 `Xaihi-Desktop`。** 那里持有上游 vendor（钉 tag）、`patches/dsh/`
   和自己的打包脚本。`docs/roadmap.md`「明确不做」里的**独立桌面壳 / 自有更新器 / 自有 runtime**
   三条从此只对**本仓**成立，措辞要指名 Xaihi-Desktop 是这三样唯一的落点——不许下次有人把它当
   "还是别做"读回来，也不许有人在本仓里"顺手"长一条 runtime。
3. **窗口形状（这次使用者拍的）**：整个 Xaihi 一份自己的文档 ⇒ 一个原生窗；
   **节点本身支持各自独立成窗**（同一份 Xaihi 文档 + 节点寻址参数，不是每个节点一份产物）。
   这一条同时**接受 ADR-0009 的选项 (a)**："整个 Xaihi 用一份自己的文档、边界只放在 DSH↔Xaihi
   那一刀"——React 19 的 realm 边界和原生多窗是同一个 patch 解决的。
4. **降级铁律（本 ADR 最要紧的一条）**：任何只有自家壳才支持的能力，在 bundle 侧必须可降级。
   判据形状：能力来自壳注入的 facts，读不到就走退化路径；退化必须是**界面上读得回来的状态**，
   不许静默、不许伪造（同 ADR 老规矩）。官方桌面端与 `dsh web` 下功能可以退化，**不许崩**。
   这条是"Xaihi 仍然是 DSH 的扩展框架"的定义性约束；一旦某个节点只在自家壳里能用并且没有可见退化，
   本 ADR 就已被违反，按违反处理而不是按"反正我们用自家壳"处理。
5. **版本对齐**：Xaihi-Desktop vendor 的上游 commit 必须与本仓 `check:pins` 钉的那一档一致
   （起步 `dsh-v0.2.0-rc.2` = `639ed015…`）。不一致就是一条**被逐地点名的例外**，要写进本 ADR 的
   追加条款，不许靠"壳仓里另一份 lock"静默漂移。
6. **缺口照样上报**：P5（插件可申请 owned window）与 P6（桌面端 profile 可选 / guest 放行宿主
   具名路由）写进 `docs/upstream-proposals.md`，带上面 §1–§5 的 file:line。上游哪条先落地，
   对应 patch 就撤哪条。本 ADR 不豁免提案义务。

## 后果

- **R8 的语义变了，两条腿要分开签**：`docs/roadmap.md` R8 那四条读数（`.xaihi-btn::after`
  opacity 0→.08、Tab 聚焦 `outline` 2px、真 agent 调用一次、面板按钮派发一次）从此要按
  "官方桌面端" 与 "Xaihi-Desktop 壳" 分别报，**不许拿自家壳的结果替官方桌面端签字**。
- 接手 44 个 `DSH_DESKTOP_*` 的构建面、updater feed 与签名/公证。本机自用可以走
  `DSH_DESKTOP_UNSIGNED`（这台机 Gatekeeper 本来就关着），**要分发给别人就躲不掉**。
- 上游每 bump 一次，patch series 要 rebase，并且本仓的装机腿（`plugin:install` + `profile:dump`）
  要跟着重跑一次才算数。
- 桌面端 profile 的所有权转到壳仓：`profiles/desktop` 的独占、`args.ts:84-85` 那条 CLI 封禁
  对自家壳不再成立（壳是我们自己的），profile 规则由 Xaihi-Desktop 自己写死并记录。
- ADR-0009 状态从「待接受」改「接受」，未决的只剩措辞与实现批次。
- 与 ADR-0006 不冲突：0006 定的是"UI 与终端面去现成实现里搬"，0011 定的是"缺的原生能力在哪个仓里补"。
  本仓的动词仍然是搬运与接线。
- **`docs/roadmap.md` 的本次改动故意没提交**：R8/R9/R14 三行与「明确不做」的措辞已经写进工作树，
  但这个文件此刻只有**一个大 hunk**（`@@ -21,18 +21,20 @@`），里面同时装着别人在飞的
  R1 / R10 / R11 / R13 四行重写。按文件提交会把他们的文字算进我的提交信息名下，hunk 级又拆不开
  （同 ADR-0010「后果」里 R13 那条是同一个病）。等搬运那一侧提交路线图时一起落地。
- **`CONTEXT.md` 的新词条也没加**：该文件此刻是 `MM`（别人有 11+/12− 的改动**已在暂存区**），
  追加"壳仓 / 自有文档窗 / 节点独立窗 / 可见退化"四个词会被卷进他们的提交。
  这四个词的定义此刻只存在于本 ADR 的决定 2/3/4 里，等 CONTEXT.md 干净时补。

## 待使用者拍板（不拍也能开工的前置已标注）

1. **vendor 形态**：`Xaihi-Desktop` 里上游是走 submodule（父仓只记一个 commit）还是
   "完整 clone + 仓内 `UPSTREAM_PIN` 文件"。不拍不影响第一个 patch，但影响第一个提交。
2. **仓库归属**：要不要远端、叫什么名字（`Xaihi-Desktop` 是本 ADR 假设的名字）。
3. **第一个 patch 的落点**：`main.ts:206/1066`（窗的创建与生命周期）+ `ipc.ts:8-34`（新增 window 通道）
   + preload 三处联动，还是先只做"Xaihi 自有文档窗"、节点独立窗放第二批。建议后者起步。
