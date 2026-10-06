# ADR-0010 品牌统一：自称一律 Xaihi，`Xiranite` 只作为出处存在

状态：接受（2026-10-06）
决策人：HibernalGlow（用户 2026-10-06 原话："1 点要记录到 ADR 和 agent MD，那就是统一品牌名
xiranite 换成 xaihi"）
相关：ADR-0006（UI 的真源是 Xiranite 现成实现）、ADR-0002（自包含包）、ADR-0004（非 JS 内核交付）、
`AGENTS.md`、`scripts/check-brand.mjs`、`CONTEXT.md`

## 背景

ADR-0006 把动词定成"搬运"之后，搬运产物里必然带着上游的自我称呼：`@xiranite/*` 说明符、
`.xiranite-node-surface` 这类 CSS 类名、`xiranite-rule-tree/v1` 这种线上格式值、`.xiranite/`
开头的落盘路径。它们混在注释里那句"词表照抄 Xiranite 的 `contract.ts`"中间，人眼分不开，
于是"统一品牌"这件事要么变成全仓删词（把出处也删了，搬运账就断了），要么变成口头承诺（一定漂）。
所以这篇 ADR 给的是**分界**，不是一条"搜索替换"。

`scripts/check-brand.mjs` 是这把尺：**剥掉注释之后**再找 `xiranite`。注释里允许写出处，代码里不许。
它的 `--self-check` 钉三个正控（import 必须被抓 / 注释里的出处必须被放过 / 字符串常量必须被抓，
应为 `1/0/1`），尺瞎了就先红。

## 实测清单（2026-10-06 22:21 起读数，全部现读；**这一节的数字是活的，见第 2 条**）

| # | 事实 | 数字与出处 |
|---|---|---|
| 1 | 代码里的旧品牌活标识符 | `node scripts/check-brand.mjs` **rc=1**，22:25:25 读到 **757 处**，散布在 100+ 个文件 |
| 2 | 同一把尺在几分钟内的三次读数 | **134 → 504（22:21）→ 757（22:25:25）**。第一份 134 的清单里**没有** `src/index.css`、`src/components/**`、`src/nodes/**`，而 `src/index.css` 的 mtime 是 **22:18:54**；最后一次跳涨是 6 个 `packages/*` 目录刚落进来（见第 8、10 条）⇒ 差值不是扫描范围变了，是**有另一个进程正在把搬运产物往仓里落** |
| 3 | 命中最重的文件 | `src/index.css` 81、`src/components/modules/packageModules.generated.ts` 48、`styles/themes/wuling.css` 42、`design-axes.css` 29、`custom-theme.css` 28、`styles/design/wuling-components.css` 13 |
| 4 | `@xiranite/*` import 说明符（去重） | **64** 个，头部是 `@xiranite/contract`、`@xiranite/shared`、`@xiranite/findz-native`、`@xiranite/api/client`、`@xiranite/node-<id>/core` |
| 5 | `xiranite-` 前缀的活标识符（去重） | **93** 个（CSS 类名、data 属性、格式串） |
| 6 | 跨语言的格式判别符 | `xiranite-rule-tree/v1`：TS 侧 `plugins/findz/src/contract.ts:130`，Go 侧比对 `native/findz-go/query.go:380`，夹具 `native/findz-go/service_test.go:238` |
| 7 | 落盘文件名 | `xiranite.config.toml` 命中 **19** 行；`.xiranite/simiu-runs.jsonl`、`.xiranite/smartzip-runs.jsonl` 两处数据路径（都在 i18n 文案里，即**使用者会看见的句子**） |
| 8 | 包名与 `bin`：**我这一侧干净，搬运那一侧不干净** | 现读 16 份 manifest（按 `name` + `bin` 判定）：我这 **10** 份全是 `@hibernalglow/xaihi-*`（`packages/` 6 + `plugins/` 4），而此刻刚落进来的 **6** 份带旧品牌 ⇒ `@xiranite/api`、`@xiranite/cli`（**`bin: {"xiranite": "./dist/index.js"}`**）、`@xiranite/cli-runtime`、`@xiranite/contract`、`@xiranite/logging`（`bin: xlogs`）、`@xiranite/shared`。**包名是 A 类里代价最大也最要紧的一档**——它顺着 registry、`node_modules` 路径、`workspace:*` 依赖图一路漏到使用者面前 |
| 9 | prose 侧的出处（**保留，不算违规**） | `docs/` + `README*` + `CONTEXT.md` + `.dsh/skills` 合计 **70** 行提到 Xiranite（`adr/0007` 16、`adr/0006` 12、`xaihi-migration` 技能 9、`stages/step-4.md` 6…） |
| 10 | 有另一个写入者正在改这些文件 | `find packages plugins scripts -type f -newermt '-30 minutes'` = **32**，最新 mtime 22:20:01（`packages/ui-host/src/lib/design-theme/apply.ts`）；这批文件**还没进 git**（`git ls-files packages/ui-host/src` 只有 11 个，`git status --porcelain` 把 `src/components/`、`src/nodes/`、`src/store/`、`src/i18n/` 全报成 `??`） |
| 11 | 那些旧包名前面**压着一条 install 拒绝**，不是纯拼写问题 | 写它的那一侧已经把 `packages/{api,cli,cli-runtime,contract,logging,shared,tui}` 用 `!` 模式挡在 workspace 外（`pnpm-workspace.yaml:12-19`），现读 `pnpm ls -r --depth -1` = **10** 个成员、全是我这边的 `@hibernalglow/xaihi-*` ⇒ 我的 install/build/门禁不受影响。那里的注释记着报错原文（`packages/api → @xiranite/file-operations@workspace:*`，本仓没有这个包名，一旦入表则**全仓每条 pnpm 命令**都解不出依赖树），放行条件挂在 `packages/cli/port-inventory.json`。**这条与 ADR-0002 是同一种失败发生在仓内**：所以包名改名的真正交付是"依赖图换成 Xaihi 里真实存在的包"，改名和放行必须同批，改一半反而会让下一批 install 更看不清 |

