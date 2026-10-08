# help.workflows 搬运批次（2026-10-07）

补 `package.json#xaihi.node.help.workflows`：23 份节点清单原本一条都没有，现在按**本仓的词表形状**
（`packages/node-sdk/src/node.ts:158`：`workflows?: Partial<Record<'ui'|'cli'|'tips', string[]>>`）写上了。
散文来自 `<Xiranite>/node-definitions/<id>.json` 自己那一份（`ui` / `tips` 逐条照抄其 `en` 原文，块顺序保持上游），
`cli` 那几条逐条重写到本仓真有的 bin 与子命令上。排除项：`plugins/findz/**`（另一条 lane 在重写）、
`plugins/kisaki`（还不存在）、`plugins/hello`（另一条 lane 已删）；`linedup` / `logx` / `recycleu` 三份没动
（实测它们的 `cli` 行没有一条指着派发不了的子命令：`xlogx query`、`xlogx doctor`、`linedup filter` 都是 `dispatched`，
`recycleu` 那两条是 `skipped-danger`，`logx` 的未接腿那条是 `no-command`）。

## 1. 契约能说什么（rule 1 的发现）

读过的三处真源：`packages/node-sdk/src/node.ts`（`HELP_SURFACES` 在 `:44`，`NodeHelp` 在 `:156-159`）、
`packages/node-sdk/src/define-node.ts`（它只把 `definition` 交给 `validateNodeDefinition`，自己不碰 help）、
`packages/contract/src/index.ts`（`NodeHelpWorkflow` 在 `:146-152`，`NodeHelp.workflows` 在 `:179` / `:198`）。
按这三处能说的话，本批只写 `ui` / `cli` / `tips` 三个键、每个键一个字符串数组，不加字段、不松校验。

装不下来的三件（都是**契约缺口**，不是本轮可以自行扩写的东西）：

1. **块分组。** 上游那份是 `workflows: [{title:{zh,en}, summary:{zh,en}, ui|cli|tips:{zh,en}}]`，
   一个节点多个块；本仓的清单侧是"使用面 → 裸串列表"的一张扁表，没有块这个层级，也没有 `title` / `summary` 的落点。
   实测这批 23 份共 **46 个块**，它们的 46 个标题与 46 个摘要在落盘时全部丢失，只剩"按上游块顺序拼接的行"。
   同一条缺口已由 `docs/port/gap-recheck-2026-10-07.md` 的 G11 段记过（"缺口在清单与推导器之间，不在双语上"），
   本批不改它，只把数字补实。
2. **逐行双语。** `node-definitions/*.json` 的**数据**确实每个面都带 `{zh, en}` 两份
   （本批 23 份共 **125 条 `en` 行 + 125 条 `zh` 行**，两面逐条对称：`ui` 77 / `cli` 46 / `tips` 2）。
   `string[]` 一行只能装一种语言，所以 `zh` 那 125 条整块没落盘（下表逐节点记数）。要装回来得给 `node.ts:158` 换词表，那是契约变更。
   本批写的是 `en` 那一侧：`packages/node-sdk/src/help.ts:130-140` 合成的屏是英文的，
   `packages/contract`/`node-sdk` 的 `TerminalHelpWorkflow` 也是单语 `string[]`，已落地的三份先例里 `logx` / `recycleu` 用英文。
3. **`help.commands` 与 `help.safety`。** `NodeHelp` 里根本没有这两个键；校验器对 help 只要求"是个对象"
   （`node.ts:313`：`if (raw.help !== undefined && !isPlainObject(raw.help))`），所以 23 份清单里早就存在的
   `help.safety` 是**不经校验的额外键**、终端面也不读它。上游的 `commands[]`（逐条 `{command, examples[]}`）本批整块没搬。

