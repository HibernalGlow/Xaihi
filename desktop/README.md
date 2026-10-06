# desktop/ —— Xaihi 自己的桌面壳（上游以 submodule 锁版本 + patch series）

这一层存在的理由：官方 DSH Desktop 拿不到原生多窗口，而使用者要"整个 Xaihi 一份自己的文档、
节点各自独立成窗"。决策与全部实测出处：`../docs/adr/0011-desktop-shell-is-a-sibling-vendor-repo.md`
（决定 2 与 2026-10-06 的改判记录）。

```text
desktop/
├── dsh/            ← git submodule：deepseek-ai/deepseek-harness，锁在 UPSTREAM_PIN 那一格
├── UPSTREAM_PIN    一行 "<tag> <40位sha>"
├── patches/dsh/    我们的 patch series（真源；vendor 树里的提交随时可重放出来）
└── sync-dsh.mjs    对齐 pin + 重放 patch（+ 可选按闭包裁检出）
```

## 职责边界（不许混）

submodule **只负责"拿源码 + 锁 upstream commit"**，不负责 Desktop 运行时的 package closure。
装机与打包仍然走上游自己的 `apps/desktop/src/core-package-set.ts` 与
`apps/desktop/scripts/prepare-dsh.ts`——那套机制算的是"带哪些 npm 包进最终 runtime"，
和"检出哪些目录"是两件事。谁把后者当前者用，就会得到一棵缺文件又装不上的树。

## 命令

```sh
node desktop/sync-dsh.mjs              # submodule 对齐 pin + 依次 git am 打全部 patch
node desktop/sync-dsh.mjs --check      # 报 want_pin / head / tree / patch 数 / 脏文件 + gitlink 是否等于 pin
node desktop/sync-dsh.mjs --verify     # 0001 是否真落进壳的 IPC 面（自带减法对照）
node desktop/live-check.mjs        # 对着跑着的壳验活体：13 条判据，含真 Xaihi 文档进第二窗
node desktop/sync-dsh.mjs --sparse     # 按 Desktop 的 workspace 闭包裁检出（默认不开）
node desktop/sync-dsh.mjs --sparse-off # 恢复整棵树（跑上游构建或 tsc 前必须开回来）
node desktop/sync-dsh.mjs --reset      # 回到 pin，丢弃 patch 提交（手工脏改动要 --force）
# 起壳（顺序是硬要求，见"启动配方"一节）：
#   cd desktop/dsh && pnpm install && pnpm run build      ← 少了 build，网关 lib/ 是空的
#   cd desktop/dsh/apps/desktop && DSH_HOME=<隔离 home> XAIHI_DESKTOP_PROFILE=<profile> \
#     pnpm exec tsx scripts/dev.ts --skip-build           ← 产物齐了才允许 --skip-build
node desktop/live-check.mjs            # 对着跑着的壳验活体（18 条：产品文档面 / 真文档进第二窗 / 按 node 去重）
node desktop/dev-shell.mjs profile     # 从零装配隔离 home 的 profile（含 allowBuilds/uiBundleDir/启用集）
node desktop/dev-shell.mjs check       # 只报就绪状态，并用宿主自己的 --dump-config 验配置
node desktop/dev-shell.mjs launch      # 起壳（端口被占会拒绝，防连到旧实例拿假结论）
node desktop/dev-shell.mjs stop        # 只杀我们自己那棵壳
node desktop/dev-shell.mjs verify      # sync-dsh --verify + live-check
node desktop/sync-dsh.mjs --proxy http://127.0.0.1:7890   # 上游在本机要过代理
```

## 实测（2026-10-06，pin = `dsh-v0.2.0-rc.2` = `639ed015…`，lightweight tag）

| 读数 | 数字 |
|---|---|
| 浅单 tag clone 落盘 | `.git` 38,490,804 B + 工作树 158,786,544 B ≈ **185 MiB**，49.2 s（当时 `load1m=42.22`/10 核） |
| 全量工作树（脚本口径，含 `.git`） | 151.6 MiB |
| Desktop 的 workspace 闭包 | **308/338** 个包 ⇒ 314 个检出目录 |
| `--sparse` 之后 | 101.0 MiB，**省 50.6 MiB（33%）**；裁掉的是 `docs` 21.7、`.agents` 17.7、`snapshots` 6.6、`scripts` 4.0（`scripts` 已改回必带） |
| vendor 装完（`pnpm install --ignore-scripts`，pnpm 自动切到上游的 11.7.0） | **42.8 s**；`node_modules` 用 `du` 量是 **1,931,100 KB ≈ 1.84 GiB**（`--size` 里那个 `node_modules_lower_bound` 会少报——pnpm 是 symlink 树，我的 `bytes()` 不解引用）；工作树从 151.6 MiB 涨到 159.8 MiB，多出来的是 `tsc -b` 吐在各包 `lib/` 里的产物（现读 43 个 `packages/*/*/lib`） |
| 0004 之后重放 | 4 个 patch 全部重放，`head=7c54436f tree=64075225d5fb`；`pnpm --filter @deepseek-ai/dsh-desktop run build` **rc=0（0 条 TS 错）**，`lib/main.js` 里 `xaihiWindowKey` 命中 2 次 |
| 重放幂等 | 连跑两次 `sync` ⇒ `head` 与 `tree` 哈希**逐字相同**（`0b04cd40` / `28898fc8c8d9`）；这条以前不成立，是提交时间没钉住导致的，现在 `git am` 的 `GIT_COMMITTER_DATE` 钉在 pin 上 |

四条阳性对照都跑过，全部按预期变红（`--verify` 的 rc 是不带管道单独测的：无 patch ⇒ rc=1，有 patch ⇒ rc=0）：丢掉 patch 后 `--check` 红（`patch 数不符：树上有 0 个，
patches/dsh 里有 1 个`）；`--pin` 给错 sha 时红且 **HEAD 未移动**（先验 tag 再 checkout）；
扰动 patch 的**上下文行**后 `sync` 红、`git am --abort`、树退回 pin 且脏文件 0。

