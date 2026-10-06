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
| 重放幂等 | 连跑两次 `sync` ⇒ `head` 与 `tree` 哈希**逐字相同**（`0b04cd40` / `28898fc8c8d9`）；这条以前不成立，是提交时间没钉住导致的，现在 `git am` 的 `GIT_COMMITTER_DATE` 钉在 pin 上 |

四条阳性对照都跑过，全部按预期变红（`--verify` 的 rc 是不带管道单独测的：无 patch ⇒ rc=1，有 patch ⇒ rc=0）：丢掉 patch 后 `--check` 红（`patch 数不符：树上有 0 个，
patches/dsh 里有 1 个`）；`--pin` 给错 sha 时红且 **HEAD 未移动**（先验 tag 再 checkout）；
扰动 patch 的**上下文行**后 `sync` 红、`git am --abort`、树退回 pin 且脏文件 0。

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

**重放之后没能立刻再拿一次绿**：deinit → sync → install → build:lib:host → bundle 之后重启壳，
`dsh web` 起来了但欢迎面抛 `desktop welcome: Web request failed`（`lib/main.js:8149 invoke`，
与之前那次 `Web authentication failed` 不是同一条），于是 `live-check` 十三条全报红——
**报红的是"这一次没验成"，不是"验过再失效"**：上一条 13/13 全绿是在 `live-check` 于 run10 之后、
deinit 之前跑出来的（`ui.rev=b6a8cb8bc96f`、正文回显 `node=xaihi-linedup`、窗口 2→3）。
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