第 2 条和第 10 条是这篇 ADR 里最要紧的两条：**这个数字是活的**。把它抄进任何文档当"待办总数"都
会在下一个小时失效，所以接线判据不能写成"清零 757 处"，只能写成"最后一条命中改掉的那个提交里
一起接 CI"。

## 决定

1. **自称一律 Xaihi。** 范围是所有会随代码活下去的称呼：npm 包名与 scope、`bin` 名、CSS 类名前缀、
   `data-*` 属性、DSH storage domain 与 `/xaihi/*` 路由、`globalThis.__XAIHI__`、临时目录前缀、
   错误与日志文案、i18n 里使用者读到的句子、界面上的字符串。
2. **`Xiranite` 只允许作为"出处"存在，且只能在 prose 里。** ADR、阶段报告、技能、对照表、`CONTEXT.md`
   词条里那些"这一条是从哪搬来"必须留着原名——那是搬运的账本，删掉它下次就得重新考古一遍。
   判据就是这把尺的形状：**剥注释后代码里有 = 违规；prose 里有 = 出处**。
3. **处置分三类，不许混着改**：
   - **A 类｜直接改名**：CSS 类名 / `data-*` / `@xiranite/*` 说明符 / 临时目录前缀 / 界面文案。
     代价只在"同一批要 CSS、JSX、测试一起动"——改一半会让选择器失去消费者，比不改更糟。
   - **B 类｜改名要连带数据迁移**：`xiranite-rule-tree/v1`（TS 与 Go 两侧比对，是同一条请求体上的
     契约）、`xiranite.config.toml`、`.xiranite/*.jsonl`。后两条写的是**上一个产品落在使用者磁盘上的
     文件名**。换名不是拼写问题，是"旧数据要不要继续读得到"的问题。
   - **C 类｜不许改**：`native/findz-go/**` 里从上游逐字移植的部分连同它的署名、docs 里的引用、
     以及 `scripts/check-brand.mjs` 自己（模式与夹具必须字面写着旧品牌；这是尺的唯一豁免，靠
     `--self-check` 的 1/0/1 正控防它变瞎）。