**更要紧的一条（实测，不是推断）**：这份扁表今天**没有任何渲染面在读**。
`nodeHelpFromManifest`（`packages/node-sdk/src/help.ts:93-169`）的输入类型 `TerminalHelpSource`（`:60-65`）
只有 `nodeId` / `title` / `description` / `actions`，**从不读 `source.help`**，它自己合成两块写死的 workflow（`:130-140`）。
工作台那一页与终端那一屏都走这个推导器：`scripts/gen-node-registry.mjs:77` 生成
`nodeHelpLoaders[id] = () => ({ help: nodeHelpFromManifest(NODE_MANIFESTS[id]) })`，
各包的 `plugins/<id>/src/help.ts` 同样是 `nodeHelpFromManifest(manifest.xaihi.node, { bin })`（例：`plugins/bandia/src/help.ts:32`）。
`rg node\.help` 在 `plugins/*/src/**` 里零命中，只有 `tests/` 读它。
⇒ 现在唯一读 `xaihi.node.help.workflows` 的消费者是 `scripts/check-cli-commands.mjs`（`declaredCliPromises`，`:110-123`）。
任务前提说的"面板与 `--help` 那两屏由这张表驱动"**与代码现状不符**：要让它成立得改 `packages/node-sdk/**`（rule 1 禁止），
所以按 ADR-0013 / 不碰 DSH 那套纪律记成一条待接线的缺口，不自建第二条通路。

## 2. 逐节点台账

列义：上游块数 | 上游 `en` 行 `ui/cli/tips` | 上游 `zh` 行数 | 本批写入的面 | 写入行 `ui/cli/tips` | 丢掉或改写了什么

| 节点 | 块 | 上游 en (ui/cli/tips) | 上游 zh | 写入面 | 写入 (ui/cli/tips) | 丢掉 / 改写 |
|---|---|---|---|---|---|---|
| `bandia` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条引导式 cli 全部重写（`ui`/`gd`/`guided` 未接） |
| `bitv` | 2 | 0 / 5 / 0 | 5 | cli | 0 / 7 / 0 | 2 组 title+summary、5 条 zh；5 条 cli 全部重写（workbench 两条未接；位置参数改 flag） |
| `classf` | 2 | 6 / 0 / 0 | 6 | ui | 6 / 0 / 0 | 2 组 title+summary、6 条 zh；上游无 cli 文案 ⇒ **不写**（写新文案＝造营销词） |
| `classq` | 2 | 6 / 0 / 0 | 6 | ui | 6 / 0 / 0 | 同上 |
| `cleanf` | 3 | 4 / 7 / 2 | 13 | ui+cli+tips | 4 / 7 / 2 | 3 组 title+summary、13 条 zh；`--preview false` 语法不成立 ⇒ 改写；引导腿未接 ⇒ 散文 |
| `crashu` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `dissolvef` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；`xdissolvef guided` **已接** ⇒ 上游那句照搬 |
| `encodeb` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `enginev` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `formatv` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `gifu` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；pipeline 那句照搬，workbench 那句改成未接 |
| `linku` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `marku` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `migratef` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `mvz` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `nameu` | 2 | 6 / 0 / 0 | 6 | ui | 6 / 0 / 0 | 2 组 title+summary、6 条 zh；上游无 cli 文案 ⇒ 不写 |
| `rawfilter` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `repacku` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写 |
| `samea` | 1 | 3 / 0 / 0 | 3 | ui | 3 / 0 / 0 | 1 组 title+summary、3 条 zh；上游无 cli 文案 ⇒ 不写 |
| `sleept` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 5 / 0 | 2 组 title+summary、5 条 zh；2 条 cli 重写；`countdown`/`at`/`netspeed`/`cpu` 未接 ⇒ 写成散文 |
| `smartzip` | 2 | 4 / 2 / 0 | 6 | ui+cli | 4 / 5 / 0 | 2 组 title+summary、6 条 zh；2 条 cli 重写 |
| `timeu` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 6 / 0 | 2 组 title+summary、5 条 zh；位置参数 ⇒ `--paths`；`--dry-run` 那句补成完整命令 |
| `trename` | 2 | 3 / 2 / 0 | 5 | ui+cli | 3 / 4 / 0 | 2 组 title+summary、5 条 zh；上游 cli 块只有引导模式与根帮助那两句且 bin 名不同 ⇒ 4 行按本 bin 的子命令表写 |
| **合计（23 份）** | **46** | **77 / 46 / 2** | **125** | 18 份 ui+cli（`cleanf` 另有 tips）、1 份仅 cli（`bitv`）、4 份仅 ui | **77 / 92 / 2** | 171 行落盘；46 组 title+summary 与 125 条 zh 行没落点 |

