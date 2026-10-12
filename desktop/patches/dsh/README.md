# patches/dsh/

一条 patch 一个文件，命名 `NNNN-<短 slug>.patch`（`0001-xaihi-document-window.patch`）。
必须是 `git format-patch` 能产出的形状（带 commit message 与作者），这样每条都能回答
"为什么要有它"和"上游落地后该撤哪一条"。

## 规则

- 每条 patch 的 commit message 要指名它对应 `../Xaihi/docs/upstream-proposals.md` 的哪一条
  （P5 / P6），上游接了就在文件名前加 `DO-NOT-USE-` 并删掉，而不是留着当"保险"。
- **不许改插件契约**（ADR-0011 决定 4）：不许要求 bundle 提供只有本壳才读的字段。
- 打不进来的 patch 就是红，不许 `--3way` 蒙过去掉别人的行。

## 计划中的第一批

| # | 目标 | 上游落点（现读行号，会随 rebase 变） | 对应 proposal |
|---|---|---|---|
| 0001 | Xaihi 自有文档的原生窗：一份 `dsh-app` 文档 + 一个窗 | `apps/desktop/src/main.ts:206`（`createWindow`）与 `main.ts:1066`（唯一调用点）；`apps/desktop/src/ipc.ts:8-34` 加 window 通道；preload | P5 |
| 0002 | **已落地并实机验过**：页面递来的 `window.open` 先过一条纯 URL 判策，自家文档才转成原生次级窗（E 段：`popup=null` 而原生窗恰好出来一个；自家非文档路径的 `window.open` 不长窗。外链那条只走单元用例——它的命中分支是 `shell.openExternal`，活体跑会真打开使用者的浏览器） | 新模块 `apps/desktop/src/xaihi-window-policy.ts` + `main.ts:239-242` 的 `setWindowOpenHandler` 接线 | P5 |
| 0003 | **已落地**：`XAIHI_DESKTOP_PROFILE` 让壳选 profile，缺省仍 `desktop`，形状不合直接抛 | `apps/desktop/src/paths.ts`（`resolveDesktopProfileName`） | P6 第 1 条 |

| 0004 | **已落地**：同一个 node 的窗按寻址键去重（重复请求聚焦既有窗并回报 `alreadyOpen`），换 node 才多开；窗标题带 node 名（标题在运行时才保住要靠 0006） | `xaihi-window-policy.ts` 的 `xaihiWindowKey` + `main.ts` 的登记表（两条开窗路汇一处） | 无（我们的产品行为） |
| 0005 | **已落地**：`xaihiWindow.open` 的发起者放宽到"任一活着的自家文档窗"，目标 URL 改从发起者自己的文档取；四条形状守卫一条不松 | `main.ts` 的 `xaihiOwnedSender` + 那条 IPC handler（原来是 `assertProductSender`，主语只有主窗） | P5 的续条（官方壳没有"次级窗再开次级窗"这一层） |
| 0006 | **已落地**：自家文档窗保住带 node 的标题（拦住 `page-title-updated`） | `main.ts` 的 `openXaihiDocumentWindow` | 无（读回面；标题是使用者辨认窗口的唯一线索） |

| 0007 | **已落地**：产品文档可以替**被嵌在自己里面的** Xaihi 帧转达开窗（Electron 44 的 preload 不进子帧，`HandlerDetails` 又没有"哪一帧发起的"，所以 `window.open` 那条路在嵌入形态下量到的是 0 个窗）。带路径时只有主窗这一支被接受，路径必须过壳自己的路由形状；不带路径时行为与 0005 逐字相同 | `main.ts` 的 `xaihiWindowOpen` handler（新增 `isMainDocument && documentPath !== undefined` 分支）+ `ipc.ts` 的 `open(node, documentPath?)` 类型 + `preload-app.ts` 透传 | P5 的续条（原样抄在 `docs/upstream-proposals.md`） |
| 0008 | **已落地**：被嵌在产品文档里的 Xaihi 帧也能请求开窗 —— `window.open` 的 opener 从"只有自家文档"放宽到"自家文档 或 产品文档根/`index.html`"，目标形状、`node` 单键、超长与解析失败四条守卫一条不松；0004 的去重把"反复弹窗"的上限收成节点数本身 | `apps/desktop/src/xaihi-window-policy.ts` 的 `resolveXaihiDocumentTarget`（`PRODUCT_DOCUMENT_PATHS` + `isProductDocument`）| P8（上游给不了发起帧身份时的最小绕法） |
| 0009 | **已落地**：`xaihiWindow.open` 的第二参数改成 input 对象（`{documentPath?, width?, height?}`，形状照基线 `OpenComponentWindowInput`），可带**新建那一次**的尺寸；尺寸由调用方持久化（ADR-0013），壳只做纯校验与上下界，半套尺寸整条拒 | `xaihi-window-policy.ts` 的 `normalizeXaihiWindowSize` + `main.ts` 的 handler 与 `openXaihiDocumentWindow(size?)` + `ipc.ts` 类型 + preload | 基线窗契约的落点（与 P8 同族） |