## 启动配方与症状链（这条今天用一轮排查换来）

`--skip-build` 只有在**仓库产物齐**的时候能用。deinit 之后只跑 `build:lib:host` + desktop 的 bundle
不够：`packages/api/gateway/lib/` 里会**一个 JS 都没有**（只剩 `tsconfig.host.tsbuildinfo` 与 `types/`），
而 dev 启动器把 `.desktop-build/development/project/node_modules/@deepseek-ai/dsh-api-gateway`
**软链**到工作树那份 ⇒ 网关 `/api/<ns>/<method>` 直接 404 ⇒ 欢迎面
`POST /api/settings/describe` 拿到非 2xx ⇒ `src/welcome-backend.ts:63` 抛
`desktop welcome: Web request failed` ⇒ 上游把它送进**原生致命模态框**，主进程整条阻塞，
于是 `live-check` 的求值全部超时（30 秒超时机制在这里起了作用：报红，而不是永远挂着）。

正解一条命令：`pnpm run build`（上游 `scripts/build.ts`；实测 rc=0、约 80 s，
gateway 的 `lib/` 从 0 个 JS 变 2 个）。之后重启壳 ⇒ `node desktop/live-check.mjs` **13/13 全绿**
（`ui.rev=b6a8cb8bc96f`、正文回显 `node=xaihi-linedup`、`open` ⇒ 窗口数 2→3、新窗同一份 `./main.js`）。

判据顺序钉死在这里：**deinit / 全新 clone ⇒ sync ⇒ install ⇒ `pnpm run build` ⇒ 起壳 ⇒ live-check**。
少任何一步都先怀疑产物不齐，不要去怀疑 patch。

## `dev-shell`：把今天那串手敲顺序变成命令（并且把它自己踩的两次坑焊死）

`profile` 装配一个隔离 home 时，有两处是**今天真的栽过**的，现在写在代码里而不是 README 里：

1. 新 profile 的 `cordis.patch.yml` 内容是 `[]`，直接往后追加块序列会得到
   `YAMLException: end of the stream or a document separator` ⇒ 宿主 `DesktopHostFatalError`。
   `ensureProfilePatch()` 因此是"替换空序列"，并且写完用 `dsh --profile X --dump-config`
   让**宿主自己**判一次（不是我自己看着像 YAML）。
2. 上一个壳没死干净时，`live-check` 会连到**旧实例**并给出假结论（今天真发生过：9229 被占，
   我连到的是配置坏掉那一个）。`launch` 现在先查 9229/9222，被占就拒绝并让你 `stop`；
   `stop` 只匹配 `desktop/dsh/apps/desktop/.desktop-build` 这条路径，不碰机器上其他 Electron 应用。

实测（全新 home `.scratch/dsh-xaihi-desktop-home3`，一次跑通）：`profile` rc=0、
`check` rc=0（bundles=6、宿主解析通过）、`launch` 起壳、`verify` **rc=0 ⇒ 18/18 全绿**。

## 官方壳的对照读数（决定 4 的前提不是我说出来的）

把 series 摘干净（`node desktop/sync-dsh.mjs --reset --force` ⇒ `HEAD=639ed015`）、重跑
`pnpm --filter @deepseek-ai/dsh-desktop run build`（rc=0，产物里 `XAIHI` 命中 **0 次**），
用同一个 home、不带 `XAIHI_DESKTOP_PROFILE` 起壳，在产品文档里现读：

- `typeof globalThis.dshDesktop = 'object'`、`protocolVersion = 1`，成员恰好 **6 个**：
  `protocolVersion, browser, deviceInfo, keyboard, shortcuts, updates`；
- `typeof globalThis.dshDesktop.xaihiWindow = 'undefined'` ⇒ 官方壳确实没有开窗动词
  （与 `ipc.ts` 那张通道表读出来的结论一致，但这一条是活体）；
- 把这个真形状喂给 SDK 的 `readXaihiWindowCapability` ⇒ `{supported:false, reason:'stock-shell'}`
  —— 判的是真实形状而不是 fixture，所以「退化要可读」的前提被量到了，不是被断言出来的。

复现顺序：`--reset` ⇒ 重建 ⇒ 起壳 ⇒ 在产品文档里读上面三行 ⇒ `sync` + 重建恢复
（实测恢复后 `XAIHI` 命中回到 7 次、`--verify` rc=0）。这条只覆盖"窗能力"那一格，
**不**等于官方桌面端上 Xaihi 整体可用——R8(a) 的其余读数仍要另外跑。

## gitlink 规则（这一条今天踩过）

`desktop/dsh` 记在仓库里的指针**必须等于 `UPSTREAM_PIN`**：patch 只活在工作树里，由 `sync-dsh` 重放。
判据是 `node desktop/sync-dsh.mjs --check`（它读 `git ls-tree HEAD desktop/dsh` 与 pin 比对，不等就红）。

为什么钉这条：第一次提交时 gitlink 落成了 `0b04cd40` —— 那是 `git am` 在本机造出来的"patch 后提交"，
上游仓库里没有它、我们也无权往上游推，别人 clone 出来就是一个取不到的对象。
当时 `.gitmodules` 里还写着 `ignore = all`，正好把这种漂移从 `git status` 里藏掉；所以那行被撤了
——**宁可让指针漂移一直可见**（sync 之后 `desktop/dsh` 会显示 modified，那是真话），
也不要"干净但取不到"。判据的阳性对照就是那个坏状态本身：加完判据当场跑红
（`gitlink_committed=0b04cd40 want=639ed015`）。


### 实机结果（同日 03:3x）：上一条那三格全绿

根因确认得很干脆：**`apps/web/dist` 当时是 0 个文件**。壳的产品文档是从
`@deepseek-ai/dsh-web-frontend`（就是 `apps/web`，build 脚本是 `vite build`）的 `dist` 出的，
dist 空 ⇒ `/` 拿不到 2xx ⇒ `connectDesktopWelcome`（`src/welcome-backend.ts:49-51`）抛
`desktop welcome: Web authentication failed`。**不是缺凭据，也不是 patch**。补跑
`pnpm run build:web` ⇒ rc=0、`apps/web/dist` 变 196 个文件，重启后这条错消失（日志里
`Web authentication failed` 计数 0）。

