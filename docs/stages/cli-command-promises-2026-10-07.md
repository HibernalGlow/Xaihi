# 阶段实测：清单承诺的 CLI 命令，到底有没有被派发（2026-10-07）

对应 `docs/adr/0006-ui-source-is-xiranite.md`（终端面是搬来的，不是新设计的）与
`docs/service-mapping.md` 的 G7（"面在宣传兑现不了的入口"）。
上游出处：`scripts/gen-cli-registry.mjs` 脚本头记着那次"假承诺从 46 条压到 21 条"——压掉的是**不存在的包**，
剩下的承诺是否真被 CLI 派发，此前没人量。本报告就是那条读数。

测量时点 05:00–05:01（本机 `node v26.10.0`，darwin/arm64）。仓里有另一条 lane 在飞：
`git status --porcelain | rg -c '^.. plugins/'` = 167。本报告里的事全部带 **rc + 真实输出**；
我只新增两个文件（`scripts/check-cli-commands.mjs`、本文件），**没动**任何 manifest、`pnpm-*` 配置、
`plugins/*/src/**` 或其它 docs，**没跑** `pnpm install`，**没跑**任何 `but` 写命令（没有提交）。

## 1. 改了什么

新增一把尺 `scripts/check-cli-commands.mjs`：对每个 `plugins/<id>/`，现读

- 承诺清单 `xaihi.node.help.workflows.cli`（数组，逐条文案），
- bin 名与"这个包算不算有终端面"的资格判据，

然后**只用无副作用的调用形式**（`<cli> --help`、`<cli> <sub> --help`、以及帮助里自己写了的
`--list`/`--commands`/`--subcommands`）去对照 CLI 自己的子命令表，逐条给判决：
`dispatched` / `absent` / `refused-help` / `skipped-danger` 四桶，外加三个如实命名的补充桶
（`help-not-scoped` / `no-command` / `unmeasured`，见 §3）。
每次 spawn 的 `cwd` 都是 `.scratch/` 下现开的空目录、`stdin` 是 `ignore`、默认 20 秒超时，
起进程之前还有一道 argv 形状闸门（只放行上面三种形态）。

不接线：根 `package.json` 的 `test` 链**没动**（该文件在别人的未提交区里），接线语句写在 §7。

## 2. 为什么这条尺要在 `check-cli-face.mjs` 之外存在

`scripts/check-cli-face.mjs` 证三件事：`plugins/<id>/lib/cli.js` 存在、`<cli> --help` 退码 0、
输出里带着自己的 bin 名。那是最弱的证明——**它一个字都不涉及清单承诺了什么**。
一个包可以三条全绿，而 manifest 写着 `["xfoo deploy"]`、CLI 里根本没有 `deploy`。
本尺量的正是"承诺的那条命令是否被认出来、并且打得来自己的帮助屏"。

两处语义不是我另立的：

- **bin 与资格判据**逐条照抄 `scripts/gen-cli-registry.mjs:28-45` 的 `registryEntries`
  （`Object.keys(pkg.bin)[0]` 当 bin；`name` 是字符串；`exports["./cli"]` 与 `exports["./help"]` 都必须在；
  description 取 `xaihi.node.description.en ?? xaihi.node.title.en` 且非空）。
  这把尺不重新解释 manifest，只在其上加读 `help.workflows.cli`。
- **承诺的规范键**是 `xaihi.node.help.workflows.cli`，不是委托里写的 `xaihi.node.workflows.cli`。
  现读证据：26 个候选包里 `node.workflows` 零命中，`node.help.workflows` 命中 3 个
  （linedup、logx、recycleu）；规范位由 `packages/contract/src/index.ts:179`
  （`workflows?: readonly NodeHelpWorkflow[]`）与 `packages/cli-runtime/src/help.ts:10`
  （`for (const workflow of value.workflows) … workflow.cli ?? []`）钉着。
  尺两处都读（`help.workflows.cli` 优先，兼容 `node.workflows.cli`），
  并且**当 `help` 下任何别的键藏着 `cli: []` 时报 `unmeasured` 红**，
  因为那等于"承诺存在但框架读不到"——比静当作"这个包没承诺"诚实。

