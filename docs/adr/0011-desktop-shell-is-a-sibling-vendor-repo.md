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
   **【已被文末「改判」一节取代】** 壳改住本仓 `desktop/`，上游是 `desktop/dsh` 的 submodule；
   保留的是"这三样住在 `desktop/` 那一层，而不是散进 `packages/`/`plugins/`"这一条。
   本条原本给出的两条理由（workspace 语义、npm 体积）也在那一节被实测撤回。
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
- **决定 4 的探测层已经在 SDK 里**：`packages/node-sdk/src/desktop-windows.ts` 的
  `readXaihiWindowCapability` / `openNodeWindow` 把"有没有那条动词"变成**带原因的可读状态**，
  三种不支持分得开：`no-shell-surface`（官方桌面端与 `dsh web`）、`stock-shell`（有 `dshDesktop`
  但没打过 0001）、`not-a-function`（半接）。非法 node 在本地就拦（测试断言 opener **一次都没被调用**），
  IPC 抛回的原文透传不重写。8 条用例 + 阳性对照：把两种不支持并成一个原因 ⇒ 2 条转红，复原 ⇒ 8/8 绿。
  剩下的一格是 UI 接线（按钮 + 显示 reason），落点 `packages/ui-host` 此刻仍在大量未提交改动中。
- 与 ADR-0006 不冲突：0006 定的是"UI 与终端面去现成实现里搬"，0011 定的是"缺的原生能力在哪个仓里补"。
  本仓的动词仍然是搬运与接线。
- **`docs/roadmap.md` 的本次改动故意没提交**：R8/R9/R14 三行与「明确不做」的措辞已经写进工作树，
  但这个文件此刻只有**一个大 hunk**（`@@ -21,18 +21,20 @@`），里面同时装着别人在飞的
  R1 / R10 / R11 / R13 四行重写。按文件提交会把他们的文字算进我的提交信息名下，hunk 级又拆不开
  （同 ADR-0010「后果」里 R13 那条是同一个病）。等搬运那一侧提交路线图时一起落地。
- **`CONTEXT.md` 的新词条也没加**：该文件此刻是 `MM`（别人有 11+/12− 的改动**已在暂存区**），
  追加"壳仓 / 自有文档窗 / 节点独立窗 / 可见退化"四个词会被卷进他们的提交。
  这四个词的定义此刻只存在于本 ADR 的决定 2/3/4 里，等 CONTEXT.md 干净时补。

## 待使用者拍板

1. **vendor 形态：已拍（2026-10-06）——不用 submodule。** 壳仓只记 `UPSTREAM_PIN`（`tag + 40 位 sha`
   一行），vendor 工作树被 `.gitignore` 挡着、由脚本按 pin 拉。理由：submodule 会把上游 14k 文件的
   树和它那份 `pnpm-workspace.yaml` 一起绑进壳仓的 index，而我们要的只是"换一行 sha + 重放 patch"；
   vendor 因此是构建产物而不是源码，patch 才是本仓唯一的手写内容。
   起步 pin `dsh-v0.2.0-rc.2` = `639ed015397290b3745d163aafe02ffee4aa3f84`（实测 lightweight tag，
   `ls-remote` 不出 `^{}` 行 ⇒ sha 直接就是 commit）。
2. **仓库归属：已拍——`../Xaihi-Desktop`，本地仓，暂无远端。** 骨架已建（提交 `07944da`：
   `README.md` + `UPSTREAM_PIN` + `.gitignore` + `patches/dsh/README.md` 三条 patch 计划）。
   注意这个仓**不在 GitButler 管理下**，那里的写操作只能是普通 `git`。
3. **第一个 patch 的落点：未拍。** `main.ts:206/1066`（窗的创建与生命周期）+ `ipc.ts:8-34`
   （新增 window 通道）+ preload 三处联动一起做，还是先只做"Xaihi 自有文档窗"、节点独立窗放第二批。
   **建议起步 0001（自有文档窗）**。

## Xaihi 侧的落地位置已经有了（写在这里免得下次重新找）

工作台那半边不需要等壳仓：`/xaihi/ui` 已经是"一份文档 + 它的产物"的路由
（`packages/core/src/routes.ts:101` 的 `UI_PATH_PREFIX = '/xaihi/ui'`，同文件 :155 的注释
「文档壳 + 它的产物」），节点寻址参数也在里面——由另一条 lane 在提交 `0e4b61b` 里落的，
不是我这次的产物。壳仓的 0001/0002 就是去开这份文档。

## 改判（同日 23:0x）：桌面壳并入 Xaihi 仓，上游以 `git submodule` 锁版本

**决定 2 与「待拍板」1/2 被本节取代**：不再有同级仓 `Xaihi-Desktop`，壳落在本仓 `desktop/`，
上游是 `desktop/dsh`（submodule，锁 `dsh-v0.2.0-rc.2` = `639ed015…`），patch series 在
`desktop/patches/dsh/`，同步与重放在 `desktop/sync-dsh.mjs`。标题里的 "sibling vendor repo"
保留是为了不断账本——文件名也是历史。

### 我原来的两条理由被实测推翻，撤回

1. 「submodule 会把上游那份 `pnpm-workspace.yaml` 贴在我们 workspace 旁边，门禁语义要重写」——**错**。
   pnpm 只按 `packages:` 里的 glob 认成员，`desktop/dsh` 不匹配 `packages/*` 或 `plugins/*`，
   它就是一棵嵌套的源码树。
2. 「npm 使用者会被迫拖 185 MB」——**错**。submodule 不是 npm 依赖，发布走 `files` 白名单；
   而且这是使用者的个人项目，不存在第三方 clone。

推翻它们的是探针，不是反方说法：在 `desktop/` 下放一份带 `@deepseek-ai/dsh@0.0.1-rc.1` 的诱饵
manifest 加一份带旧品牌的 `.ts`，`check:pins` **rc=0**、`check:brand` 命中 **0**；把同一份诱饵挪进
`packages/zzprobe` 立刻 **rc=1** 并被点名 `probe-b @deepseek-ai/dsh@0.0.1-rc.1`。
根由是扫描根写死的：`check-pins.mjs:17` `GROUPS = ['packages', 'plugins']`（只走一层）、
`check-installable.mjs:76` `roots = ['packages', 'plugins']`、`check-brand.mjs:89` 递归但根是
`['packages', 'plugins', 'scripts']`。**这条性质要有人守**：谁把 `desktop` 加进任何尺的扫描根，
就得连同探针一起重跑（判据与数字已抄进 `desktop/README.md`）。