判据收进了仓：**`node desktop/live-check.mjs`**，九条全绿（rc=0）：

| 段 | 读数 |
|---|---|
| A（真产品文档 `dsh-app://app/`） | `protocolVersion=1`；对照 `typeof browser='object'`（既有面没被改坏）；`typeof xaihiWindow='object'`、`open` 是函数；调 `open('findz')` ⇒ `REJECTED: Error invoking remote method 'dsh-desktop:xaihi-window-open': Error: xaihi desktop: only the Xaihi UI document may open a window` |
| B（放行分支） | 把主窗导到 URL 形状合法的自家文档地址后调 `open('findz')` ⇒ `RESOLVED windowId=3`，窗口数 **2 → 3**，新窗 URL 是 `dsh-app://app/xaihi/ui/0123456789ab/index.html?node=findz`（node 参数由壳改写）；测完自动关掉多出来的窗并导回产品文档 |

两条工程笔记（都是这轮踩出来的，写在脚本头注释里）：renderer 的 CDP（9222）要
`--remote-allow-origins`，上游启动器不给这个参数 ⇒ Node 侧 WS 会挂住；主进程是 ESM 入口，
inspector 求值域里没有 `require`/`module`，`import()` 报 `A dynamic import callback was not
specified` ⇒ 只有 `process.getBuiltinModule('module').createRequire(…)` 能拿到 electron API，
而它能直接数窗口，判据反而比数 target 硬。

**这一格仍未验**：B 段用的是合成文档（Host 那边没装 Xaihi 时会回 404），证的是**壳侧代码路径与
原生窗创建**，不证 Xaihi 真内容渲染在第二窗里——那一格仍挂在 R9（发布）或应用内插件管理器上。

### 0003 与"真内容进第二窗"（同日 04:0x，全绿）

patch 0003 = `XAIHI_DESKTOP_PROFILE`：给了就按 `profiles/<name>` 解析，缺省仍是上游的 `desktop`，
形状不合 `[a-z0-9][a-z0-9_-]{0,63}` **直接抛**（不静默退回默认）。三条都在 `paths.ts` 里，
纯函数可脱离 Electron 执行。为什么要它：`args.ts:84-85` 把 `desktop` 判给 Electron 独占，
实测 `plugin --profile desktop add` ⇒ `managed exclusively by the Electron application`，
同一条命令换自定义名字 ⇒ **rc=0 并把 `@hibernalglow/xaihi-core` 落进 profile**。

`node desktop/live-check.mjs` 十三条全绿（rc=0），B 段不再是合成 URL：

- profile 选中的是 `xaihi`（`.scratch/dsh-xaihi-desktop-home`），manifest 200、
  `ui.rev = b6a8cb8bc96f`、`ui.documentUrl = /xaihi/ui/b6a8cb8bc96f/index.html`。
- 主窗导过去之后正文是 **`Xaihi 文档 realm 探针（不是工作台） rev=b6a8cb8bc96f · node=xaihi-linedup …`**，
  引用的入口是 `./main.js` ⇒ 这是我们自己的文档在渲染，不是错误页。
- 从这份文档调 `open('xaihi-linedup')` ⇒ `RESOLVED windowId=4`，窗口数 **2 → 3**，
  新窗 URL 与正文和主窗那份一致（同 `main.js`）⇒ **原生第二窗里跑的是真 Xaihi 文档**。
- 观察记录：`globalThis.__XAIHI__` 在这份文档里是 `undefined`（observatory 在 ui-host 装载器那一侧，
  不在这个 realm 探针页里），所以判据用的是"服务端给的规范 URL + 入口产物被引用 + 正文非空"，
  不是猜某个全局变量。

### 攒下来的 profile 装配笔记（这轮一条条撞出来的）

1. **拷 profile 是坏的**：直接 `cp -R` 一份 profile 到新 home，再 `plugin add` 就
   `Failed to resolve dependency tree`（锁文件绑着原安装上下文）。要么从零装，要么连锁一起重来。
2. **`allowBuilds` 是每 profile 自己的状态**：新 profile 的 `pnpm-workspace.yaml` 里
   `koffi: set this to true or false` 是占位串，不填就 `ERR_PNPM_IGNORED_BUILDS`、整次安装判失败。
3. **`dsh plugin` 只把参数转发给 pnpm**（`error: plugin needs pnpm arguments to forward`），
   所以**没有 `enable` 这个动词**；启用集是 profile `package.json` 的 `dsh.profile.bundles`。
   add 完不进 bundles 就等于没装：Host 会报 `xaihi-core: pending (waiting for service: webServer)`。
4. **`@deepseek-ai/dsh-web-app` 的 `latest` 标签停在 0.0.1-rc.1**，按名字加会失败；
   点名 `@0.2.0-rc.2` 才有（与 `check:pins` 那条同一个病的又一处现场）。
5. **manifest 顶层 `rev` 不是 UI 的 rev**：UI 用 `ui.rev` / `ui.documentUrl`
   （`computeRev(uiBundleDir)`）。拿错就会得到 `rev mismatch (current …)` 这种诚实但绕人的 404。
6. **产物判据要按整个 lib 目录看**：`xaihi/ui` 在 `routes.js` 与共享 chunk 里，只 grep `index.js` 会误判。

## 全新 clone 的可复现性（这条是 deinit 实测出来的）

`git submodule deinit -f desktop/dsh` 把工作树清空（现读 0 个条目）之后，
`node desktop/sync-dsh.mjs` 一条命令把 3 个 patch 重放回来，**tree 哈希与之前逐字相同**
（`41ef226b8b0c`，`head=ca7ce839`，`dirty=0`，`gitlink=pin`），耗时 4.0 s（`load1m=14.67`），
未装依赖的干净树是 114.7 MiB。⇒ pin + patch 确实是真源，工作树可丢弃重建。