4. **不加白名单、不靠 skip 变绿。** 尺的输出必须是"改名字"，不是"注册例外"。将来真出现必须保留的
   活标识符（例如为了读旧数据而保留旧格式判别符），那一条要成为本 ADR 的一个**有出处的 B 类决定**，
   而不是门禁里的一行 `SKIP`。

## 门禁的接线时机（现在故意不接）

`check:brand` 能跑、能证伪，但**不进** `pnpm test`，也不进 `.github/workflows/ci.yml`。理由不是"还没写完"，
是第 10 条：另一个写入者此刻正在往 `packages/ui-host/src/**` 落 A 类文件，接上去的后果是

- 别人在飞的活儿把我的未提交改动一起判成红，或者更糟——我为了绿灯去动他们正在写的文件；
- 红线来自搬运中间态，读不出"品牌规则被违反了"这个信号。

两步退出，且第二步必须写进同一个提交的信息里：

1. **搬运批次落地时顺手改名**（A 类，与消费者同批）——由写这批文件的 lane 负责，不是由我远程替换。
2. **最后一条 A 类命中被改掉的那个提交**把 `check:brand` 加进根 `package.json` 的 `test` 串与 CI。
   接线时数字应当是 0（B 类若被裁定"沿用旧名以读旧数据"，则它在那条决定里被逐条点名，不是被过滤掉）。

## 待使用者拍板（B 类的两件，我不替使用者决定）

1. `xiranite-rule-tree/v1` → `xaihi-rule-tree/v1`：**改就要 TS/Go/夹具三处同批**。当前仓内没有任何
   读盘路径会带着旧值进来（findz 的规则树只作为请求参数存在，`plugins/findz/src/contract.ts:139,222`），
   所以可以硬切；但如果使用者手上已有存过规则树的文件，就要留一条读旧值的分支——留不留由使用者定。
2. `.xiranite/` 数据目录与 `xiranite.config.toml`：**沿用**（Xaihi 直接读得到上一个产品的数据）还是
   **换名**（旧数据看不见但边界干净）。这条决定了 `sleept`/`findz` 之类节点未来的默认路径，
   不属于改名，属于数据归属。

## 后果

- `AGENTS.md`（本次新建）把第 1、2、3 条写成 agent 每次进来都要遵守的规则；本 ADR 是它的出处与账本。
- `CONTEXT.md` 的 **门禁词** 一节**已加** `check-brand` 一条（提交 `9217670`，只取 `nonr:9` 那一条 hunk；
  同一文件另一条 hunk 是 findz lane 的词表，没动）。顺带把 **check-panels** 那条标注作废——它的脚本
  `scripts/check-panels.mjs` 已随 UI Kit 退回删掉，词条留在原地却不标注，等于让下一个进来的 agent
  去找一条不存在的尺。
- 路线图的 **R13（品牌收口 + 接线时机）** 文字已经写进 `docs/roadmap.md`，但**故意没有提交**：
  GitButler 那里路线图只剩一条 hunk，而这条 hunk 同时装着搬运那一侧正在重写的 R1/R10/R11 三行，
  按 hunk 提交会把别人在飞的文字算进我的提交信息名下。等那一侧提交路线图时一起落地。
- 这条规则和 ADR-0006 不冲突：0006 说的是**设计与实现去别人的仓库拿**，0010 说的是**拿过来之后
  它自称谁**。搬运保真 ≠ 保留旧品牌的自我称呼；保真的判据落在布局、交互、词表语义上，不落在包名上。