为什么只看退码不够（这条是被实测逼出来的）：派发器 `runCommand`
（`plugins/linedup/src/cli-support.ts:305-337`，关键在第 321 行
`if (sub === undefined && !wantsHelp)`）在带 `--help` 时**跳过**"Unknown command"那条出口，
于是臆造的子命令也退码 0。当场量到：

```
node plugins/linedup/lib/cli.js filter   --help   → rc=0，印 `xlinedup filter — …`（子命令自己的屏）
node plugins/linedup/lib/cli.js zznotasub --help   → rc=0，印父屏（子命令表那一屏）
```

⇒ `dispatched` 必须同时要求 rc=0 **和**"那一屏是这条子命令自己的"（首行或 `Usage` 行带 `<bin> <sub>`），
否则 rc=0 会把假承诺洗成兑现。

消费方是聚合 CLI：`packages/cli/src/index.ts:45-48` 的 `findNodeCli()` 按 nodeId/bin 找到注册项、
`packages/cli/src/index.ts:200` 动态 `import(\`${packageName}/cli\`)`，再把余下 argv 交给包自己的
`runProgram`。清单里一条 `absent` 的承诺，落到使用者手上就是"帮助里印得出来、终端里派不发不动"。

## 3. 判决与真实读数

七桶（前四桶是委托要求的，后三桶是量出来必须点名、又不能混进前四的）：

| 桶 | 含义 | 红？ |
| --- | --- | --- |
| `dispatched` | 子命令在表里，`<cli> <sub> --help` rc=0，且打印的是它自己的屏 | 否 |
| `absent` | 清单承诺了，CLI 子命令表里没这条 ⇒ 假承诺 | **是** |
| `refused-help` | 表里有这条，但 `<cli> <sub> --help` 退码非 0（或超时） | **是** |
| `skipped-danger` | 包 manifest 声明 danger（`xaihi.node.danger.type !== "none"`）⇒ 一个进程都没起 | 否（记账） |
| `help-not-scoped` | 表里有、rc=0，但打出来的还是父屏 | **是** |
| `no-command` | 这条 `cli` 文案里没有可解析的 `<bin> <子命令>` 对（散文，或只给了 `--help`） | 否（报数） |
| `unmeasured` | `--help` 打不开 / 缺产物 / 承诺写在非规范键 ⇒ 尺没有输入 | **是** |

`no-command` 不判红的理由写在脚本头：把散文判成违规，等于逼包把说明文字改写成命令形状。
`unmeasured` 判红的理由与 `check-cli-face.mjs` 的 `no-artifact` 同一条纪律——没有输入的尺不许报绿。

### 3.1 阳性对照（`--self-check`）

```
$ node scripts/check-cli-commands.mjs --self-check
check-cli-commands --self-check OK（10 个夹具包、11 条判决断言 + SENTINEL 探针与 spawn 闸门的正反两面：兑现 / 臆造命令 / 子命令拒帮助 / rc0 印父屏 / danger 跳过 / 拿不到表 / --commands 补表 / 非规范键 / 缺产物 / 没 bin 各判各的；每个夹具包都在"被真跑"时留下 SENTINEL，跑完 0 个 ⇒ 一次没带 --help 的命令都没执行）
rc=0
```

10 个夹具包（临时目录，不落 `plugins/`）与它们各自钉住的判据，期望值全部写死在尺里，
不是再调一次被测函数求来的：