`--verify` 在这种状态下**分档报**而不是崩：0001（通道）与 0002（11 条判策用例）是纯模块，照样跑；
0003 与产物判据报成「未跑」并给准确前置——workspace 包的 `lib/` 是构建产物，
deinit 会连它一起清掉，所以要 `pnpm install` **并且** `pnpm run build:lib:host`。
（这条一开始写成"先 pnpm install"就够了，实测装回依赖后 0003 仍取不到模块，才把说明改准。）

**重放之后先红了一次，查清根因才拿回绿**：deinit → sync → install → `build:lib:host` + bundle 之后
重启壳，`live-check` 十三条全报红（欢迎面 `desktop welcome: Web request failed`）。根因与修法见上面
"启动配方与症状链"：缺的是 `pnpm run build`（网关 `lib/` 没有 JS）。补跑后重启 ⇒ **13/13 全绿**，
而且这一次是在"deinit 重放 + 重装 + 完整构建"整条链之后拿到的，比第一次更接近别人重跑的结果。
`--skip-build` 这条路里 `.desktop-build/targets/**/primary-runtime` 被 deinit 弄成半截目录会
`ENOTEMPTY`，删掉 `targets/` 就能过；这条也记在这儿，免得下次又当神秘故障查半天。

## 与门禁的关系（别把 vendor 扫进去）

`check:pins` 与 `check:installable` 只走 `packages`/`plugins` 的**一层**目录（`GROUPS = ['packages','plugins']`、
`roots = ['packages','plugins']`），`check:brand` 递归但根也只有 `packages`/`plugins`/`scripts`
（`check-brand.mjs:89`）。**实测**：在 `desktop/` 下塞一份带错版本号的诱饵 manifest 加一份带旧品牌的 `.ts`，
三把尺全部无感（`check:pins` rc=0、brand 命中数 0）；把同一份诱饵挪到 `packages/zzprobe` 立刻 rc=1
并被点名 `probe-b @deepseek-ai/dsh@0.0.1-rc.1`。⇒ `desktop/dsh` 不参与 Xaihi 的门禁，
但**任何把 `desktop` 加进扫描根的改动都要连同这一节一起复核**。

pnpm 侧同理：`pnpm-workspace.yaml` 只按 `packages: [packages/*, plugins/*]` 认成员，
vendor 里那份上游 workspace 定义不会自动并进来。

## 已知边界

- 0001 只给了"主文档发起、按 `node` 开窗"这一格：二级窗不接 `shortcuts.attach` / `browserGuests.bind`，
  也不能再开第三级窗（守卫是 `assertProductSender`，主语是主窗）。
- **类型层的归因（今天跑过一轮，结论是"还不能下判断"）**：`pnpm exec tsc -b apps/desktop` 在
  打过 patch 的树上报 2 条错，都在 `packages/client/product-analytics/src/client/index.ts`
  （`Property 'productAnalytics' does not exist on type 'ClientRemote'`）。把 patch 摘掉重跑同一份命令，
  **错误集逐字相同**（`diff` 排序后的 `error TS…` 两份 ⇒ 空）⇒ 这两条与我的 patch 无关，
  成因是我 `--ignore-scripts` 装的树里缺 `lib/typert.host.d.ts` 那批产物。
  **但这不等于 patch 被类型检查过了**：`tsc -b` 停在那个包上就再没往下走，`apps/desktop/lib` 根本不存在
  ⇒ desktop 项目自身（也就是我改的三个文件）**一行都没被编到**。后续把上游
  `pnpm run build:lib:host` 跑完（**rc=0、0 条 TS 错**），再跑 `pnpm exec tsc -b apps/desktop`
  ⇒ **rc=0**，且 `apps/desktop/lib/types/xaihi-window-policy.js` 在场 —— 新文件真进了 program，
  不是被显式清单静默跳过。类型这一档到这里才有结论。
- **0002 的实测**：`apps/desktop/src/xaihi-window-policy.ts` 是纯模块（不 import electron），
  11 条用例直接执行 ⇒ rc=0（**拒绝分支才是重点**：路径穿越、跨 host、非自家发起者、
  多带一个查询键、超长串）；`pnpm --filter @deepseek-ai/dsh-desktop run bundle` **rc=0**（306 ms），
  产物 `lib/main.js`（493,562 B）里搜得到 `resolveXaihiDocumentTarget` 与 `/xaihi/ui`。
  **只跑 tsc 不跑 bundle 的话 `lib/main.js` 是旧的** —— 这条今天踩过，`--verify` 现在两个都查。
- **仍未验**：Electron 实机一次都没起过（`--ignore-scripts` 装的话连 Electron 二进制都没下，
  约 120 MB），所以"点一下真开出一个原生窗"这一格是空的，别当已交付。
- **验证强度**：三处改动 `node --check` rc=0，且扰动对照能抓（rc=1）⇒ 语法是真的；
  `ipc.ts` 的三条 import 全是 `import type`（会被剥掉），所以它能直接跑：
  `node --experimental-strip-types` 加载后断言 `DESKTOP_IPC` **26 条通道**、
  `xaihiWindowOpen === 'dsh-desktop:xaihi-window-open'`、`browserAcquire` 仍在 ⇒ **rc=0**，
  把期望值换成错值 ⇒ **rc=1**（对照）。类型层已随 `tsc -b apps/desktop` rc=0 结掉；
  `main.ts` 里那两个分支（开窗与 deny）只到**编译进产物**，运行时行为要等 Electron 实机才算数。
## 首次实机（2026-10-07 01:2x，隔离 `DSH_HOME=../.scratch/dsh-desktop-home`）