### 仍然成立的那几条（改判没有推翻它们）

- 决定 4「降级铁律」原样有效：`xaihiWindow` 在类型上就是**可选成员**，读不到即退化。
- 决定 5「版本对齐」：pin 与 `check:pins` 同档（都是 `0.2.0-rc.2`），`sync-dsh.mjs` 在 checkout
  **之前**先验 tag 的 sha，错 pin 拒到落盘之外。
- 「不复制它的运行时」：`desktop/dsh` 不进任何 npm 包的 `files`，不进 Xaihi 的依赖图，
  它是壳的构建源码；Xaihi 的 bundle 仍然只经 npm/registry 装进 profile。
- submodule 只管源码与锁版本，**不管** package closure：装机/打包走上游自己的
  `core-package-set.ts` + `prepare-dsh.ts`（使用者特别点名的一条边界）。

### 这一档新增的实测（pin `639ed015`，本机、走代理）

| 读数 | 数字 |
|---|---|
| 浅单 tag clone | `.git` 38,490,804 B + 工作树 158,786,544 B ≈ 185 MiB，**49.2 s**（`load1m=42.22`/10 核，机器在满负荷） |
| Desktop 的 workspace 闭包（在 pin 上重算） | **308/338** 个包 ⇒ 314 个检出目录；`--sparse` 151.6 MiB → 101.0 MiB，**省 50.6 MiB（33%）** |
| 重放幂等 | 连跑两次 `sync` ⇒ `head`/`tree` 逐字相同（`0b04cd40` / `28898fc8c8d9`）。第一次做这条时**是红的**：`git am` 每次换 committer 时间 ⇒ sha 漂，治法是 `GIT_COMMITTER_DATE` 钉在 pin |
| 三条阳性对照 | 丢 patch ⇒ `--check` 红；错 pin ⇒ 红且 HEAD 未移动；扰动 patch 的上下文行 ⇒ `sync` 红、`am --abort`、树退回 pin、脏文件 0 |
| gitlink 踩坑与判据 | 第一次提交把 gitlink 记成 `0b04cd40`（`git am` 在本机造的 patch 后提交，上游没有、我们也推不上去 ⇒ 别人 clone 取不到）；同批写的 `.gitmodules` 里 `ignore = all` 会把这种漂移藏掉，已撤。`--check` 现在比对 `git ls-tree HEAD desktop/dsh` 与 pin，判据的阳性对照正是这个坏状态本身（当场跑红 `gitlink_committed=0b04cd40 want=639ed015`）。修好后重跑 sync ⇒ `--check` rc=0 且 `head` 仍是 patch 态 |
| 官方壳对照读数 | series 摘净后（产物里 `XAIHI` 命中 0 次）起壳，产品文档上 `dshDesktop` 只有 6 个成员（`protocolVersion, browser, deviceInfo, keyboard, shortcuts, updates`）、`xaihiWindow=undefined`；把该真形状喂给 SDK 探测 ⇒ `{supported:false, reason:stock-shell}`。决定 4 的「退化可读」前提于是在官方壳本体上量到的，不是从 ipc.ts 那张表推的 |
| 0005：主窗只是隐藏时节点窗继续开 | 上游 `main.ts:1145-1153` 把主窗的 `close` 换成隐藏，而开窗守卫的主语原本是主窗 ⇒ 主窗隐藏后节点窗开不出新窗。0005 把发起者改成"任一活着的自家文档窗"（`xaihiOwnedSender`），目标 URL 从发起者自己的文档取，四条形状守卫不松。实机（`live-check` D 段，**28 条 OK、rc=0**）：`mainHiddenWhileAsking=true` 时从节点窗 `open` ⇒ `{kind:opened, windowId:18, alreadyOpen:false}`、`countBefore=3→countAfter=4`（按 id 差量）、新窗 `title="Xaihi · xaihi-sleept"`；把该窗导到 `dsh-app://app/index.html` 后再问 ⇒ `rejected window request from an unowned renderer` |
| 0006：窗标题保住 node（D 段读回来的缺陷） | 0004 的 `setTitle` 被文档自己的 `<title>` 覆盖，实测 `getTitle()` 只剩 `"Xaihi"` ⇒ 使用者辨认"哪个窗是哪个 node"的唯一读回面没了。修法：自家窗里拦住 `page-title-updated`。改后 D 段读到 `title="Xaihi · xaihi-sleept"` |
| 这一轮抓出的三条尺自己的假绿 | ① 只跑 `bundle` 会把上一次的 tsc 产物再打包一遍 —— 减法对照实测：摘掉 0005/0006 重放 4/4、只 bundle（rc=0）⇒ `--verify` 仍报两条 true；补 `tsc -b .` 再 bundle ⇒ 产物 `xaihiOwnedSender` 命中 0、`--verify` **rc=1 点名 0005**。② `page-title-updated` 在整个 `lib/main.js` 里能搜到上游别的模块（摘掉 0006 后仍有 1 处）⇒ 尺改成只查 `openXaihiDocumentWindow` 函数体切片，并自带"抹掉那一行必须读不到"的减法对照。③ 主框导航失败会替我按下上游恢复态（`main.ts:1170-1174`：`did-fail-load` 除 `-3` 一律 `reportFatal`）——上一轮 D 段收尾紧跟一串 `close()` 的那次导航抛 `ERR_FAILED (-2)`，之后 `getAllWindows()` 读回空数组；主窗导航因此挪到复位段，收尾只 show/close |
| 那条"第一次不落地"收口：尺选错了窗，猜测那句是错的 | 只动一个变量的实验（开文档窗 → `close()` 不等 `closed` → 立刻对"主窗"发求值）4 轮读数 `15002/15003/15003 ms TIMEOUT + 1ms TypeError: Object has been destroyed`，而每轮第二次尝试都 10–21 ms。根因是 `SCAN` 的 `main()` 取 `getAllWindows()` **列表第一个**，而那个顺序不等于创建顺序 ⇒ 正在销毁的子窗被当主窗，对它的 promise 永不落地。A/B：只换成"按 `w.id` 取最小"（自家窗永远后建、id 更大）⇒ 4 轮全 22–27 ms、0 异常。处理是改选法并**删掉那条"基础设施步允许读第二次"的盲目重试**；之后连跑两次 `live-check` 都是 45 条 OK、0 FAIL、无一条求值超时（改前同一步连续三次运行都挂）。原先写进文档的那句"执行上下文未稳"是**没量就写的错话**，已随本节撤回 |
| stock-shell 那一档的屏上证据（真构建，不是注入） | 先证注入冒充不了：CDP `addScriptToEvaluateOnNewDocument` 把 `window.dshDesktop` 重定义成官方那 6 个成员后，同窗重载读回仍是 `attr=supported`/`verb=object`（preload 的 contextBridge 在注入之后暴露）⇒ `live-check` 的 I 段现在把这件事钉成判据（期望注入失败）。真那一档改**构建产物** `apps/desktop/lib/preload-app.cjs`（删掉 `xaihiWindow` 那一条 126 B，被跟踪源码没动，`dirty=0` 不受影响）：读回 `Object.keys(dshDesktop)=browser,deviceInfo,keyboard,protocolVersion,shortcuts,updates`，Xaihi 文档窗里 `attr="stock-shell"`、正文「独立窗：不可用 —— 官方桌面端没有这个动词」，探针板在场、`body.innerText` 300 字 ⇒ 决定 4 的"不崩、不空白、不伪造"各有读数。恢复用 `run bundle`（rc=0），重建产物与实验前副本 `diff -q` 逐字相同；之后 `live-check` **45 条 OK、rc=0**。这仍**不等于** R8(a)：那条要真装官方 DMG + 应用内插件管理器，前置是 R9 发布包 |
| 0009：动词收 input 对象并可带新建尺寸 | 形状照基线 `OpenComponentWindowInput`（`Xiranite/src/backend/runtime/runtime.ts:125-132`），尺寸由调用方带并按 ADR-0013 存在 Xaihi 侧（壳不开第二份存储）；校验在纯模块 `normalizeXaihiWindowSize`（下界同 `createWindow` 的 520/600、上界 12000，半套尺寸整条拒），尺寸只作用于新建那一次。`--verify` 12 条尺寸用例带"合法尺寸被吞即算尺瞎"的减法对照；活体 L 段五条（`live-check` **59 条 OK**）：`900x700` 逐字读回、同 node 再问 `alreadyOpen=true` 且尺寸不变、半套与越界各按 `width and height must both be integers…` 拒。**同处记下十一个成员的契约缺口**：今天只有 `open` 与"能力位的开窗那一格"有证据，`controlMain/controlComponent/openDevTools/getFrame/setFrame/subscribeFrameChanges/startDragging` 未提供，按 id 的 `close` 也没有 ⇒ 搬运那刀接 `windowService.ts` 时要先接降级再接触点（决定 4），逐条表在 `desktop/README.md` 的 0009 一节。**这一行写下之后，后半就过时了**：`focus / close / getFrame / setFrame` 四格由 0010 补上（见下一行），未提供的只剩 `controlMain / controlComponent / openDevTools / subscribeFrameChanges / startDragging` |
| 0010：寻址四条（focus / close / getBounds / setBounds） | 边界放在**登记表**上而不是 id 校验上：四条只认 `xaihiDocumentWindows` 那张表，发起者闸与开窗共用 ⇒ 拿产品主窗的 id 来问也报 `unknown window`，够不到欢迎窗或别人的窗；`close` 之后同 id 读不回来（`closed` 回调真在更新表）。`setBounds` 回读的是 `setBounds()` 之后再 `getBounds()` 量出来的那份（屏幕会 clamp，不许把调用方给的对象原样报回去），尺寸界复用 0009 的 `normalizeXaihiWindowSize`（上下界只在一处写数），坐标只收有限整数、**小数坐标整条拒**。`--verify`：通道判据从"数 26"改成"数 30 **且逐条点得出四条名字**"（只数条数会漏掉少一条功能多一条别的这种漂移），另加 8 条矩形用例。活体 M 段八条 ⇒ `live-check` **67 条 OK、rc=0**：`900x700` 读回、`{120,140,1100,850}` 与主进程 `liveBounds` 四元组逐字相同、`{x:1.5}` 被拒、窗内 `focus(self)` 成功、`getBounds(mainId=1)` 与关窗后再问都 `unknown window`、`close` 不多开别的窗 |
| K 段：窗到窗补齐 | 由产品文档转达开第一个节点窗（`windowId=30`），在那个窗里 `window.open(自家文档?node=第三个 node)` ⇒ `popup="null"` 且原生窗恰好一个（`windowId=31`）、URL 与标题跟着新 node、收尾 `ownedLeft=0`；`live-check` **54 条 OK、rc=0**。这一格补的是 D（子窗调 IPC 动词）与 E（主窗停在文档上时 `window.open`）都没覆盖的组合。顺带一条自新：写这条判据时我又漏了一次 `documentPath`，撞上 0007 故意保留的拒绝 —— "从产品文档起窗必须带路径"这件事在尺里已经第三次出现，现在钉在两条判据的注释上 |
| 0008：面板形态下那一下真能开窗（顺带消掉一个不必要的契约改动） | E/F 段先前量到的两条死路里，`window.open` 这一条其实不用等桥：被嵌帧调 `window.open(/xaihi/ui/<rev>/index.html?node=X)` 时，`HandlerDetails` 只给得到窗的主帧 URL（= 产品文档），0002 因此判 deny（实测 `createdCount: 0`）。0008 只把 opener 判据放宽到"自家文档 或 产品文档根/`index.html`"，目标路由形状、`node` 单键、超长/解析失败四条守卫一条不松，0004 的去重把反复弹窗的上限收成节点数。判策是纯模块：用例从 11 条长到 **15 条**（新增"产品文档 opener ⇒ 放行"两条与"冒充 host / 自家资源路径 / https 冒充"三条反向），另加一条独立减法对照"产品文档 opener 也开不出自家非文档目标"。活体 J 段六条（`live-check` **51 条 OK、rc=0**）：`frame.dshDesktop=undefined` 复现前提、`popup=null` 而原生窗恰好一个、URL 与标题跟着 node、同目标再问不叠窗、同帧开 `dsh-app://app/index.html` 不长窗。⇒ **"要不要在桥的动词表外立第十组能力"这个问题对开窗这一格不再存在**：节点界面在自己的文档里直接 `window.open` 就行，不需要 `openNodeWindow` 动词转达；0007 那条转达仍然有用（产品文档自己发起的面板/工具窗） |
| 冷重放复现到 7 条 patch | `--reset --force`（退回 pin）⇒ `sync` 得 `head=8d8405de tree=9eb91c1de6a5 patches=7/7 dirty=0`，**树哈希与 reset 前那次逐字相同**（幂等判据本体）⇒ `pnpm run build` rc=0（gateway `lib/` 0 个 JS → 2 个，症状链那条前置复现）⇒ `--verify` rc=0（0002/0003/0005/0006/0007 全部接进 bundle）⇒ `dev-shell check` rc=0（bundles=6）⇒ `dev-shell verify` rc=0，`live-check` **42 条 OK**。逐条表在 `desktop/README.md` 的"冷重放"一节 |
| 冷重放复现到 16 条 patch：第一遍红在构建面，红出一条新尺 | `--reset --force` ⇒ `sync` 得 `head=9d34b2be tree=97192701cd14 patches=16/16 dirty=0`（幂等仍成立）⇒ **`pnpm run build` rc=1**：`apps/desktop/src/ipc.ts(5,91): error TS6307 — 'xaihi-window-policy.ts' is not listed within the file list of project 'tsconfig.client.json'`。归因不是环境：客户端面把 `apps/desktop/src` 逐个登记在 include，0011 让 `ipc.ts` 起 `import type` 那份纯模块却没登记它；而 7 条那次同一条命令是 rc=0（**当时 0011 还不存在**），此后每轮跑的 `tsc -b .` 与 desktop 的 `bundle` 都绕得过 `build:lib:client` ⇒ 系列的中间态从 0011 起就编不动整条构建，`desktop/README.md` 第 75 行钉的顺序本来就写着 `pnpm run build`，是我执行时换成了两条更窄的。修法把登记补进 **0011 自己**（reset ⇒ `am` 0001..0011 ⇒ 改 ⇒ `commit --amend --only tsconfig.client.json` ⇒ `format-patch`；与旧 patch 逐字只差那一条 hunk，`4 files changed, 82 insertions(+)` → `5 files changed, 83 insertions(+)`）⇒ 重放 `head=64683866 tree=b55efa8c1286 patches=16/16 dirty=0` ⇒ `pnpm run build` **rc=0**（`347 client artifact(s)`）⇒ `--verify` rc=0（新尺 `种子=6 未登记=0`）⇒ `dev-shell check` rc=0（bundles=6）⇒ 起壳 ⇒ `dev-shell verify` rc=0、**89 条 OK、0 FAIL**（全屏那格照旧只算观察：本机连普通 `BrowserWindow` 也 `plainOk:false`，不算已验）。新尺的阳性对照两层：尺内内存里摘掉登记必须点得出 `xaihi-window-policy.ts`；**真树上**删掉那一行 ⇒ `种子 6→5、未登记=1（ipc.ts -> xaihi-window-policy.ts）、rc=1`，按原字节补回后 `dirty=0`。上游那五个种子文件违规实测 0 条 ⇒ 这把尺钉的是上游已经在执行的规矩，不是我给自己加的红线 |
| 0007：面板形态下的"开独立窗"由产品文档转达 | 先量到两条死路：`typeof frame.contentWindow.dshDesktop === 'undefined'`（Electron 44 的 preload 不进子帧），而子帧自己 `window.open(自家文档)` ⇒ `popup="null"` 且 `createdCount: 0` —— 机制是 0002 的 handler 拿的 `openerUrl` 是**窗的主帧 URL**，`HandlerDetails`（`electron.d.ts:21990`）里根本没有"哪一帧发起"的字段（`referrer` 不能当安全主语）。0007 于是加一条受限分支：`open(node, documentPath?)`，带路径时只接受主窗（产品文档）这一支且路径必须过 `/^\/xaihi\/ui\/[0-9a-f]{12}\/index\.html$/u`，不带路径与 0005 逐字同形。实机 H 段七条（**live-check 42 条 OK、rc=0**）：新窗 URL 逐字等于目标、标题带 node、同 node 再问走去重、路径穿越与外部绝对地址按 `document path must match` 拒、缺路径仍是 `only the Xaihi UI document`。SDK 同步收第二条参数时被自家测试抓出一处"只转发第一个参数"的半接（`invalid-document-path`/透传用例 rc=1），补全后 `desktop-windows.spec.ts` 10 条绿。**还差的那半格**：桥的动词表（`SHELL_SERVED_METHODS` / `NODE_CAPABILITY_IDS`，`packages/node-sdk/src/host-bridge.ts:45/130/163`）里没有 `openNodeWindow`，所以被嵌帧现在没法**向转达方提出**这个请求——这条要动我们自己的桥契约，不属于壳侧 patch |
| 0014 / 0015 / 0016：窗控四条答完，其中一条假成功被自家判据当场抓到 | 动作词与结果形状逐字照基线（`runtime.ts:84` 与 `:102-108`）。两条实现讲究：`state` 是**做完之后回读** Electron 三个布尔位归并出来的（纯函数 `xaihiWindowState`，最小化先判，否则 mac 把"缩进 Dock"报成"最大化"）；主窗 `close` 与自家窗 `close` 分开答 —— 前者是上游的 hide-on-close，回 `hidden, not closed` 加 `state:normal`，后者才真销毁回 `closed`。`0015` 是被 P 段逼出来的：`toggle-fullscreen` 打在刚 `maximize` 的窗上标志位不动，而 handler 回 `success:true`，正是决定 4 禁止的"成功但什么都没发生" ⇒ 先解除最大化、等到位、等不到就回 `success:false` + `did not engage`。`0016` 放宽到 8 s 且先把窗带到前台仍不生效，于是做决定性区分：造一个**不带任何我们窗样式**的普通 `BrowserWindow` 再 `setFullScreen(true)` ⇒ `plainOk:false`（darwin / Electron 44.0.0）⇒ **本机会话进不了原生全屏**，不是壳的缺陷也不是窗样式；判据改成钉"要么真进去、要么如实报没进去"（假成功照样红），并把这条读数打成观察、**不算已验**（要在能切 Space 的机器上复量）。`startDragging` 老实回 `supported:false`。活体 P 段十条、通道判据 36 条并逐条点名、另有 10 + 5 条纯函数用例 ⇒ `live-check` **89 条 OK、rc=0**：minimize/restore/maximize 效果量得到、主窗关完 `destroyed:false, visible:false`、devtools 开得出、拖拽与词表外动作和拿主窗 id 走 controlComponent 三条都被按原因拒、自家窗 close 后真消失 |
| 0012 / 0013：尺寸推送与协商措辞 | 基线 `subscribeFrameChanges`（`runtime.ts:150`）落成真推送：自家文档窗的 `resize`/`move` 把矩形发给产品主窗，preload 侧 `subscribeFrameChanges(listener)` 返回退订函数（照壳自己 `keyboard/updates.subscribe` 那一套写法，不另发明）。发信口是模块级变量 `xaihiFrameSink`，由 `createMainWindow` 每次装 —— 因为登记表那个函数在模块作用域，而 `mainWindow` 是工作区的局部量。活体 O 段六条（`live-check` **79 条 OK、rc=0**）：订阅返回 `function`、改尺寸后至少收到一条且`windowId` 全是我们的窗、载荷键**逐字就是** `{windowId,x,y,width,height}`、最后一条报的是生效后的 `210,230,1024,768`、**退订后再挪一次事件数不再涨**（监听器不泄漏）。0013 是同轮的措辞修正：0012 加了推送通道之后，"从通道表数出来的动词条数"开始名不符实（把推送算成寻址动词）⇒ 消息改成直接写那四条名字。另外这条尺又踩了自己定过的规矩一次：产物判据搜 `'move'` 恒假（打包器把单引号规范成双引号，0006 那次已经记过），改成只搜与引号无关的标识符 `xaihiFrameSink` / `publishFrame` / `xaihiWindowFrameChanged` |
| 0011：能力协商逐字段照基线，值由建窗那份 options 推 | 这条防的是**屏上缺陷**而不是补 API：基线 `WindowCapabilities.captionOwner`（`runtime.ts:86-99`）的注释就是说"系统画红绿灯时应用不许再画一套按钮"，界面猜错的两种表现都是看得见的（两套窗控压在红绿灯上 / 根本没有窗控）。规则由构造推：mac `hiddenInset`⇒`system`+`captionInset`、Windows `hidden+titleBarOverlay`⇒`renderer` 且不给位置、其余⇒`system`；红绿灯位置收敛成一份常量（`DARWIN_TRAFFIC_LIGHT_POSITION`，建窗与上报读同一个对象）。两处诚实记录：① 上一版我写了 `window.getTitleBarOverlay?.()` 假装"从窗上读回来"，而 Electron 44 既无 `getTitleBarOverlay` 也无 `getTrafficLightPosition`（现读 `electron.d.ts`）⇒ 那条恒为 `undefined`，是把 Windows 档永远读成 `native` 的假推导，已删，改为构造时就地记一份 `WeakMap`；② 纯函数尺写出来的当场就抓到我把规则整条写反（`native→system` 让 mac 的 inset 也报 `renderer`），用例钉的是规则不是某个平台的值：`inset→system+有位置`、`overlay→renderer+无位置`、**没给位置不许造位置**、条数由真通道表推（`--check` 期望 30→31 且逐条点名）。活体 N 段六条 ⇒ `live-check` **73 条 OK、rc=0**：键集与基线那七个逐字相同（`captionInset` 只在 `system` 档出现，期望按实际返回补进键表再比）、mac 上 `{16,18}`、消息里那句是 `4 verbs`、自家文档窗里读到同一份（与 0010 共用发起者闸） |
| 决定 4 的界面读回第一次真上屏（F 段） | 壳侧动词全绿不等于使用者看得见。bundle 侧新增纯函数档：`describeHostSurface` 只报事实（顶层窗／iframe + 独立窗动词读回），`describeNoBridge` 才允许说"桥等不到"；realm 探针（壳现在发的 `dist-realm`）画 `data-xaihi-window-capability`。实机 **35 条 OK、rc=0**：顶层窗 `attr=supported` 且正文"…独立窗：可用（自家桌面壳已接 0001 的动词）"，与 `typeof window.dshDesktop.xaihiWindow==='object'` 对得上；反向对照把同一份文档嵌进 `<iframe>` ⇒ `attr=no-shell-surface`、文案换档 ⇒ 读回跟着宿主变，不是写死的字符串。单测 12 条 + 阳性对照（把 `supported===true` 改成恒真 ⇒ rc=1、点名 4 条）。**生产入口 `main.tsx` 那一档既没上屏也没编译证据**：`rspack build -c rspack.document.mjs` rc=1、6 条错全在搬运那刀的在飞文件里（`RuntimeSection.tsx`×3、`ClassfDeletionHistoryDialog.tsx`×1、`WorkflowEditor.tsx`×2），错误集里没有我的两个文件 |
| 节点界面上屏的拦路（2026-10-07 08:2x 现读，壳侧无待办） | 上一条那 6 条错已经变成 **4 条**（搬运那刀在动），`pnpm exec rspack build -c rspack.document.mjs` 仍 rc=1。逐条归因：① `src/components/views/settings/RuntimeSection.tsx` 引 `./NodeMemoryProtectionSettings` —— 该文件在盘上**不存在**（现读 `ls` 零命中），是还没搬过来的组件；② `src/nodes/classf/ClassfDeletionHistoryDialog.tsx` 引 `@xiranite/node-classf/deletion-history` —— 全仓**没有任何 package.json 用 `@xiranite/` 这个 scope**（现读零命中），所以这条 specifier 永远解析不出来，它是 ADR-0010 说的那类"会随代码活下去的自称"漏在了**导入路径**上，不是注释；③④ `src/nodes/marku/WorkflowEditor.tsx` 引 `@xyflow/react` 与它的 `style.css` —— `packages/ui-host/package.json` 里 **ABSENT**，根 `node_modules/@xyflow` 也不存在 ⇒ 这是"要不要引入这个第三方依赖"的决定，归搬运那刀，不该由我替它装。**我这一侧的读数当场重取，全绿**：`rspack.realm.mjs` rc=0（探针板那条路径编得动）、`boot-notice.spec.ts` 12 条通过、`desktop-windows.spec.ts` 11 条通过、16 条 patch 冷重放链 `pnpm run build` / `--verify` / `dev-shell check` / `dev-shell verify`（89 条 OK）各自 rc=0。所以"节点自己的界面在自家窗里上屏"这半格现在**只剩搬运 lane 的四条未解析引用**，壳侧没有待办 |
| 退化文案那份纯函数带着**两条类型错**活了一整轮（08:2x 现读并修掉） | 决定 4 那份 `boot-notice.ts` 此前只有两项证据：单测 12 条绿、`rspack.realm.mjs` rc=0 —— **两项都不做类型检查**，所以它带着红字活了一整轮而没人看见：整包 `pnpm exec tsc --noEmit -p tsconfig.json` 现读 994 条错，其中 **2 条在我的文件**（`exactOptionalPropertyTypes` 下 `windowReason` 被塞进 `undefined`；`noUncheckedIndexedAccess` 下把 `surface.lines[0]` 当 `string` 用）。修法各一条：没原因就**不放这个键**；那句直接调 `whereLine(probe)`，不靠 `lines` 的下标位置。读数三条一起取：`src/document` 命中 **2→0**、整包错数 **994→992**（只减我这两条、零新增）、`boot-notice.spec.ts` 12 条与 `rspack.realm.mjs` 都仍 rc=0。**这不是顺手清理**：顶层窗那一格曾经把 `undefined` 写进一个"有原因"才存在的键里，而决定 4 要的正是界面上读回来的话必须与现场一致——键在不在与值是什么是两件事。剩下那 992 条在搬运 lane 的在飞文件里（`@xiranite/shared` 一类整片解析不出），不归我修 |
| 顶层自家窗里"桥的对面"量过了：没有对面，但有同源服务面（08:4x 一次性探针，未接线） | **先更正上一条**：那句"只剩搬运 lane 的四条未解析引用"只数了构建面这一半，桥这一半当时还是推断，现在量完了。界面上屏只差搬运树这一句此前是**推断**，现在有四条读数：从产品文档 `open(node, {documentPath})` 开出的那个窗（`id=4`，URL `dsh-app://app/xaihi/ui/dc1738470773/index.html?node=xaihi-linedup`）里现读 —— ① `window.parent === window` ⇒ **true**（顶层，桥的对面按构造不存在）；② `window.opener === null` ⇒ **true**（`typeof` 是 `object` 但值就是 `null`）⇒ "复用 `bridge-document` 那条 postMessage，只是把对面从父帧换成 opener" 这条路**在本壳里走不通**，因为窗是壳自己 `new BrowserWindow` 出来的，不是 Chromium 的 popup（0008 那条 `popup="null"` 的同一条事实的另一面）；③ 同一来源的服务面**读得到**：`fetch('/xaihi/manifest.json')` ⇒ `{status:200, rev:"dc1738470773"}` ⇒ "顶层窗能不能问到东西"与"顶层窗能不能拿到工作台那一侧的 `host` 对象"是两件事，前者已经是 yes；④ 我顺手试的 `fetch('/api/health')` ⇒ **404**，这条**不构成结论**，只说明我挑的那个路径不存在，DSH 的 RPC/事件面到底能不能被任意 UI 文档直接调是下一步要量的（或一条 proposal）。`shellSurface=object`、`verb=function`、探针板 `capAttr=supported`、正文仍是那句"界面内容等搬运树建出来之后由 main.tsx 挂载"。**于是"节点界面进自家窗"剩三条路，选哪条是使用者的决定**：壳里再牵一条产品窗↔自家窗的中继（新 patch，等于把桥搬进壳）／顶层窗的 host 直接走同源服务面（要 DSH 侧有可被 UI 文档调的 RPC 面）／维持现状（顶层窗只出探针与读回面，节点界面只在被嵌那一格）。探针脚本是一次性的，没进判据。**同一轮之后收了一半进判据**：`live-check` 的 F 段现在在这个顶层自家文档窗里三条一起问（`/xaihi/manifest.json` 要 200 且 `rev` 等于**这个窗 URL 上那 12 位**、编出来的 API 路径与编出来的 rev 都要 404），条数 89→**91、rc=0**；反向那两条钉的是"任何 fetch 都回 200"这种假绿（整页被重写成欢迎面也会照绿），而服务面真没挂上时 `Promise.all` 直接 reject ⇒ F 段整个红，不是静默跳过。`window.opener === null` 那一半**故意不进判据**：把它钉死等于替使用者否掉"壳内中继"之外的一条路，那是还没拍的决定 |
| 上一条留的那三条路，第二条**量过了：在现模型里走不通**（08:5x—09:0x，一次性探针，全程 GET/GET+握手，一条 RPC 都没 invoke） | 先把机制读清楚：桌面壳把网关的流面**只给主窗**——`apps/desktop/src/main.ts:1008` 在 `onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] })` 里判 `details.webContentsId !== mainWindow?.webContents.id` 就 `callback({})`；只有主窗那一份才被改写成 `origin: target.origin` + `cookie: hostCookie` + `sec-fetch-site: same-origin`（`:1011-1018`）。而 `packages/client/connection/src/rpc-host.ts:110` 的 `admit()` 是"过了 Host/Origin 闸**并且** `browserAuth.isAuthenticated` 就整个发 operator Peer"，没有中间档。实机三条：① 顶层自家文档窗里 `window.dshDesktopBoot.ready()` **成立**（`keys=["injections","streamBaseUrl"]`，`streamBaseUrl=http://127.0.0.1:19387`，11 条 injections）——它是 preload 的 `dshDesktopBoot`（`preload-app.ts:104-107`），sender 闸按 hostname `app` 放，所以我们的窗**读得到那条路的门牌**；② 同一个窗里 `new WebSocket('ws://127.0.0.1:19387/api/remote.mux')` ⇒ `opened:false, readyState:3`；③ **同一时刻**逐窗对照，主窗（`id=1`，`dsh-app://app/`）同一条 URL ⇒ `opened:true` —— 差别只在 webContentsId，不在 CSP、不在网络。顺带把同源那条也量了：`/api`、`/api/remote.mux`、编出来的路径在**两只窗里都 404**（`protocol.handle` 把非静态路径转给 Host，`:766-773`，而网关对未 claim 的 GET 就是 404）⇒ `dsh-app://app` 这个 origin 从来不是 RPC 通路。**于是"顶层窗的 host 走同源/网关"这条便宜路判死**，剩下两条里有一条反而不需要新 patch：自家服务面（`/xaihi/*`）在任何 `app` 窗里都是通的（F 段 91 条里那条 200），而 Xaihi 的服务就跑在 Host 进程里、服务端半边本来就握着 `ctx.remote`——把节点界面要的 host 动词落到**我们自己的服务路由**上，既不动壳也不伸手去拿 operator 范围（那份 cookie 只该住在主窗与主进程）。代价说清楚：这条路要我们自己实现一层 host 语义（`document-host` 那套动词的服务端等价物），不是白来的。**要不要走这条、还是回去做第 1 条（壳内中继），是使用者的决定，我不替他拍** |
| 路线 (A) 落地：顶层窗经 `/xaihi/host` 问宿主，头less 实机八条全过（2026-10-07 12:2x） | **不新增壳侧 patch、不要求 DSH 开口子**：这条路由复用同一份桥的线上形状（`parseBridgeMessage` + `createShellBridge` 原封不动），只把载体从 postMessage 换成同源 HTTP——文档侧新增 `createHttpDocumentBridge`（`packages/node-sdk/src/bridge-document.ts`），`realm.ts` 按容器选载体（有父帧走 postMessage，顶层窗走 `/xaihi/host`），我这边把 `main.tsx` 顶层那一格改成「等握手再挂界面」（等不到才画读回面，判据 `host-route-silent`，文案也说清了是路由没应答）——**但这一格没落进去**：`packages/ui-host/src/document/main.tsx` 被搬运那刀重写成 33 行的无条件 `createRoot(...).render(<App />)`，握手等待与读回面整块没了。我不在别人在飞的文件上覆盖回去，也不把这格提交进我的分支；后果钉在这里：那样一来决定 4 要的「退化在界面上读得回来」在生产入口上没有落点（`describeNoBridge` 此刻没有生产调用者），而第一帧的每条 host 调用都会以 `not-ready` 抛。要么恢复那次等待，要么把读回面搬进 App 自己的第一帧——两条都在使用者的一句话范围内，等他定。安全边界只有一条命名空间闸（`fenceSettings`）：可碰的行 = `@hibernalglow/` scope 下**当下真在 loader 表里**的那些行 + 状态行，读一律 `redactSecrets`。为什么按行表而不是抄节点名单：实例行的 id 会变成实例名（2026-10-06 实测 `8f3ca9e1`），抄名单会把那种行挡在外面——`xaihiNamespaces` 两条测试分别钉住实例行要收、`disabled` 行与别人家的行要不收。**头less 实机（真 DSH 设置服务、隔离开发宿主、全程无 GUI）八条**：① hello ⇒ `granted=[contract,state,config]`、`settingsNs=xaihi-core`、`env` 键**不在场**（不替使用者编主题，界面上读得到那句退化）；② `config.get` ⇒ 28 行、外流行 `[]`；③ `state.patchData` ⇒ 写 ok、`state.getData` 读回 `{"marks":["live-6876"]}` `revision=1`；④ 越界读 ⇒ `config-namespace-missing`；⑤ 越界写 ⇒ `namespace-not-allowed` 且补丁文件里 `xaihiProbe` 命中 **0 次**（根本没跑到对面）；⑥ 落盘证据 ⇒ 标记出现在 profile 补丁文件 `nodeState` 那一段；⑦ 新 sid 没握手 ⇒ `not-negotiated`；⑧ 载体判据 ⇒ `GET` 405、坏 sid `bad-session-id`、超上界的体 **413**。单测另有 18 条（`packages/core/tests/host-routes.spec.ts`）与 8 条（`packages/node-sdk/tests/document-http-bridge.spec.ts`）；两条阳性对照：把闸拆成「什么都允许」⇒ 同一条越界写必须真的落到服务面；413 那条改用**真 HTTP 套接字**跑——假 `res` 收得到 `writeHead` 却收不到「连接被掐断」，实机 curl 正是读到 `000` 才暴露我在超限分支里 `req.destroy()` 把响应一起毁了。**两侧都是生产代码的一条跨边界测**（`packages/core/tests/host-route-over-http-bridge.spec.ts`，真套接字、6 条）：握手答出的组与命名空间两侧一致；`config.save` 穿过载体与闸真的落到设置面并回 revision；**一条会话写进去的状态，另一条独立会话读得回来**（证的是落到底下而不是会话缓存），且别人的段落不出门；越界写被拒之后设置面的 revision 与值都没动；未授予的组在对面就被拒；端口整个不在时握手回「什么都没给」并说「宿主路由不可达」，后续调用在本地就 `refused`、不再发一条去等 30 秒。界面那一层（`createDocumentHost` 九组）另有 `packages/ui-host/tests/document-host.spec.ts` 吃的是 `DocumentBridge` 这个形状，本条证的正是这个形状在 HTTP 载体上成立。 **这条路线今天真被装进产物的消费点**：`packages/ui-host/src/document/host-probe.ts` 的 `runHostRoundTrip`（纯数据，不碰 DOM）由 realm 装载器在握手之后调用——板子现在念得出 `能力=config, state, contract`、`config.getUi → 对面那格 ns=xaihi-core revision=…`、`state 往返 crossed=true`，以及没给的每一组带一句原因；`data-xaihi-host-roundtrip` / `data-xaihi-host-capabilities` 是给活体判据读的口子，`rspack.realm.mjs` rc=0 且产物里搜得到那两个属性名（源码里有定义 ≠ 落进产物，这条老规矩一起取）。配套测 4 条，两侧都是生产代码（`createDocumentBridge` + `createShellBridge`，只假 DSH 的设置面）：通了的那条断到对面 rows 里真有标记；**阳性对照**是拿掉设置面 ⇒ 读数必须报 `refused` 且写侧/读侧各留一份原因，不许绿；未握手那条报 `version:null` + `not-ready`（不抛）；对面回的格子缺 `ns` 时报 `bad-shape` 而不是猜一个。写侧与读侧的失败分成两格是故意的：「没写成」与「写成了但读不回」要能分开。 **真浏览器里跑通了，而且不占使用者的桌面**：用 Playwright 缓存里的 `chrome-headless-shell`（无窗口、不抢焦点）对着隔离开发宿主取 `http://127.0.0.1:3199/xaihi/ui/<rev>/index.html?node=xaihi-linedup`，`--virtual-time-budget=15000 --dump-dom` 之后 DOM 里读回 `data-xaihi-host-roundtrip="crossed"`、`data-xaihi-host-capabilities="contract,state,config"`，板上文字是「host 面（合同 1.0.0）…config.getUi → 对面那格 ns=xaihi-core revision=0…state 往返 → crossed=true 写侧=ok 读侧=ok」，后面跟着没给的那几组与各自的原因（workspace / runner / clipboard…）。同一条链上第一次有了**浏览器侧的负控**：`?node=Not-A-Node` 连文档都出不来，对面回的是 `node must be a manifest id matching [a-z0-9][a-z0-9_-]{0,63}` —— 与桥上 `state.*` 用的是同一份 `NODE_ID_PATTERN`，两道门一份词表这件事在浏览器里也读得回来。所以这条路线的验收不再需要先拿到使用者的桌面时间窗；Electron 那一格（Q 段）剩下的只是壳自己那部分（IPC 开窗、hide-on-close、按 webContents 的授权），而这些此前已有活体读数（同一只窗里 `dshDesktopBoot.ready` 成立、`载体=host-http`）。 **服务侧产物也复核过（无 GUI）**：起隔离开发宿主后按 manifest 给的 rev 去取 `/xaihi/ui/<rev>/main.js`，那份 218,366 B 的产物里搜得到 `data-xaihi-host-roundtrip` 与 `data-xaihi-host-capabilities` 各 1 处、`config.getUi` 那句也在——证的是「发出去的那一份」带上了消费点，不是只有本地 dist 编好了。`live-check` 的 Q 段相应加了一条：等那块板从 `pending` 落地（页内轮询，上限 12 秒），断 `roundtrip=crossed` 且能力里有 config/state，读的是产物里的板。 **一处归属要点名**：`packages/core/src/index.ts` 是整文件提交的，里面搭着别人那一刀——`nodeMemoryProtection` 的 `Config` 声明（`MemoryPolicy` / `NodeMemoryProtection` / `DEFAULT_NODE_MEMORY_PROTECTION` 与 `memoryPolicySchema` / `nodeMemoryProtectionSchema`，约 34 行）。那不是我写的，我也没替它接线，但 `git blame` 会把它记在这条提交上，所以在此说明归属。**还没验的那半格**：Q 段（同一批判据在真顶层窗里跑一遍）代码已写、逐步吞异常与 `at`/`bootTries`/`bootError` 读数已加，但**没跑**——使用者要求 GUI 验证另开工位（起第二份壳会在他的日常桌面里弹「已经打开了一个 DSH 桌面端」并抢焦点），等一个约定的时间窗。 |
| E 段：0002 的 `window.open` 真路拿到活体证据 | 此前 0002 只有 11 条单元用例 + 编译，"页面自己开窗"这一格在活体上是空的。实机（`live-check` **32 条 OK、rc=0**）：真文档页里 `window.open(自家文档)` ⇒ `popup="null"`（弹出窗没长出来）而窗口 id 差量恰好 1，那窗 `url` 逐字等于目标、标题 `Xaihi · xaihi-sleept`；对照 `window.open('dsh-app://app/index.html')` ⇒ `null` 且不长窗。外链那条不在活体上取证——命中分支是 `shell.openExternal`，真跑会打开使用者的浏览器 |
| 0004：按 node 去重 | 同一个 node 连开两次 ⇒ 窗口数不变、第二次回报 `alreadyOpen=true` 且 `windowId` 与第一次相同；换 node 才 +1 一窗；窗标题带 node 名（`live-check` C 段五条判据，18/18 绿）。两条开窗路（IPC 动词与 `window.open` 判策）汇进同一张登记表 ⇒ 不会出现"一条路去重、另一条路叠窗" |
| 从零重放后重拿绿 | deinit → sync（tree 哈希不变 `41ef226b8b0c`）→ install → **pnpm run build** → 起壳 ⇒ `live-check` 13/13 绿。中途红过一次，根因不是 patch：只跑 `build:lib:host` 时 `packages/api/gateway/lib/` 一个 JS 都没有，dev project 软链到工作树 ⇒ `/api/*` 404 ⇒ 欢迎面 `Web request failed` ⇒ 主进程卡在原生模态框；`live-check` 的 30 秒超时把这件事报成红而不是挂死。症状链与顺序钉在 `desktop/README.md` 的启动配方一节 |
| 0003 + 真内容进第二窗 | `XAIHI_DESKTOP_PROFILE` 让壳 boot `profiles/xaihi`（`~/.dsh` 那份 `profiles/desktop` 没碰）；`desktop/live-check.mjs` 13 条全绿：`ui.rev=b6a8cb8bc96f`、正文回显 `rev=… · node=xaihi-linedup`、入口 `./main.js`、`open` ⇒ `windowId=4` 且窗口数 2→3、新窗同一份文档。踩到的装配真相写进 `desktop/README.md`：拷 profile 会崩锁、`allowBuilds` 占位串必须填、`dsh plugin` 只转发 pnpm（没有 enable 动词，启用集是 `dsh.profile.bundles`）、`dsh-web-app` 的 `latest` 撒谎要点名版本、manifest 顶层 rev 不是 UI rev |
| 实机九条判据 | `node desktop/live-check.mjs` rc=0：产品文档上 `typeof xaihiWindow='object'`、对照 `browser` 仍在、`open('findz')` 在非自家文档上按原因被拒；导成 URL 形状合法的自家文档后 `RESOLVED windowId=3`、窗口数 2→3、新窗带壳改写的 `?node=findz`。前置根因：`apps/web/dist` 曾为 0 文件 ⇒ 被 `welcome-backend.ts:49-51` 报成 `Web authentication failed`，补 `build:web`（rc=0，196 个文件）后消失。**B 段是合成文档**，所以只证壳侧路径与建窗，不证 Xaihi 真内容渲染 |
| 0002 落地与类型结论 | `pnpm run build:lib:host` rc=0（0 条 TS 错）⇒ `pnpm exec tsc -b apps/desktop` rc=0，且 `apps/desktop/lib/types/xaihi-window-policy.js` 在场（新文件进了 program，不是被显式清单跳过）；`pnpm --filter @deepseek-ai/dsh-desktop run bundle` rc=0（306 ms），`lib/main.js`（493,562 B）含 `resolveXaihiDocumentTarget`。0002 的 11 条判策用例实跑 rc=0，摘掉 patch ⇒ `--verify` rc=1。**Electron 实机一次都没起**（`--ignore-scripts` 连二进制都没下，约 120 MB） |
| 0001 的验证强度 | 三处改动 `node --check` rc=0 + 扰动对照 rc=1（尺看得见）⇒ 语法为真；`ipc.ts` 三条 import 全是 `import type`，可以**直接实跑**：断言 26 条通道、`xaihiWindowOpen='dsh-desktop:xaihi-window-open'`、`browserAcquire` 在场 ⇒ rc=0，期望值换错 ⇒ rc=1。`main.ts` 的运行时行为与上游 `tsc` **未验**（要整个 vendor `pnpm install`）⇒ 这条只能写成 parse + 局部实跑 |

### 与 `AGENTS.md` 的冲突及处理

`AGENTS.md` 禁 `git add/commit` 并要求写操作走 GitButler，但 **submodule 注册没有 `but` 等价物**
（`git submodule add` 是唯一入口）。处理：注册这一步留作**被点名的 raw-git 例外**，已写进
`AGENTS.md`；其余（含 gitlink 的提交）仍走 `but commit`，并且提交后要 `git ls-tree` 读回 160000
那条才算落地——`but status` 会把 `desktop/dsh` 当一条普通变更显示（实测 id `sspk`），
但这不等于它真进了提交。