| 0010 | **已落地**：寻址四条 `focus / close / getBounds / setBounds` —— 只认自家那张 `xaihiDocumentWindows` 表（猜中产品主窗的 id 也报 `unknown window`），发起者闸与开窗共用；`setBounds` 回读**生效后**量出来的矩形，尺寸界复用 0009 那一处 | `ipc.ts` 四条通道 + `main.ts` 的 `xaihiWindowById` / `needXaihiWindow` / 四个 handler + `xaihi-window-policy.ts` 的 `normalizeXaihiWindowBounds` + preload | 基线 `WindowRuntime` 的 `focus / close / getFrame / setFrame`（`Xiranite/src/backend/runtime/runtime.ts:139-143`） |
| 0011 | **已落地**：`xaihiWindow.getCapabilities()` 逐字段回基线 `WindowCapabilities`；值由建窗那份 `titleBarStyle` 推（mac `hiddenInset`⇒system+位置、Windows `titleBarOverlay`⇒renderer、其余⇒system），红绿灯位置只有 `DARWIN_TRAFFIC_LIGHT_POSITION` 一份 | `xaihi-window-policy.ts` 的 `xaihiWindowCapabilities` + `main.ts` 的 `xaihiCaptionKinds`/handler + `ipc.ts` 通道与类型 + preload + **`tsconfig.client.json` 的 include 登记**（客户端面把 `apps/desktop/src` 逐个点名，`ipc.ts` 一 import 这份纯模块，没登记就 `TS6307`；冷重放实测第一遍就红在这儿）| 基线 `WindowRuntime.getCapabilities`（`runtime.ts:135`）与 `WindowCapabilities:86-99` |
| 0012 | **已落地**：自家文档窗被挪动/改尺寸时，把矩形**推给产品文档** —— 基线的 `subscribeFrameChanges`（`runtime.ts:150`）。没有它，界面既存不了"哪个节点窗在哪多大"，也无从知道窗被关掉；订阅返回退订函数 | `ipc.ts` 的 `xaihiWindowFrameChanged` 通道 + `main.ts` 的 `xaihiFrameSink` / `publishFrame`（挂在 `resize`+`move`）+ preload 的 `subscribeFrameChanges` | 基线 `WindowRuntime.subscribeFrameChanges` |
| 0013 | **已落地**：协商消息里**写明那四条寻址动词的名字**，不再从通道表数条数 —— 0012 加了推送通道之后，"数出来的条数"开始名不符实（把推送算成动词），这种耦合不如直接写清单 | `xaihi-window-policy.ts` 的 `xaihiWindowCapabilities` 消息 + `main.ts` 调用点 | 0011 的收尾 |
| 0014 | **已落地**：窗控四条 `controlMain / controlComponent / openDevTools / startDragging`；动作词与结果形状照基线，`state` 是做完之后量的，主窗 `close` 明说"隐藏不是销毁"，做不到的（拖拽）回 `supported:false` 不装成功 | `xaihi-window-policy.ts` 的 `normalizeXaihiWindowAction` / `xaihiWindowState` + `main.ts` 的 `applyXaihiWindowAction` / `waitFlag` / 四个 handler + `ipc.ts` 四条通道 + preload | 基线 `WindowRuntime:136-149` |
| 0015 | **已落地**：全屏前先解除最大化，等不到位就回 `success:false`（P 段第一天抓到的假成功） | `main.ts` 的 `toggle-fullscreen` 分支 | 0014 的修正 |
| 0016 | **已落地**：全屏的等待放宽到一次真正的 Space 切换（8 s），本机仍进不了 ⇒ 记为环境限制、判据只钉"要么生效要么如实报" | `main.ts` 的 `waitFlag` 超时 | 0015 的配套 |
| 0017 | **已落地**：桌面端进入工作区时，若宿主启用了 Xaihi 则优先将主窗口导航至 Xaihi 工作台文档（`dsh-app://app/xaihi/ui/...`），非 Xaihi 环境优雅降级退回官方主视图 | `main.ts` 的 `resolveTargetWorkspaceUrl` 与 `enterWorkspace` / `workspaceRecovery` | 桌面端工作台主视图 |
| 0018 | **已落地**：开发版 macOS .app 的 HarnessDev 启动器固化 primary-runtime 路径与 profile 环境变量，让 Finder / LaunchServices 冷启动不再因缺失 DSH_DESKTOP_PRIMARY_RUNTIME_DIR 崩溃 | `scripts/development-app.ts` 的 `developmentLauncher` + `scripts/dev.ts` | 桌面端开发 App 独立启动 |
| 0019 | **已落地**：启用 Xaihi 产品时，主壳优先进入 core 提供的本地 Xaihi 文档，跳过官方欢迎页、登录与 API key 首次启动流程；普通 DSH profile 仍保留原 onboarding | `apps/desktop/src/main.ts` 与 `src/xaihi-startup-policy.ts` | 桌面端产品入口 |
| 0020 | **已落地**：macOS 开发 `.app` 的 Finder / LaunchServices 冷启动继续携带产品原生 binding 的环境变量与路径，保证 Kisaki Rust Node-API 不因脱离 CLI 启动而丢失 | `scripts/development-app.ts` 的 `developmentLauncher` + `scripts/dev.ts` | Kisaki 独立桌面产品 |
| 0021 | **已落地**：受信任产品主帧可多选本地文件/目录，并调用系统打开或定位；窗口归属、绝对路径、取消与重复对话框均由桌面主进程处理。拖入路径继续使用既有 `webUtils.getPathForFile` preload 能力 | `ipc.ts`、`preload-app.ts`、`main.ts` | Kisaki 独立桌面文件能力 |
| 0022 | **已落地**：独立产品的应用名在主进程及 Finder 启动器中保留，应用菜单和关于面板使用节点产品名 | `main.ts`、`scripts/development-app.ts` | 独立产品命名 |
| 0023 | **已落地（单元判据：上游 24 条 spec 在重放后的树上 rc=0）**：`--unsigned` 从只收 `win-x64` 扩到 darwin。上游把 `forceCodeSigning/notarize` 写成常量、整条 darwin 包在签名钥匙串包装里，云上 runner 没有钥匙串也没有 Apple 凭证 ⇒ 未签名的 mac Nightly 产不出来。这一条让未签名腿跳过签名解析、钥匙串包装、公证两条泳道与签后校验，产物照 Windows 那条老路走 `-unsigned` 后缀 + `unsigned-artifacts/`，updater 元数据仍关（`publish: null`，不写 release record）。**Gatekeeper 会拦**：这份货的可见退化就是文件名里那个 `-unsigned` | `scripts/electron-builder-config.mjs`（unsigned 判定与 mac/dmg 两处常量）、`scripts/package-target.ts`（参数校验、钥匙串包装、产物分支）、`scripts/smoke-packaged-runtime.ts`（`unsigned artifacts require Windows` 那句抛错）、`tests/macos-signature.spec.ts` + `tests/package-target.spec.ts`（两条钉死旧行为的用例一起改） | 上游给不了"无凭证也能出 mac 包"，且这是 CI 唯一的出包方式 |
| 0024 | **已落地（单元判据：`apps/desktop/tests/package-target-stages.spec.ts` 22 条 rc=0，把这条改动撤掉后新增那条立刻红在 `expected node to be C:\tools\pnpm.exe`）**：`runPnpm` 过去不分平台地把 `npm_execpath` 交给 node 当脚本执行。pnpm 在 Windows 上发的是原生可执行文件（`pnpm.exe`），云上第一条真实打包腿就在 build 之前死掉：`ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".exe"`。仓库根早就有同一条规则的 `scripts/pnpm-invocation.ts:15-19`（只有 `.js` 入口由 node 承载），这条把那条规则搬到打包编排里；mac/linux 的 `.cjs` 入口走原来那条路，行为不变 | `scripts/package-target.ts`（runPnpm 三行）、`tests/package-target-stages.spec.ts`（两种入口形状各一条断言） | 上游自己在 Windows 上不出包，这个分支从没被执行过；同一条 bug 还留在 `scripts/flock-entry.ts:79`（win 上不可达，没顺手改）与 `scripts/dev.ts:56` |
| 0025 | **已落地（判据是上游自己的类型闸）**：0018/0020 给 `DevelopmentAppOptions` 加了五个可选字段，而 `dev.ts:80` 把 `process.env` 里读出来的值原样传进去——本仓开了 `exactOptionalPropertyTypes`，显式 `undefined` ≠ 缺席，于是 `tsc -b tsconfig.host.json` 在 `build:lib:host` 里打回 `TS2379`，`build:official` 第一步就死，win 腿跑满 7 分钟才红（`TypeError` 那条已经好了，红在这条）。改法是放宽我们自己的声明（下面每个读取处本来就同时接受 `undefined`），不去编一个默认值。**这条为什么现在才暴露**：`build:lib:host` 之前从没在 CI 或本机跑过——`check:package` 不跑 tsc，烟测跑的是产物。**以后写 patch 的循环里要带这一把尺**：`node ./node_modules/typescript/bin/tsc -p tsconfig.host.json --noEmit`（本机实测：撤改动 rc=2 命中那唯一一条，改后 host 与 client 各 rc=0；不写出到被跟踪的 `lib/`） | `scripts/development-app.ts`（五个可选字段加 `\| undefined` + 一行为什么） | 这两个可选字段是我们自己加的，红也是我们自己造成的，不是上游缺陷 |
| 0026 | **已落地**：打包身份改成 Xaihi（57 个文件、170 行）。这份壳一直自称 `DeepSeek Harness`：`productName`、产物文件名前缀 `deepseek-harness-`、URL 协议显示名、麦克风用途文案、NSIS 解压失败提示，以及**安装包内按名字找主程序的两个 CLI 垫片**（`cli/dsh` 走 `MacOS/<名字>`、`cli/dsh.cmd` 走 `..\DeepSeek Harness.exe`——只改 `productName` 而不改这两处，装出来的 `dsh` 命令就找不到可执行文件）。**故意不碰的三样**：npm scope `@deepseek-ai/*`、URL scheme `dsh`、注册表键 `Software\DeepSeekHarness\…`——那是安装身份与 OS 落点，改它们属数据迁移。**判据**：同一范围在 pin 的树上是 171 行命中（这把尺看得见违规），改完 `rg -l "DeepSeek Harness" apps/desktop` 除上游两份 README 与其 i18n 台账外为空；`tsc -p tsconfig.host.json --noEmit` rc=0；品牌被断言到的 6 个 spec（tray / quit-confirmation / package-macos / windows-sign / package-target-stages / macos-signature）73 条 rc=0 | `scripts/electron-builder-config.mjs`、`scripts/{package-target,package-macos,smoke-packaged-runtime,prepare-dsh,development-app}.ts`、`src/{locale,main,paths}.ts`、`installer/{strings.nsh,extract-report.h}`、`cli/dsh` + `cli/dsh.cmd`、`tests/**` 的 expected 夹具 | 使用者要求交付物自称本项目名（ADR-0010 的"会随代码活下去的称呼一律 Xaihi"） |
| 0027 | **已落地**：darwin 的未签名 Nightly 用 ad-hoc 签名，而不是把打包拒掉。0023 放开了产物那一侧，但 `prepare:dsh` 仍无条件按发布身份签运行期，云上 mac-arm64 就在建包之前死在 `DSH_DESKTOP_MACOS_SIGNING_IDENTITY must be set to a non-empty value`。**为什么不是干脆跳过签名**：Apple Silicon 拒绝执行无签名 Mach-O，运行期一跑烟测就会被 `Killed: 9`，所以身份换成 `-`（ad-hoc）并跳过发布 Authority/TeamIdentifier 断言与共享签名缓存（那条缓存路径的键里带着发布身份）。`package-target` 把 `--unsigned` 像已经传给 smoke 那样传给 `prepare:dsh`。**判据（本机实测，不是构造）**：拿真 `/bin/ls` 的副本、在 `CSC_KEYCHAIN` 未设的环境下调用改后的 `signMacOSRuntimeCode(…, {signingIdentity:'-'})` ⇒ rc=0 且 `codesign -dvv` 回读 `Signature=adhoc` / `Identifier=ai.xaihi.probe` / `valid on disk`；改动前同一条调用必然抛"run through the package command to prepare the signing keychain"（那行 `if (!keychain) throw` 就是它）。`tsc` rc=0，7 个 spec 82 条 rc=0 | `scripts/verify-macos-signature.mjs`（两处 ad-hoc 分支）、`scripts/prepare-dsh.ts`（unsigned 判定与 ad-hoc 身份）、`scripts/package-target.ts`（传 `--unsigned`） | 云端不带 Apple 凭证（ADR-0027 决定 1），但 mac 的货仍要在 runner 上跑得起来 |
| 0028 | **已落地**：未签名的 mac 夜包在 pack 阶段自己补上 bundle 封印。上游在 `mac.identity=null` 时**完全不签**外壳，而主程序仍带着链接器那份 ad-hoc 嵌入签名 ⇒ 装好后报 `code has no resources but signature indicates they must be present`，Finder/open 就是「已损坏」（0027 只覆盖运行期树里的原生件，管不到 `.app` 外壳与它的嵌套代码）。新增 `scripts/adhoc-seal-macos-app.mjs`：认出嵌套代码（`.node`/`.dylib`/`.framework`/helper `.app`/主程序）后**由内向外**逐个 `codesign --force --sign - --preserve-metadata=entitlements,requirements,flags,runtime`，最后封 bundle；`electron-builder-config.mjs` 的 `afterPack` 在 `packagesMacOS && unsigned` 时调用它（写 dmg/zip **之前**），identifier 从 `Info.plist` 继承成 `com.hibernalglow.xaihi`。**判据在云上那份货上跑**：解 release 的 `xaihi-0.2.0-rc.2-mac-arm64-unsigned.zip` ⇒ 原样 `--verify --deep --strict` rc=1 且无 `Contents/_CodeSignature`；跑脚本封 64 处后 rc=0、`CodeResources` 在场、`flags=0x2(adhoc)`；脚本自带的 `--self-check` 在那份 app 上认出 63 个目标。**这不是签名认证**：公证与 Developer ID 那份照旧要走有凭证的机器（ADR-0027 决定 4） | `scripts/adhoc-seal-macos-app.mjs`（新）、`scripts/electron-builder-config.mjs`（afterPack 一处） | 上游给不了「无凭证也能出可启动的 mac 包」，这条是那个决定的最后一块 |