走通了 `start:desktop` 的准备链：**Electron 真的起来了** —— 进程
`.desktop-build/development/Harness Dev.app/Contents/MacOS/Electron --inspect=127.0.0.1:9229
--remote-debugging-port=9222 --user-data-dir=…`，`lsof` 看到 9222 LISTEN。
一次 disposable 项目安装的代价实测：`.desktop-build` 长到 **786 MB**（`--ignore-scripts` 那份
`node_modules` 是 1.84 GiB，两者叠一起就是这层的真实磁盘账单）。

**但这次没验到 patch**：Host 报一整组 `@deepseek-ai/dsh-client-ui-* failed to import`
加 `Plugins waiting for services (9)`，CDP `/json/version` 6 s 无响应 ⇒ 窗口没到 ready。
红因是我只建了 host face（`build:lib:host` rc=0），**没建 client face** —— 与 0001/0002 无关，
是这条启动链自己的前置。已在补 `pnpm run build:lib:client`（日志 `/tmp/vendor-build-client.log`）。

client face 建完之后，这一档的判据已经写好，跑的是活体而不是编译产物：
（下面三条已实现并跑绿，见下一节）

1. CDP 枚举 target，主文档上 `window.dshDesktop.xaihiWindow` 必须存在（0001 的运行时面）。
2. 在 `dsh-app://app/index.html` 上调 `open('findz')` 必须以
   `xaihi desktop: only the Xaihi UI document may open a window` 被拒（0002 的 deny 分支）。
3. allow 分支（真开出一个原生窗）需要 Xaihi 文档真的挂在 Host 上 ⇒ 还是 R9 那条发布前置，
   或者 dev profile 的合法挂载路径；**不许**为了这一格手写 `profiles/desktop` 里的文件。

- 上游 bump ⇒ patch series 重放；重放红就是红，不许 `--3way` 蒙。

## 0007：面板那一格的"开独立窗"——由产品文档替被嵌的 Xaihi 帧转达（2026-10-07 06:0x）

**先量到的是两条死路**（探针在跑着的壳上实测，读数 `F`/`H` 段的 `frameProbe` 复核）：Xaihi 文档按
ADR-0009/0014 的形态是嵌在产品文档的 `<iframe>` 里的，那时——

1. `typeof frame.contentWindow.dshDesktop === 'undefined'` ⇒ 壳的动词**进不了子帧**
   （Electron 44 的 preload 不暴露给 sub-frame），面板里的代码没有 IPC 这条路。
2. 子帧自己 `window.open(自家文档)` ⇒ `popup="null"` 且**一个新窗都没有**（`createdCount: 0`）。
   机制在源码里：0002 的 `setWindowOpenHandler` 拿到的 `openerUrl` 是
   `window.webContents.getURL()`，也就是**那个窗的主帧 URL**（`dsh-app://app/`），不是发起那一帧的；
   而 Electron 的 `HandlerDetails`（`electron.d.ts:21990`）只有 `url / frameName / features /
   disposition / referrer / postBody` —— **没有"哪一帧发起的"这个字段**，`referrer` 不能当安全主语用。

⇒ 唯一不动桥协议、也不伪造发起者的通路是：**由产品文档那一层（我们自己的 client 包装代码住在里面）
替帧转达**，并显式带上文档路径。0007 就是这一条：`open(node, documentPath?)`；带路径时
只有主窗（产品文档）这一支被接受，路径必须通过壳自己的路由形状
`/^\/xaihi\/ui\/[0-9a-f]{12}\/index\.html$/u` 校验，scheme 与 host 仍只有壳那一份；
不带路径时行为与 0005 逐字相同（发起者自己必须是 Xaihi 文档），所以 A 段那条拒绝原样还在。

实机（`node desktop/live-check.mjs` ⇒ **42 条 OK、rc=0**，H 段七条）：

- `open(nodes[1], docPath)` ⇒ `{kind:opened, windowId:9, alreadyOpen:false}`，新窗 URL 逐字
  `dsh-app://app/xaihi/ui/1b925377dccd/index.html?node=xaihi-sleept`、标题 `Xaihi · xaihi-sleept`。
- 同一个 node 再问 ⇒ `alreadyOpen=true`（0004 的去重在这条新分支上照旧）。
- `/xaihi/ui/../index.html` 与 `https://example.com/xaihi/ui/0123456789ab/index.html` ⇒ 都按
  `document path must match /xaihi/ui/<rev>/index.html` 拒掉。
- 不带路径 ⇒ `only the Xaihi UI document may open a window`（转达分支没把动词整体放开）。

SDK 那侧（`packages/node-sdk/src/desktop-windows.ts`）同步收第二条参数：坏路径**本地就拒**
（`invalid-document-path`，不喂 IPC），好路径**逐字透传**。这里被自家测试抓出一处"半接"——
包装层 `opener: (node) => open(node)` 只转发第一个参数，测 `documentPath` 时收到 `undefined`
⇒ **rc=1 点名那条用例**；补成 `(node, documentPath) => open(node, documentPath)` 后
`desktop-windows.spec.ts` **10 条全绿**。判据是"参数到底走到哪一层"，不是"类型上写没写"。

**没做完的那半格**：转达方（产品文档里的 Xaihi 包装层）现在只有动词可用，还没有**从被嵌帧收到请求**的那条桥
——桥的动词表（`SHELL_SERVED_METHODS`，按 `groupOf` 归到 `NODE_CAPABILITY_IDS` 那几组，
`packages/node-sdk/src/host-bridge.ts:45/130/163`）里没有 `openNodeWindow` 这一项。补它要动我们自己的桥契约，
下一刀做；做完之前"面板里点一下开独立窗"仍然只有壳侧的路与单测。

## 冷重放：把上面那些读数在"退回 pin 重新开始"的链上再取一遍（2026-10-07 06:2x）

判据顺序仍按本文钉死的那条走：**reset ⇒ sync ⇒ install-free 的 `pnpm run build` ⇒ 起壳 ⇒ 判据**。
这次是 7 条 patch 的第一次全链复现（上一轮"从零重放后重拿绿"是 4 条 patch、13 条判据的时候）：