## 3. `cli` 行的改写账（rule 3）

bin 名取自各包 `package.json#bin`；子命令词表取自 `node plugins/<id>/lib/cli.js --help`（23 份全部 rc=0）。
按类别列"上游那句话本仓兑现不了"的地方：

- **引导 / 工作台腿未接**：本批 23 个 bin 里 **22 个把 `ui` / `gd` / `guided` 全标成 `（未接）`**；
  只有 `dissolvef` 的 `guided` 没标（它没有 `ui` / `gd` 两条）。`sleept` 还额外把 `countdown` / `at` / `netspeed` / `cpu` 标成未接。
  15 份的上游 cli 块写的是同一句 `Run \`xiranite <id>\` for the guided mode …`
  （`bandia`、`crashu`、`dissolvef`、`encodeb`、`enginev`、`formatv`、`linku`、`marku`、`migratef`、`mvz`、`rawfilter`、
  `repacku`、`sleept`、`smartzip`、`trename`），`bitv` 与 `gifu` 另有明写 `ui` / `gd` 工作台腿的句子
  ⇒ 18 句照搬不得：15 句引导式里除 `dissolvef` 的 14 句 + `bitv` 的 2 句工作台 + `gifu` 的 1 句工作台 + `cleanf` 的
  1 句剪贴板引导（`Run \`xiranite cleanf\` and choose the clipboard path source.`）；能照搬的只有 `dissolvef` 那一句
  （`Run \`xdissolvef guided\` …`）。落法沿用 `logx` / `recycleu` 的先例：
  一行"未接"的散文（不提 `<bin> <子命令>`，尺判 `no-command` 而不是假承诺）+ 若干条真有的子命令。
- **bin 名不同（全部 23 份）**：上游写 `xiranite <id>`，本仓是 `x<id>`（`check:brand` 也要求这个）。
  其中 **`trename` 最甚**：上游该块只有 `xiranite trename` 与 `xiranite trename --help` 两行，
  本仓 bin 是 `xtrename`、没有裸 `trename` 子命令 ⇒ 按 rule 3 用 `xtrename --help` 屏上的
  `scan import validate rename undo history` 补了 4 行，并在清单里明写"这两行来自 bin 自己的子命令表，不是上游文案"。
- **位置参数（`bitv`、`timeu`）**：上游写 `xbitv analyze <path> --json` 与 `xiranite timeu restore D:/folder --record …`。
  本仓 vendored 的 `cli-support.ts` 解析器拒位置参数（`docs/port/gap-recheck-2026-10-07.md` G12 第一条实测：
  `Unknown argument: <token>.`）⇒ 改成 `--path` / `--paths`，两份清单里各留一句话说明这次改写。
- **`--key value` 布尔语法（`cleanf`）**：上游写 `xcleanf run … --preview false`。本仓只认 `--key`、`--no-key`、`--key=value`
  ⇒ 那句会变成"未知参数"。改成按本包声明的真实语义写（`plugins/cleanf/src/cli.ts:152`：
  `preview` 命令恒预演、`run` 带 `--preview` 才是预演），两条分行写清"不带就是真移进回收站"。
- **上游本来就没有 cli 文案（4 份）**：`classf`、`classq`、`nameu`、`samea` 的上游块只有 `ui`。
  按 rule 2（不造新文案）它们的 `workflows` 只有 `ui` 键 ⇒ 尺仍把这 4 个包记成"有终端面但清单里一条 cli 承诺都没写"。
  这四份的 CLI 文案要谁来写、写什么，得由负责该节点终端面的批次决定。