| 夹具 | 形状 | 期望判决（写死） |
| --- | --- | --- |
| `ok` | 表里有 `filter`，`filter --help` 打自己的屏；承诺分别写成裸 `xok filter` 与 ``Run \`xok filter --json\`…`` | `dispatched` ×2，散文那条 `no-command` |
| `absent` | 表里只有 `filter`，承诺 `xap zzz`，且臆造命令也 rc=0 印父屏 | `absent`（rc=0 不许洗白，委托要求的 4c） |
| `refuse` | 表里有 `run`，`run --help` 退 2 | `refused-help`，并断言判决里 `rc=2` 读得回来 |
| `liar` | 表里有 `filter`，`filter --help` rc=0 但印父屏 | `help-not-scoped` |
| `dgr` | `danger.type=actionIn dangerous=[go]` | `skipped-danger`；脚本一被起就写 `cli.js.SENTINEL` |
| `novocab` | `--help` 自己 rc=1 | `unmeasured` |
| `listf` | 帮助里写了 `--commands`，`beta` 只出现在那一屏 | `beta` 也判 `dispatched`（否则那条通路是死代码，断言 `listFlag==='--commands'`） |
| `offkey` | 承诺写在 `help.wf.cli` | `unmeasured`（非规范键不许当"没承诺"） |
| `noart` | 声明 bin 但没有 `lib/cli.js` | `unmeasured` |
| `nobin` | 没 bin | `skipKind=no-cli-face`（不跑、不判红） |

另有三条 spawn 闸门断言：`['filter']`（裸子命令）必须 `rejected`、`['--yes','--help']` 必须 `rejected`、
`['--help']` 必须放行且 rc=0；判前判后各扫一次 SENTINEL，**两个都必须 0**。

### 3.2 现树证伪（不碰任何真文件，用尺导出的函数喂一条臆造承诺）

```
$ node /tmp/xaihi-falsify.mjs 2>&1 | tail -5      # 脚本内容见下方代码块；跑完已删，不在仓里
== 现树证伪：拿 logx 真子命令表喂一条臆造的承诺 ==
real --help rc = 0 | 子命令表 = ui gd guided query sessions stats errors doctor
承诺 xlogx query → dispatched rc=0
承诺 xlogx nosuchcommand → absent | 子命令表里没有它（表：ui gd guided query sessions stats errors doctor）
拒绝非 --help 调用：runHelpOnly(bin, ["query"]) → {"rejected":true,"status":null,"output":""}
rc=0
```

（`/tmp/xaihi-falsify.mjs` 就是 `import { judgeCommand, parseVocabulary, runHelpOnly } from '<repo>/scripts/check-cli-commands.mjs'`
后按上面三行调用；复现时把 `cwd` 换成 `.scratch/` 下现开的空目录即可。）

⇒ 这把尺对**真**的子命令表也分得开兑现与臆造，而且 `["query"]` 这种没带 `--help` 的调用
在起进程之前就被拒（`status: null`、没有输出），logx 没去读任何日志目录。

### 3.3 现量（全量）

```
$ node scripts/check-cli-commands.mjs
linedup xlinedup [help.workflows.cli] · <cli> --help rc=0 · 子命令表 2 条
  ✓ filter · dispatched rc=0
  · CLI 有而清单没承诺的子命令（只报数，不判红）：guided
logx xlogx [help.workflows.cli] · <cli> --help rc=0 · 子命令表 8 条
  ✓ query · dispatched rc=0
  · (无命令) · no-command — 文案没提自己的 bin/nodeId
  ✓ doctor · dispatched rc=0
  · CLI 有而清单没承诺的子命令（只报数，不判红）：ui gd guided sessions stats errors
recycleu xrecycleu [-] · danger ⇒ 一个进程都没起
  · (无命令) · skipped-danger — 清单声明 danger（type=actionIn dangerous=[clean_now,start]）⇒ --help 都没跑；文案里也没解析出 `<bin> <子命令>`
  · (无命令) · skipped-danger — 清单声明 danger（type=actionIn dangerous=[clean_now,start]）⇒ --help 都没跑；文案里也没解析出 `<bin> <子命令>`
check-cli-commands: 27 个包 = 1 个没有终端面（无 bin/./cli/./help）+ 23 个有终端面但清单里一条 cli 承诺都没写 + 3 个承诺了东西；被判决的承诺文案 6 条
  dispatched 3 / absent 0 / refused-help 0 / skipped-danger 2 / help-not-scoped 0 / no-command 1 / unmeasured 0
  CLI 侧有、清单没承诺的子命令合计 7 条（不判红；danger 的包一条都没跑，所以那个数只覆盖非 danger 的包）
  判据：承诺的 `<bin> <子命令>` 必须在 `<cli> --help` 的子命令表里，且 `<cli> <子命令> --help` rc=0 并打印自己的屏
  不证明：命令产出正确输出、参数被吃、与宿主面（ctx.*）的接线（那是下一段腿）