| 步 | 命令 | 读数 |
|---|---|---|
| 退回 pin | `node desktop/sync-dsh.mjs --reset --force` | `reset 到 639ed015（sparse 已关）`，rc=0 |
| 重放系列 | `node desktop/sync-dsh.mjs` | `head=8d8405de tree=9eb91c1de6a5 patches=7/7 dirty=0`，rc=0 —— **tree 与冷 reset 之前逐字相同**（这条就是幂等判据本身） |
| 全量构建 | `pnpm run build`（在 `desktop/dsh`） | rc=0；`packages/api/gateway/lib/` 里 **2 个 JS**（症状链那一格的 0 → 2 复现） |
| 产物尺 | `node desktop/sync-dsh.mjs --verify` | rc=0；`0002/0003/0005/0006/0007 已接进 bundle` 全 true，减法对照在跑 |
| 装配 | `node desktop/dev-shell.mjs check` | rc=0；`bundles=6`、UI 产物在场、宿主 `--dump-config` 解析通过 |
| 活体 | `node desktop/dev-shell.mjs verify`（内含 `live-check`） | rc=0；**42 条 OK、0 条 FAIL**，含 H 段七条与 F 段的 iframe 反向对照 |

这条的意义不在"又绿了一次"，而是**别人照 README 跑会得到同样的树哈希**：`git am` 系列的 sha 稳定
（`GIT_COMMITTER_DATE` 钉在 pin 的 committer date 上）与"少跑一步就得到空网关产物"这两件事，
现在都各自有读数与判据盯着。

## 官方形状的真构建：stock-shell 那一档在屏幕上读得回来（2026-10-07 06:3x）

决定 4 要的是"退化状态在界面上读得回来"。`no-shell-surface`（浏览器／`dsh web`）那一档 F 段的
iframe 反向对照已经量到；**`stock-shell` 那一档此前只有单测**。这里补上屏上证据，并且先记下为什么
不能用注入糊：

- **注入冒充不了**（`live-check` 的 I 段现在就是钉这件事的判据）：CDP
  `Page.addScriptToEvaluateOnNewDocument` 把 `window.dshDesktop` 重定义成官方那 6 个成员之后，
  同一个窗重新加载读回来仍是 `attr=supported`、`verb=object` —— preload 的 contextBridge 在注入之后
  才暴露那份面，页面上的东西改不动。⇒ 想报"官方档已验"只能拿**真没有那个动词的构建**来。
- **真构建怎么做的**：只改构建产物 `desktop/dsh/apps/desktop/lib/preload-app.cjs`（删掉
  `xaihiWindow: { open: … }` 那一条，126 B），**被跟踪的源码一个字没动**（`dirty=0` 未受影响）；
  起壳读一次，再用 `pnpm --filter @deepseek-ai/dsh-desktop run bundle`（rc=0）重建 ——
  重建后的文件与实验前留的副本 `diff -q` **逐字相同**，所以这条实验是可撤销的。
- 读回来的现场（一次性探针，跑在真官方形状的壳上）：
  `Object.keys(window.dshDesktop)` = `browser,deviceInfo,keyboard,protocolVersion,shortcuts,updates`
  （正好是上游那 6 个成员，没有 `xaihiWindow`），而 Xaihi 文档窗里：
  - `attr="stock-shell"`
  - 正文 `这是桌面壳直接开出来的顶层窗，装的是节点 xaihi-linedup 的文档。 独立窗：不可用 —— 官方桌面端没有这个动词，独立窗在这个宿主里不可用`
  - 探针板在场、`body.innerText` 300 字 ⇒ **不崩、不空白、不伪造**（决定 4 的三件事各自有读数）
- 恢复之后再跑 `node desktop/live-check.mjs` ⇒ **45 条 OK、rc=0**（42 条既有 + I 段三条）。

**这条还不等于 R8(a)**：那是"真装官方 DMG、真用应用内插件管理器装 Xaihi"那条腿，前置仍是 R9 的发布包。
本节证的是**界面在官方形状下说得出那句退化**，形状由产物级实验给出，不是由我读代码推的。

## 0008：面板形态下"那一下"其实不用等桥（2026-10-07 06:4x）

0007 之后还剩一格：被嵌在产品文档里的 Xaihi 帧要开节点窗，得由外层转达，而外层要转达就得先收到请求 ——
那一步我以为只能加桥动词。**这条前提错了**，而且代价是要在搬来的 `NodeHostCapabilities` 九组之外立第十组。

真实的堵点更窄：帧里调 `window.open(/xaihi/ui/<rev>/index.html?node=X)` 时，`HandlerDetails`
只给得到**所在窗的主帧 URL**（= 产品文档），0002 的 opener 判据因此判 deny ——
E/F 段量到的 `createdCount: 0` 就是这么来的。0008 于是只放宽 opener 一格：
"自家文档 **或** 产品文档根 / `index.html`"。目标路由形状、`node` 单键、超长与解析失败四条守卫照旧，
而 0004 的去重已经把"反复弹窗"的上限收成节点数本身。

判策是纯模块，所以这一条的尺也在 `--verify` 里：用例 **11 → 15 条** ——
新增"产品文档 opener ⇒ 放行"两条，以及三条反向（`dsh-app://shell/index.html` 冒充、
`dsh-app://app/assets/x.js` 自家资源路径、`https://app/index.html` 冒充）；
另加一条独立减法对照"产品文档 opener 也开不出自家非文档目标"。摘掉 0008 重放 ⇒ 用例表必须判错，
这条尺的敏感性由 `--check/--verify` 一起管。

活体（J 段六条，`node desktop/live-check.mjs` ⇒ **51 条 OK、rc=0**（补上 K 段之后是 54 条，见下一节））：

- 现场复核前提：`frame.dshDesktop === 'undefined'`（0008 要绕的就是这一格）。
- 帧里 `window.open(自家文档?node=sleept)` ⇒ `popup="null"` 且原生窗**恰好一个**，
  `url` 逐字等于目标、`title="Xaihi · xaihi-sleept"`。