**承诺兑现的独立对照**（因为尺对这 23 个包一个进程都不起）：这 23 份清单全部 `xaihi.node.danger.type !== "none"`，
`check-cli-commands.mjs` 走 `skipped-danger` 分支（`:292-305`），不跑 `--help`、也不判派发。
所以另跑了一遍**照抄尺的抽取算法**（`extractCommands` `:132-160` + `parseVocabulary` `:169-184`）的核对脚本，
输入是现读的 manifest 与现跑的 `<cli> --help`：**94 条命令提及、94 条命中词表、0 条未解析、0 份 `--help` 非零**。
这里要如实记一笔：那 23 份虽然都是 danger 包，核对脚本**还是起了 `<cli> --help` 这一种形态**（cwd 是空目录、stdin `ignore`），
比尺自己的纪律（danger 一个进程都不起）更宽；没跑过任何不带 `--help` 的形态，所以不会碰文件系统。
词表与（未接）标记就是这么读来的。
没测到的另一半：`<bin> <子命令> --help` 是否打印**自己的**屏（`helpIsScoped`，`:230-233`）——
那需要每条子命令各起一个进程，本批没跑，那半条腿仍是空的。

## 4. 验证台账（真实 rc 与输出）

改前 `node scripts/check-cli-commands.mjs`：

```
check-cli-commands: 27 个包 = 1 个没有终端面（无 bin/./cli/./help）+ 23 个有终端面但清单里一条 cli 承诺都没写 + 3 个承诺了东西；被判决的承诺文案 6 条
  dispatched 3 / absent 0 / refused-help 0 / skipped-danger 2 / help-not-scoped 0 / no-command 1 / unmeasured 0
  CLI 侧有、清单没承诺的子命令合计 7 条
rc=0
```

改后（`node scripts/check-cli-commands.mjs`）：

```
check-cli-commands: 27 个包 = 1 个没有终端面（无 bin/./cli/./help）+ 4 个有终端面但清单里一条 cli 承诺都没写 + 22 个承诺了东西；被判决的承诺文案 141 条
  dispatched 3 / absent 0 / refused-help 0 / skipped-danger 137 / help-not-scoped 0 / no-command 1 / unmeasured 0
  CLI 侧有、清单没承诺的子命令合计 7 条
rc=0
```

⇒ 假承诺（`absent`）仍为 0，`refused-help` / `help-not-scoped` / `unmeasured` 全 0。
判决行 6 → 141：本批 23 份贡献 **135 行**（`cli` 文案 92 条 ⇒ 一条点名 k 个子命令就出 k 行），
另外 6 行还是 `linedup` / `logx` / `recycleu` 那三份原有的。新增的 135 行**全部落在 `skipped-danger`**，
因为这 23 份清单都声明了 danger ⇒ 尺拒绝起进程。`dispatched` 没涨（仍是 3），
这是**尺的判据边界**，不是搬运的成果。

仓库级门禁（本批最后一次性重跑，全部为改后状态）：

| 命令 | rc | 读数 |
|---|---|---|
| `node scripts/gen-node-registry.mjs`（不带 `--check`） | 0 | `27 个界面目录 → 27 条注册`，写 `packageModules.generated.ts`（341 行） |
| `node scripts/gen-node-registry.mjs --check` | 0 | `gen-node-registry --check OK` |
| `node scripts/gen-cli-registry.mjs --check` | 0 | `gen-cli-registry --check OK（26 条…）` |
| `pnpm check:noderegistry` | 0 | 同上 |
| `pnpm check:cliregistry` | 0 | self-check + `--check` 都过 |
| `pnpm check:vocab` | 0 | `self-check OK（8 类坏定义全被拒…）`、`上游定义 27 份，我们的校验器放过 27 份`、`基线 pass=27/27 → 现在 27/27；消失 0，新增 0` |
| `pnpm check:installable` | 0 | `self-check OK`、`30 个 bundle 包都能被 file: 安装，例外 1 个` |
| `node scripts/check-cli-commands.mjs` | 0 | 见上 |
| `node scripts/check-brand.mjs` | **1** | `1270 处旧品牌活标识符` |

`check-brand` 说明（rule 4 说它必须 rc=0，实测**本批之前就已经 rc=1**，且不是本批造成的）：
命中全在别的 lane 的在飞文件里 —— 按路径分组 `packages/ui-host=1111`、`packages/api=34`、`scripts=24`、
`packages/cli=23`、`packages/cli-runtime=16`、`packages/logging=11`、`plugins/smartzip=8`、`plugins/linku=5` …；
**本批改的 23 份 `package.json` 与生成的 `packageModules.generated.ts` 命中数 = 0**
（生成前后各核一遍；写 manifest 的脚本里还有一条 `JSON.stringify(workflows).match(/xiranite/i)` 的直接闸门，23 份都没触发）。
没有给它加白名单、没有 skip。