清单承诺的每条命令都在 CLI 自己的子命令表里、且 --help 打得来
rc=0
```

`node --check scripts/check-cli-commands.mjs` rc=0。

### 3.4 筛单包与参数互斥（都是当场跑过的）

```
$ node scripts/check-cli-commands.mjs --only logx            rc=0   # 只量 logx：dispatched 2 / no-command 1
$ node scripts/check-cli-commands.mjs --only linedup,logx,recycleu  rc=0   # 三条承诺文案的包全筛到：与全量同一组数（6 条文案 / 3 dispatched）
$ node scripts/check-cli-commands.mjs --only nosuchpkg       rc=1   # × --only nosuchpkg 一个包都没筛到 ⇒ 筛空了不该报绿
$ node scripts/check-cli-commands.mjs --only logx --plugins-dir /tmp/x   rc=2
  × --only 与 --plugins-dir 不许同时给：夹具目录里的 id 与仓内包同名时，筛出来的到底是哪一批读不出来
$ node scripts/check-cli-commands.mjs --self-check --only logx        rc=2
  × --self-check 自带夹具目录，不接受 --only / --plugins-dir：正控的期望值是按夹具写死的
```

## 4. 承诺表逐条（清单原文 → 判决）

| 包 | manifest 里那条 `workflows.cli` 文案（逐字） | 抽出的命令 | 判决 | rc |
| --- | --- | --- | --- | --- |
| linedup | `"linedup filter"`（`plugins/linedup/package.json`，`xaihi.node.help.workflows.cli[0]`） | `xlinedup filter` | dispatched | 0 |
| logx | ``"Run \`xlogx query --level warn\` for scripts."`` | `xlogx query` | dispatched | 0 |
| logx | `"Interactive legs (\`guided\`, OpenTUI \`ui\`) are not wired in this build: the CLI exits 2 and names the missing seam."` | 无（散文里没提自己的 bin/nodeId） | no-command | — |
| logx | ``"Use \`xlogx doctor\` to validate all discovered files."`` | `xlogx doctor` | dispatched | 0 |
| recycleu | `"The guided mode is not wired in this build: the CLI exits 2 and names the missing seam."` | 未取（danger） | skipped-danger | 没跑 |
| recycleu | ``"Run \`xrecycleu --help\` for the node command's exact flags and subcommands."`` | 未取（danger；文案本身也只给了根 `--help`） | skipped-danger | 没跑 |

- **有未兑现承诺（`absent`）的包：0 个。**
- **`refused-help`（子命令存在但 `--help` 退码非 0）的包：0 个。**
- **`help-not-scoped`：0 个。`unmeasured`：0 个。**

绿是本分，真正的读数在下面这两条：

1. **26 个有终端面的包里，只有 3 个（11.5%）在清单里承诺过任何一条 CLI 命令**，
   23 个包一条都没写。`check-cli-face` 那 26 条 `--help` 全绿与这件事是两件事：
   面跑得起来，不代表使用者读得到"该怎么用它"。
2. **`absent`=0 是因为分母只有 6 条，不是因为接线普遍成立。**
   这 6 条落在两个非 danger 包（linedup、logx）+ 一个 danger 包（recycleu，一条都没跑）。
   剩下 23 个 danger 包（`danger.type` 是 `all` / `actionIn` / `pluginExport`）本尺**故意不碰**，
   它们的承诺是否兑现，现在没有任何东西在量。
3. 反方向也量了一次：被跑的那两个包的 CLI 自己有 7 条子命令没进承诺表
   （linedup 的 `guided`；logx 的 `ui gd guided sessions stats errors`）。只报数，不判红。

## 5. 量过程中被我自己纠正的一条（记下来，因为它差点变成假结论）

我在 04:57 用 `grep -rn "workflows" packages/*/src/*.ts` 读到过 `n?: readonly NodeHelpWorkflow[]`、
`value.n`、以及 smartzip 描述里的 `"TypeScript archive n with automatic 7-Zip discovery."`，
一度判断"另一条 lane 正在把 `workflows` 改名成 `n`、改了一半"。那是假的：
本仓 `grep` 是 `rg` 的别名（`type grep` → `grep is an alias for rg`），
而 rg 的 `-r` 是 `--replace`（不是 `--recursive`，那是 `-R`），所以 `-rn "workflows"` 的意思是
"把匹配到的文本替换成 `n` 再打印"。`stat` 也佐证那几个文件根本没在动（mtime 01:47 / 23:58）。
现读的正确结论：规范键就是 `help.workflows.*`，全仓零个 `n` 键
（`node -e` 读 `packageModules.generated.ts`：含 `"workflows"` = true，含 `"n":{` = false）。
⇒ 尺不靠 grep 读 manifest（走 `JSON.parse`）；本仓任何判据若用 shell 里的 `grep -r`，
先确认自己没在把匹配文本改掉。这与"探针要显式 argv、取 rc 别经管道"是同一家族的坑：
我第一次拿 `for a in "filter --help"; do node … $a; done` 探子命令帮助，
zsh 不分词 ⇒ 每个包都 rc=2 印 `Unknown command: filter --help.`，差点被我写成"26 条子命令全拒绝帮助"。
尺里用 `spawnSync(..., [binPath, command, '--help'])` 传数组，天然不吃这个坑，正控 `refuse` 夹具钉的是真退码。

## 6. 这把尺不证明什么

- **不证明命令产出正确输出**，也不证明 flag 被吃、`--json` 形状对、`danger` 判定与 dry-run 真生效。
  它只证"承诺的那条命令被认出来、并且自己的帮助屏打得来"。产出正确性是下一段腿。
- 不证明聚合 CLI（`xaihi <node> <sub>`）那条通路能加载包：`packages/cli/src/index.ts:200` 的
  动态 import 成功与否归 `check:cliface` / `check:nodebundle`。
- 不覆盖 danger 包（23 个），也不覆盖 `findz`（没有 bin，按 `gen-cli-registry` 的资格判据不是终端面）。
  要把 danger 包也纳入，只有两条诚实的路：给它一份"只印帮助"的沙箱调用协议，或给它一条离线插桩——
  都是新的契约，不在本轮顺手做。
- 文案解析是启发式的：命令对认两种写法（裸 `linedup filter`、反引号里的 `xlogx query --level warn`），
  认不出来的落 `no-command` 并报数。将来若要把它当红线，得先让各包的承诺文案统一成命令形状。

## 7. 接线（本轮**没做**，因为 `package.json` 在别人的未提交区里）

两行，模式与现有 `check:cliface`（`package.json:20`）一致：

```
"check:clicommands": "node scripts/check-cli-commands.mjs --self-check && node scripts/check-cli-commands.mjs",
```

然后把 `package.json:25` 的 `test` 链里 `pnpm check:cliface` 之后插一个 `&& pnpm check:clicommands`
（完整一行改成：`… && pnpm check:cliface && pnpm check:clicommands && pnpm check:tuiface && …`）。

现在不接的理由与 `check-cli-face`/`check-tui-face` 同款且更强：这条尺今天全绿，但它量的分母只有 6 条，
而它逼出来的真问题（23 个包零承诺、23 个 danger 包没被任何尺覆盖）**不是 rc=1 能表达的**。
接线时机应是有人开始往清单里写 `workflows.cli` 的那一刻——那才是这把尺有东西可拦的时候。

## 8. 后续可扩展的方向

1. **反向门禁**：`xaihi.node.actions[].id` 与 CLI 子命令表做双向差集（现在只做了"承诺 ⊆ 表"这一半），
   量"节点声明了 action、终端面却没那条子命令"的包有几个。
2. **danger 包的离线腿**：用 `node --experimental-loader` 或 `import('./lib/cli.js')` 拿
   `runProgram` 的命令表对象（`plugins/linedup/src/cli.ts:116-154` 的 `defineCommand({ subCommands })`
   就是那张表），做纯静态比对，起进程这一步都不需要——那能把 23 个 danger 包纳入同一判据。
3. **产出正确性**：拿 `.scratch/` 空目录当工作区，跑 `<cli> <sub> --json` 之类**明确声明只读**的命令，
   比对 schema——这是 §6 说的下一段腿，需要每条命令先被标成"只读"。
4. `check-cli-face` 与本尺共用 `judgeBin`/`runHelpOnly` 的调用纪律（超时、cwd、stdin）；
   两条尺将来合成一"档"时，别把 `--only` 与 `--plugins-dir` 的互斥规则丢掉。