- 对照：同一目标再问一次 ⇒ 不叠第二个窗（去重覆盖这条新路）；同一帧开 `dsh-app://app/index.html`
  ⇒ `null` 且不长窗。

**结论落在契约上**：`SHELL_SERVED_METHODS` 里没有 `openNodeWindow` 不再是开窗这一格的阻塞项 ——
节点界面在自己的文档里直接 `window.open` 就够了，不需要新增能力组。0007 那条"产品文档转达"仍有用途
（产品文档自己发起的面板/工具窗），但**开窗主路径已经不依赖它**。P8 那条上游缺口（发起帧身份）照旧提着，
只是我们的暴露面比先前记的小了一号。

## K 段：窗到窗那一格补齐（2026-10-07 06:5x）

D 段量的是"节点窗调 IPC 动词开另一个窗"，E 段量的是"主窗停在文档上时 `window.open`"，
J 段量的是"被嵌帧 `window.open`"——**还差一格是实际最容易走的那条**：
已经在前台的那个节点窗自己 `window.open` 另一个 node。补上之后 `node desktop/live-check.mjs` ⇒ **54 条 OK、rc=0**：

- 由产品文档转达开第一个窗（`windowId=30`），在那个窗里 `window.open(...?node=xaihi-dissolvef)` ⇒
  `popup="null"` 且原生窗恰好一个（`windowId=31`），URL 与标题都跟着**新的** node（不是第一个窗的）。
- 收尾 `ownedLeft=0`。

写这条的时候我又把判据自己写错了一次：起第一个窗的那句按 0005 的形状漏掉了 `documentPath`，
于是 K 段一开始报的是 0007 故意保留的那条拒绝（`only the Xaihi UI document`）——
**同一个坑在两条不同的判据上重演**，说明"从产品文档起窗必须带路径"这件事在尺里出现过三次
（I 段第一次也是它）。它现在已经写在两处判据的注释上，别再靠记忆。

## 0005 与 0006：主窗只是隐藏时节点窗还能继续开，标题也真带得出 node（2026-10-07 05:3x，home `.scratch/dsh-xaihi-desktop-home3`）

**前提（上游现读，不是我推的）**：主窗的 `close` 被 `preventDefault` 换成隐藏
（`apps/desktop/src/main.ts:1145-1153`），而 0001/0002 那条 `xaihiWindowOpen` 的守卫主语是主窗 ⇒
主窗一隐藏（点关闭就是这个），已经开出去的节点窗再也开不出新窗。0005 把发起者改成
"任一活着的自家文档窗"（`xaihiOwnedSender`），目标 URL 改从**发起者自己的文档**取，
四条形状守卫一条不松。

实机读数（`node desktop/live-check.mjs` ⇒ **32 条 OK、0 条 FAIL、rc=0**；D 段是 0005 的证据，E 段是 0002 的真路）：

- 问的那一刻 `mainHiddenWhileAsking=true`；从节点窗 `open(nodes[1])` ⇒
  `{kind:opened, windowId:18, alreadyOpen:false}`，`countBefore=3→countAfter=4`（按 id 差量量，不按总数），
  新开那窗 `title="Xaihi · xaihi-sleept"`、URL 带 `node=xaihi-sleept`。
- 把那个窗导到 `dsh-app://app/index.html` 后再问 ⇒ `rejected window request from an unowned renderer`
  ⇒ 放宽的只有"谁可以问"，不是"问什么都行"。
- **E 段补上的是 0002 一直缺的那格活体证据**（此前只有 11 条单元用例 + 编译）：在真文档页里
  `window.open(自家文档 URL)` ⇒ `popup` 读回 `"null"`（弹出窗没长出来），同时窗口 id 差量恰好 1，
  那窗 `url` 逐字等于目标、`title="Xaihi · xaihi-sleept"`；对照是 `window.open('dsh-app://app/index.html')`
  ⇒ 也是 `"null"` 且**不长窗**。外链那条对照故意不在活体上跑：判策命中后走 `shell.openExternal`，
  真跑会打开使用者的浏览器——它已由 `--verify` 的单元用例覆盖。
- **0006 是 D 段读回来的缺陷**：0004 的 `setTitle` 会被文档自己的 `<title>` 覆盖，
  第一次实测 `getTitle()` 只剩 `"Xaihi"`（node 名在窗标题上丢了）。修法是自家窗里拦住
  `page-title-updated`。这不是装饰：使用者辨认"这个窗是哪个 node"只有标题这一个读回面。

这一轮同时抓出三条**尺自己**的假绿，不写下来下次还会再信一次：

1. **只跑 `bundle` 会把上一次的 tsc 产物再打包一遍**。减法对照实测：摘掉 0005/0006 → 重放 4/4 →
   只 `bundle`（rc=0）⇒ `--verify` 仍报 `0005=true 0006=true`（假绿）；补 `tsc -b .`（rc=0）再 bundle ⇒
   产物里 `xaihiOwnedSender` 命中数 0、`--verify` **rc=1 并点名 0005**。
   ⇒ 改完 series 的顺序是 **tsc 然后 bundle**；`--verify` 只保证读的是盘上那份，不保证那份是新的。
2. **`page-title-updated` 不能在整个 `lib/main.js` 里搜**：上游别的模块也被打进同一个 bundle
   （摘掉 0006 之后产物里仍有 1 处命中）。尺改成只看 `openXaihiDocumentWindow` 的函数体切片
   （顶层函数在列 0 收尾），并自带减法对照：把那一行从切片里抹掉 ⇒ 必须读不到。
3. **主框导航失败会替我按下上游的恢复态**：`did-fail-load` 除 `-3` 一律 `reportFatal → recovery`
   （`main.ts:1170-1174`）。上一轮 D 段收尾那句 `ERR_FAILED (-2) loading 'dsh-app://app/'`（紧跟一串
   `close()`）之后，`BrowserWindow.getAllWindows()` 读回**空数组**——那不是"壳神秘坏了"，
   是判据自己在恢复态上按了一下。⇒ live-check 把主窗导航挪到开头复位段（R），收尾只 `show`/`close`
   自己开的窗；这一轮 R 段读到 `navigated="loaded"`，窗口消失没再出现。