逐包 `pnpm --filter @hibernalglow/xaihi-<id> typecheck`：**23/23 rc=0**（`encodeb` 那一份第一次批量时筛名写错成
`@hibernalglow/xaihi-encodb` ⇒ 那一次是空跑，随后单跑 `@hibernalglow/xaihi-encodeb` rc=0， `$ tsc --noEmit`）。
没有出现"共享包 `node_modules` 缺失"那类失败，所以没有需要撤回的 typecheck 结论。

逐包 `test:unit`：**9 份 rc=0 / 14 份 rc=1**。14 份的失败**每份恰好 1 条用例**，全在
`tests/definition.spec.ts`，断言的都是"清单的 `help` 只有 `whenToUse`(+`safety)`、`workflows` 不许在"
——也就是那批搬运文件把**本任务要反过来做的事**钉成了期望值。四种写法：2 份 `expect(JSON.stringify(node)).not.toContain('workflows')`
（`bandia`、`enginev`）、2 份 `expect(node.help.workflows).toBeUndefined()`（`cleanf`、`mvz`）、
10 份 `expect(Object.keys(node.help)).toEqual(['whenToUse','safety'])` 一类的键集合断言
（`bitv`、`classf`、`crashu`、`encodeb`、`formatv`、`marku`、`migratef`、`repacku`、`smartzip`、`trename`）：

| 结果 | 节点 | 读数 |
|---|---|---|
| rc=0（全绿，9 份） | `classq`, `dissolvef`, `gifu`, `linku`, `nameu`, `rawfilter`, `samea`, `sleept`, `timeu` | 例：`classq Tests 42 passed (42)`、`gifu Tests 54 passed (54)`、`timeu Tests 29 passed (29)`、`dissolvef Tests 14 passed (14)` |
| rc=1（1 份恰好 1 条红，14 份） | `bandia` 54/55、`bitv` 59/60、`classf` 37/38、`cleanf` 48/49、`crashu` 38/39、`encodeb` 33/34、`enginev` 52/53、`formatv` 40/41、`marku` 56/57、`migratef` 37/38、`mvz` 53/54、`repacku` 47/48、`smartzip` 58/59、`trename` 40/41 | 例：`bandia … help 只剩我们词表能装的那两块，whenToUse 是字符串（落差 4）` ⇒ `expected '{"definitionVersion":1,"nodeId":"band…' not to contain 'workflows'`；`bitv …` ⇒ `expected ['whenToUse','workflows','safety'] to deeply equal ['whenToUse','safety']`；`cleanf …` ⇒ `expected { ui: [ …(4) ], cli: [ …(7) ], …(1) } to be undefined`；`marku …` ⇒ `expected ['whenToUse','workflows'] to deeply equal ['whenToUse']` |

（表里 `encodeb` 第一次批量跑用的是错的 filter（空跑判成 rc=0），单跑后是 rc=1；上表按单跑的真实结果记。）

阳性对照（"关掉防御就变红"，AGENTS 门禁一节）：把 `plugins/bandia/package.json` 与 `plugins/classf/package.json` 的
`help.workflows` 删掉再各跑一次 `test:unit` ⇒ **两包都 rc=0**（`classf Tests 38 passed (38)`），
随后从备份恢复并核对**字节级一致**（`bandia restored byte-identical: true | classf restored byte-identical: true`）。
⇒ 那 14 条红是本批的直接后果，不是别的 lane 的既有病。

一次不可归因的噪声（记录，不当结论）：第一轮批量跑时 `classf` 的 `tests/cli-upstream-flags.spec.ts` 两条也红
（`--crashu-source 没打出来`、`expected 'Unknown option: --definitely-not-a-fl…' to match /Unknown argument/i`），
删掉 workflows 后转绿、恢复后单跑仍绿 ⇒ 那是别的 lane 在飞时的瞬时干扰（AGENTS："别人在飞的时段里结果不可归因"）。

