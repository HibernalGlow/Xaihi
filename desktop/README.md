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
- 上游 bump ⇒ patch series 重放；重放红就是红，不许 `--3way` 蒙。