## 那条"第一次 30 s 不落地"已经收口：是判据自己选错了窗（2026-10-07 06:4x）

上面那一节把它留成"未解观察"，还写了一句**错的**猜测（"上一个窗刚 close 完，主窗文档的执行上下文还没稳"）。
把它做成一次只动一个变量的实验之后，根因在尺自己身上：

- 现场：开一个文档窗 → `win.close()` **不等 `closed`** → 立刻对"主窗"发 `executeJavaScript(fetch …)`。
  4 轮读数：`{15002ms/TIMEOUT, 15003ms/TIMEOUT, 15003ms/TIMEOUT, 1ms/TypeError: Object has been destroyed}`，
  而每轮的**第二次**尝试都是 10–21 ms —— 与"第一次挂、第二次好"完全同一形状。
- 根因：`SCAN` 里 `main()` 取的是 `BrowserWindow.getAllWindows()` 过滤后**列表的第一个**，
  而这个列表的顺序**不等于创建顺序** ⇒ 正在销毁的那个子窗会被当成主窗，
  对它的求值 promise 永不落地（偶尔直接抛 `Object has been destroyed`，那一次的"读数"其实是同一个洞的另一种脸）。
- A/B：只把选法换成"**按 `w.id` 取最小**"（我们的文档窗永远是后建的、id 更大），同一实验 4 轮全
  `22/27/23/26 ms`，0 次 TIMEOUT、0 次异常。
- 处理：`live-check` 的 `main()` 改成按 id 取，并**把之前那条"基础设施步允许读第二次"的盲目重试删掉** ——
  机制既然在选窗上，就不该留一个会盖掉真缺陷的 retry 在尺里。改完**连跑两次都是 45 条 OK、0 条 FAIL，
  再没有一条"求值超时"**（改之前同一条步骤连续三次运行都挂）。

留在尺里的两条一般性教训：① **顺序类假设要现读**（`getAllWindows()` 的列表顺序不是创建顺序，
任何"取第一个"的写法都要按一个真属性排序，例如 id）；② 挂死的读数先怀疑**尺指错了对象**，
再考虑被测对象慢——这一次"重试恰好有效"正是选错对象的特征：第二次去取的时候，那个正在销毁的窗已经不在列表里了。

## F 段：决定 4 的"退化要在界面上读得回来"第一次真上屏（2026-10-07 05:5x，同一棵壳）

壳侧的动词到 0006 为止已经全绿，但决定 4 要的不是"产物里有定义"，是**使用者不开控制台也能看见**。
这一格落在 bundle 侧（不在 `desktop/`）：

- `packages/ui-host/src/document/boot-notice.ts` 是纯函数，分两档：`describeHostSurface` 只报现场事实
  （在顶层窗还是 iframe 里 + 独立窗动词读回），`describeNoBridge` 才允许说"桥等不到"。
  分成两档是因为 realm 探针**从不等桥**，它原先那句"桥没答话"是过度陈述——被 F 的反向对照逼出来的。
- 探针（`realm-entry.tsx`，壳的 `uiBundleDir` 现在真的在发的那份产物）画上 `data-xaihi-window-capability`；
  生产入口（`main.tsx`）原先在 8 秒握手等不到之后**什么都不画**（空白页＝静默），现在画同一档的失败面。
- 开窗探测走 `@hibernalglow/xaihi-sdk/bridge` 取，不从裸名取：ui-host 的浏览器图里裸名被
  `build-aliases.mjs` 的 `BROWSER_GRAPH_ALIASES` 刻意收窄成 `help.ts`，裸名 import 的后果是
  `pnpm exec rspack build -c rspack.realm.mjs` **rc=1**
  （`ESModulesLinkingError: export 'readXaihiWindowCapability' was not found … possible exports: nodeHelpFromManifest`），
  而 vitest 全绿（它按源码解析）。⇒ 这条边的判据必须是浏览器图那把尺，不是单测。

实机（`node desktop/live-check.mjs` ⇒ **35 条 OK、rc=0**）：

- 顶层窗读到 `attr="supported"`，正文
  `这是桌面壳直接开出来的顶层窗，装的是节点 xaihi-linedup 的文档。 独立窗：可用（自家桌面壳已接 0001 的动词）`，
  与现场注入面 `typeof window.dshDesktop.xaihiWindow === 'object'` 对得上。
- 反向对照比原设计更硬：同一份文档嵌进 `<iframe>` ⇒ `attr="no-shell-surface"`，文案换成
  "装在外层 iframe 里，不是顶层窗 …… 独立窗：不可用 —— 不在桌面壳里"
  ⇒ 预加载的 `dshDesktop` 不进子帧，那句读回真跟着宿主变，不是写死的字符串。
- 单测 12 条（`packages/ui-host/tests/boot-notice.spec.ts`），阳性对照实测：把 `supported === true`
  改成恒真 ⇒ vitest **rc=1、点名 4 条**；node-sdk 侧 `desktop-windows.spec.ts` 8 条仍绿。
- **`main.tsx` 那一档没有上屏证据，也没有编译证据**：壳现在发的产物是 realm 探针（`dist-realm`），
  生产入口走 `dist-ui`（`rspack.document.mjs`），而这条链当场建不起来 ——
  `pnpm exec rspack build -c rspack.document.mjs` **rc=1、6 条错**，逐条归属：
  `./src/components/views/settings/RuntimeSection.tsx`（3 条，在未提交区里）、
  `./src/nodes/classf/ClassfDeletionHistoryDialog.tsx`（1 条）、`./src/nodes/marku/WorkflowEditor.tsx`（2 条），
  **全部是搬运那刀的在飞文件，错误集里没有 `main.tsx` 也没有 `boot-notice.ts`**。
  等那一刀落地再补跑这条；现在它只是纯函数实跑（12 条）加改动本身，不写成"已编译验证"。