本批**没跑**的东西：根 `pnpm test`（任务明令禁止，另一条 lane 在飞）、`pnpm check:cliface` / `check:tuiface` /
`check:nodebundle` / `check:pins` / `check:skills`（不在本任务的验证清单里）、`<bin> <子命令> --help` 那一屏
（那需要每条子命令各起一个进程，本批没跑）。没有实机跑宿主，所以"工作台那一页读不读这张表"的结论只到读码 + 读生成物的程度。

上表之后又修了 `trename` 清单里**一句不实的话**：原本写 `The upstream CLI block for this node is empty…`，
实测那份上游块有两句（引导模式 + 根帮助），已改成"上游只点了旧壳的引导与根帮助，所以上面两条命令行来自本 bin 自己的子命令表"。
改完把该跑的重跑一遍：`gen-node-registry`（写）rc=0、`pnpm check:noderegistry` rc=0、`node scripts/gen-cli-registry.mjs --check` rc=0、
`pnpm check:cliregistry` rc=0、`pnpm check:vocab` rc=0、`pnpm check:installable` rc=0、
`node scripts/check-cli-commands.mjs` rc=0（读数与上表逐字相同：`dispatched 3 / absent 0 / refused-help 0 / skipped-danger 137 / help-not-scoped 0 / no-command 1 / unmeasured 0`）、
`node scripts/check-brand.mjs` rc=1 / `1270 处`（我改的 23 份 manifest 与生成产物仍是 0 处命中）；
`trename` 单包 `typecheck` rc=0（`$ tsc --noEmit`）、`test:unit` rc=1（`Tests 1 failed | 40 passed (41)`，红的是同一条键集合断言）。
归属重核仍是 **23/23 identical**。

## 5. 文件归属

只写了 23 份 `plugins/<id>/package.json`、1 份生成物 `packages/ui-host/src/components/modules/packageModules.generated.ts`
和本报告。逐份核对：把当前 manifest 去掉 `help.workflows` 后与 `git show HEAD:` 的那一份做键序无关的比较，
**23/23 identical** ⇒ 每份 manifest 里除了新增的 `workflows` 块，没有第二个字节的改动。
（注意 `git diff HEAD` 在这仓会给成片假删除：它对 `plugins/gifu/package.json` 报 `0 1322`，而 `but diff` 报的是本批那一个 14 行新增 hunk。）
生成物这一侧也核过：`packageModules.generated.ts` 里 `"workflows":{` 出现 **26 次** = 本批 23 份 + 已有的
`linedup` / `logx` / `recycleu` 三份（`findz` 自己没有，属排除项）；
`xtrename scan` / `xcleanf preview` 这些新写的 `cli` 行确实嵌进去了；该文件里唯一提到旧品牌的是生成器自带的第 7 行注释
（`//   2. 类型不再从 @xiranite/contract 拿…`），`check-brand` 剥注释后对它报 0 处，与上面 1270 的分组一致。
未提交，提交归使用者。

## 6. 后续

1. **接线**：要让面板与终端屏真读这张表，得给 `nodeHelpFromManifest` 增加 `help` 输入并把扁表映射回
   `TerminalHelpWorkflow` 块（改 `packages/node-sdk/**`）；先要拍的是"块从哪来"（扁表没有块）。
2. **双语**：`node.ts:158` 换成 locale-keyed 形状才能装下那 125 条 `zh` 行；那是契约变更，按 ADR 流程走。
3. **块分组**：若要恢复 `title` / `summary`，形状已经在 `packages/contract/src/index.ts:146-152` 与
   `packages/node-sdk/src/help.ts:41-47` 建模了，缺的是清单侧那一层。
4. **同批改期望值**：14 份 `plugins/<id>/tests/definition.spec.ts` 里"workflows 不在"的正控要随本批一起换
   （搬运批次"与消费者同批"那条纪律），本批因 rule 8 没动它们 —— **这就是那 14 条红的全部原因，不是回归**。
5. **补 4 份的 CLI 文案**：`classf` / `classq` / `nameu` / `samea` 的 `cli` 承诺位仍空。
6. **`skipped-danger` 那 137 条**：等 danger 包的 `--help` 腿能安全跑时，把 `helpIsScoped` 那半条判据补上，
   否则"承诺兑现"这件事对这 23 个包只证到"名字在词表里"这一层。