0001–0028 已落地；活体判据在 `desktop/live-check.mjs`（**89 条全绿**：R 段复位、A 段产品文档面与拒绝分支、
B 段真 Xaihi 文档进第二窗、C 段按 node 去重与标题、D 段"主窗只是隐藏时节点窗仍能继续开"加守卫没跟着放宽、
E 段页面自己 `window.open` 走原生窗且弹出窗没长出来、F 段决定 4 的退化读回真上屏（含 iframe 反向对照）、
H 段产品文档转达开窗 + 三条边界对照、I 段"注入冒充不了官方形状"、J 段面板形态下那一下真能开窗 + 两条对照、K 段窗到窗（节点窗自己 window.open 另一个 node）、L 段尺寸只作用在新建那一次、M 段寻址四条 + 两条登记表边界对照、N 段能力协商键集与取值、O 段尺寸推送真到达且退订真断、P 段窗控四条含"假成功必须被抓住"的一致性判据）。判据都在 `node desktop/sync-dsh.mjs --verify`：
0001 查 IPC 通道 + 产物两份文件；0002 查 11 条用例（**拒绝分支才是重点**：路径穿越、跨 host、
非自家发起者、多带查询键、超长串）+ 0003 三条 profile 用例 + 0004 去重键用例；产物判据现在要
`lib/main.js` 里同时有 `resolveXaihiDocumentTarget` **和** `xaihiWindowKey`（少一个就是只跑了 tsc 没跑 bundle），
0005/0006 各查一处接线（`xaihiOwnedSender` / `openXaihiDocumentWindow` 函数体里的 `page-title-updated`）。
0006 那条还配减法对照：把那行从函数体切片里抹掉，判据必须变红。
摘掉 patch 跑 `--verify` ⇒ rc=1（不是空转）。Xaihi 侧的落地位置已经在 `/xaihi/ui` 路由 +
节点寻址参数上（Xaihi 提交 `0e4b61b`，`packages/core/src/routes.ts:101`）。
