# G1–G13 复验（2026-10-07，实测于工作树 @ 03:12–03:30 本地时段）

判据来源：`docs/service-mapping.md` 的缺口台账（G1–G13）。本轮**不引台账自己的话当证据**，每条要么读到一个 file:line，要么跑出一条命令 + rc。
权威分层：DSH 侧的"有没有这条缝"只认 `node_modules/.pnpm/@deepseek-ai+dsh*0.2.0-rc.2*/node_modules/` 里装好的 `.d.ts` / README；本仓侧只认盘上代码与真跑的输出。
未跑的部分：不起真宿主（`pnpm host*` 一条都没跑），不跑全仓 `pnpm test`（别人在飞，结果不可归因）。所有 DSH 读数都来自装机产物与源码，**没有一条是实机宿主读数**。

## 总表

| # | 判据 | 一句证据 |
|---|---|---|
| G1 | **open** | bin 仍只出计划：实跑 `xlogx query --json` → `executed:false`；DSH 无进程外入口（`dsh-fs-local` 构造器要 `Context`） |
| G2 | **open**（引用证据错） | 缝确实够不到；但被点名的 `ui`/`gd` 拒答文案里**没有一句**提 settings，`TerminalPreferenceController` 只在 workspace 排除的包里 |
| G3 | **open**（归错类） | `NodeCall` 仍无 signal；但 DSH 每个工具体都收得到 `exec.signal`（`dsh-tools:127,241,305`）⇒ 这是我们没接线，不是 DSH 兑现不了 |
| G4 | **open**（范围比原文小） | `xaihi.node/v1` 无"未出货"表示法（`node.ts:156-159`）；真宣传未接腿的清单只有 **2 行 / 2 份** |
| G5 | **changed-shape** | crashu 仍没搬（引用成立），但 `dissolvef/src/platform.ts:37` **搬了**，`node:child_process` 直连，且零调用者 |
| G6 | **open** | `ctx.approval` 只在宿主（`dsh-user-approval:21`）；宿主半边实测钉在 `cleanf/tests/definition.spec.ts:365`（rc=0） |
| G7 | **open**（修法本身是错的） | 跑全 26 份 help：26 份都印 `/id`、只有 2 份真注册 ⇒ **25 份在骗人**（原文写 12）；且 `command` **早就是可选参数**，不传也印（`help.ts:108`） |
| G8 | **open** | `bindInputs` 从不读 `field.default`；`asBoolean` 把省略折成 `false`（`define-node.ts:144-145,155-161`）；布尔那侧没有 omit 变体 |
| G9 | **changed-shape**（验收仍红） | 消费侧与门禁都有了（`check:noderegistry` rc=0）；但重新构建 rc=0 后 `lib/client.js` 里判据串仍 **0 命中**，`WorkspaceRoot` 零 value  importer |
| G10 | **changed-shape**（机制已存在） | `trimOrOmit` 已实现并被 14 份清单采用；实跑 `transformValue(undefined)` ⇒ `trim`→`""`、`trimOrOmit`→`undefined`。剩下的只是 bitv/crashu 没换过去 |
| G11 | **obsolete**（前提是假的） | 上游那份**不是 `{zh,en}`**：`../Xiranite/packages/contract:146-152` 就是 `readonly string[]`，上游 bitv `help.ts` 里 `zh:` **0 命中** |
| G12 | **open**（其中一条判据错） | 实跑证实：位置参被拒、重复 flag 取后者；但"**没有短 flag**"不成立——`-h` 能用（`cli-support.ts:226`，实跑 `xlinedup -h` 出了帮助） |
| G13 | **open**（03:14 那节的"已修"是错的） | `conditions.ts:57` 仍无 actionId 回退、`define-node.ts:186` 有 ⇒ 两句不同；正控（塞回 `actionField` 必红）实跑 rc=0 |

门禁复跑（每条都是 `pnpm run <name>`，全部真执行）：

```
check:pins rc=0   check:installable rc=0   check:vendored rc=0   check:cliregistry rc=0
check:noderegistry rc=0   check:vocab rc=0   check:cliface rc=0（26 条 bin 每条 --help 都真起得来）
```

单包测试：`@hibernalglow/xaihi-sdk` **85 passed rc=0**、`@hibernalglow/xaihi-logx` **18 passed rc=0**、`xaihi-cleanf` **49 passed rc=0**、`@hibernalglow/xaihi-ui build` **rc=0**。

---

## G1 · 主机进程之外没有文件系统缝 — open

读到的（本仓）：`plugins/logx/src/cli.ts:51-53` 的 `REFUSAL_REASON` 点名 `ctx.fs` 与 `Config.logDir`；`:204` 写 `executed:false`、`:210/:227` 置 `process.exitCode = 2`。宿主半边：`plugins/logx/src/index.ts:27` `inject = ['tools','fs']`，`:113 apply()`、`:115 createFsLogxRuntime(ctx.fs, …)`，实现在 `plugins/logx/src/fs.ts:40`。

实跑（不是推演）：

```
$ node plugins/logx/lib/cli.js query --json        # rc 由测试档另测；这里取 stdout/stderr
{ …, "executed": false, "refused": "本包读日志目录一律走 DSH 的 `ctx.fs`（`src/fs.ts`）…" }
xlogx query 未接：…拿不到那条缝…
$ pnpm --filter @hibernalglow/xaihi-logx test:unit  → rc=0，18 passed（cli.spec.ts:76-116 钉 executed:false + 退出码 2 + stderr 含 ctx.fs）
```

绕不过去（查的是装机产物，不是包目录）：

- `@deepseek-ai/dsh-fs/lib/types/index.d.ts:61` 只导出 `abstract class FileSystem extends Service`；
- `@deepseek-ai/dsh-fs-local/lib/types/index.d.ts:38` `constructor(ctx: Context, config: Config)` —— 要一个 cordis `Context`，独立 bin 想用它就得自己长一棵树，正是台账末尾禁止的"在 bin 里私开一套"；
- `@deepseek-ai/dsh-sdk-protocol/lib/types/index.d.ts` 里 `filesystem|settings|approval|clipboard` **0 命中**（`rg -io` 空输出），且 store 里根本没有 `@deepseek-ai/dsh-sdk-client`。

**顺带纠正台账 03:14 那节**：它把 G1 判成 `obsolete`，理由是"`@xiranite/file-operations` / `services` 已整块删边"。量出来的不是这样：`packages/services` 目录确实没了，但 `@xiranite/file-operations` 在 `packages/` + `plugins/` 里还有 **11 份文件命中**，其中 `packages/api/src/client.ts:7,15` 是**真 value import**、`packages/api/package.json:23` 真声明 `workspace:*`。它现在不炸只是因为 `pnpm-workspace.yaml` 把 `!packages/api` 整包排除在树外。G1 这条按 G1 自己的判据（bin 拿不到 fs）仍然是 open。

## G2 · 主机进程之外没有设置缝 — open（被引用的证据不成立）

缝仍然够不到：`@deepseek-ai/dsh-settings/lib/types/index.d.ts` 全量导出只有 `redactSecrets` / `SettingsDescriptor` / `SettingsConflictError` / `SettingsPathOp` / `SettingsForms extends Service`（`:62`），没有进程外入口；那份远程面在 **宿主侧控制器**里——`@deepseek-ai/dsh-api-settings-controller/lib/types/index.d.ts:49,58,67,78,85` 的 `describe / update / replace / mutate / openSettingsDocument`，README 自述"exposes generated `ctx.remote.settings` … for **browser** configuration surfaces"。

bin 侧查询：`rg -n "fetch\(|localhost|127\.0\.0\.1|DSH_URL" plugins/*/src/cli.ts plugins/*/src/cli-support.ts` ⇒ **零命中**，没有任何一条 bin→宿主通路。G2 本体因此判 open。

**但台账给的那两条出处都不支撑 G2**（这处要改，不是改判据，是改证据）：

1. 实跑被点名的两条腿的拒答文案，里面**没有一处**提 settings/偏好：
   - `xrecycleu ui` → "…而清空回收站这一半本来就只活在宿主进程里（`ctx.subprocess` + DSH 的批准缝）"
   - `xlogx gd` → "…而本节点的执行本来就只活在宿主进程里（`ctx.fs`）"
   原文写"不是缺渲染器而是没地方读写偏好"，与实际文案正相反：文案第一句讲的**就是**缺渲染器。settings 这条真正被写进账的地方是别处（`plugins/bitv/src/cli.ts:38`、`bandia/src/cli.ts:22`、`enginev/src/cli.ts:18`、`marku/src/cli.ts:40`、`classf/src/cli.ts:36`、`dissolvef/src/cli.ts:17`），台账没点这些。
2. 原文点名的消费者 `TerminalPreferenceController` 只存在于 `packages/cli-runtime/src/tui/index.ts:41`，而 `pnpm-workspace.yaml` 把 `!packages/cli-runtime` 排除在树外 ⇒ 这个消费者今天不在任何构建图里。

`rg -n "ctx\.settings|settings" plugins/logx/src/cli.ts plugins/recycleu/src/cli.ts` ⇒ logx 1 命中（ADR 链接）、recycleu 1 命中（ADR 链接），**都不是**"读写偏好没地方去"那句。

## G3 · `NodeCall` 不往下传取消信号 — open，且被归错了类

本仓半边（读到的）：`packages/node-sdk/src/define-node.ts:50-54` `NodeCall` 三个键 `{args, inputs, run}`；`rg -c 'signal' packages/node-sdk/src/define-node.ts` ⇒ **无命中**（rc=1）；`:275` `execute: (args) => invoke(action.id, …)` 把 DSH 给的第二个形参整个丢掉。缺口符号还在：`rg -n CANCELLATION_GAP` ⇒ `plugins/recycleu/src/exec.ts:145`（**台账写的是 :141，已漂 4 行**）、`index.ts:84` 因此拒 `maxCycles=0`、`cli.ts:192` 把那句带上终端面。

DSH 半边（**这条是本轮最要紧的更正**）：取消信号是给的。装机读数：

- `@deepseek-ai/dsh-tools/lib/types/index.d.ts:127` `execute(args: unknown, exec: ToolRunContext): Promise<unknown>`，JSDoc 原文"Async work must observe or forward `exec.signal`"；
- `:241` `readonly signal: AbortSignal`（在 `ToolExecutionInput` 上）；`:305` `ToolRunContext extends ToolExecution`。

⇒ 这不是"DSH 这一侧现在兑现不了"，这是我们自己没接。它被放在"缺口台账"这个标题下，等于把一份自己的活推给了上游。第二个半边（耐久定时）同理：`@deepseek-ai/dsh-jobs/lib/types/index.d.ts:18` 就挂着 `jobs: JobRegistry`；`rg -n "inject = .*jobs|inject = .*schedule" plugins/*/src/index.ts` ⇒ **零命中**，没有包去 inject 它。

复验台账 03:14 那节的更正：它说"3 份文件声明过 `signal: AbortSignal`"。精确形如 `signal: AbortSignal` 的写法在 `plugins/*/src/*.ts` 里是 **0 命中**；3 份是 `signal?: AbortSignal`，且都在 `mvz/gifu/bitv` 的 `platform.ts` 里给 `resolveExecutable` 用的内部可选形参，跟调用路径无关。真数仍是 G3 本体的那句：**取消这条缝没接**。

## G4 · 清单里没有"这一面尚未出货"的表示法 — open（比原文窄得多）

结构半边仍在：`packages/node-sdk/src/node.ts:156-159` 的 `NodeHelp` 只有 `whenToUse?: LocalizedText` + `workflows?: Partial<Record<…, string[]>>`，`node.ts:44` `HELP_SURFACES = ['ui','cli','tips']`——值就是裸字符串，没有任何"未接"位。

宣传半边（逐条按 JSON 解析清单，不按文案猜）：`xaihi.node.help.workflows.*` 里出现 `ui|gd|guided` 的行 = **2 行 / 2 份文件**：

- `plugins/logx/package.json:532` `Run \`xlogx\` for guided mode or \`xlogx ui\` for OpenTUI.`
- `plugins/recycleu/package.json:313` `Run \`xrecycleu\` for the guided mode when the command supports interactive prompts.`

这两条正是原文点名的例子，成立。上游那份也确实是这么写的（`../Xiranite/packages/nodes/bitv/src/help.ts:14-15` 就是 `bitv ui` / `bitv gd` 的散文，逐字搬过来）。台账 03:14 那节报的"55 处 / 15 份"不是这个口径（那个把 `src/cli.ts` 里**主动拒绝**的文案一起数了，而那些恰恰是不撒谎的那一半）。

## G5 · 剪贴板读取 — changed-shape

引用点成立：`plugins/crashu/src/platform.ts:15-20` 明写上游那份 `readClipboardText()`"**没搬**"、缺口记 `G-clipboard-guided`；`crashu/src/index.ts:21`、`trename/src/index.ts:31`、`encodeb/src/platform.ts:32`、`marku/src/platform.ts:24` 同处置，`cleanf/src/cli.ts:265` 与 `mvz/src/cli.ts:338` 的拒答里还带着那句"`readClipboardText` 没搬"。

**但"该函数没搬"作为一句全仓断言不成立**：`plugins/dissolvef/src/platform.ts:37` 就导出了 `readClipboardText()`，走的是最被反对的那条路——`:1 import { execFile } from "node:child_process"`、`:69-73 runCommand()` 里 `execFile(command, args, …)`，候选是 `powershell.exe Get-Clipboard` / `pbpaste` / `wl-paste` / `xclip` / `xsel`（`:52,56`）。归属查过：`git show HEAD:plugins/dissolvef/src/platform.ts` 有它，`git status --short` 对该文件干净，`git log` 落在 `d01d135 批次 C：dissolvef 内核从 noxide 基线逐字移植`——**已落地的代码**，不是别人在飞的草稿。

调用者：`rg -n "readClipboardText" plugins/*/src/*.ts packages/*/src/*.ts` 滤掉注释后只剩 **dissolvef 的定义 + 两条说它没搬的拒答文案** ⇒ 这份实现**零调用者**，是一件死件。

上游前提核过（是真的）：`../Xiranite/packages/nodes/crashu/src/cli.ts:34` 引入、`:551-552` `resolveGuidedPaths()` 是唯一消费者，确属 guided 腿。台账写的上游位置 `platform.ts:23-62` 不准——函数在上游 `:56`，23-30 那段是讲 `movePath` 的散文。

⇒ 今天的形状不是"没搬"，是"**搬了一份、没人调、还和其余 6 份的口径互相打脸**"。要动的决定是这份死件留不留，不是要不要搬。

## G6 · 危险动作的批准只在宿主侧有缝 — open

宿主半边**实机之外最强的一档**：`@deepseek-ai/dsh-user-approval/lib/types/index.d.ts:21` 挂着 `approval: ApprovalService`（`:13 'user-approval'`、`:34 'approval/policy'`）。`defineNode` 那侧的 `ask` 判定不是"编译过就算"——`plugins/cleanf/tests/definition.spec.ts:347` 那条跑起来了：`:365 const asked = await listener({ name:'cleanf_clean', arguments:{ preview:false } }, next)` → `:366 expect(asked.kind).toBe('ask')`，`:314` 还钉着"模型省略 `preview` 时这条 ask 必须亮"的阳性对照。整包 `pnpm --filter @hibernalglow/xaihi-cleanf test:unit` ⇒ **rc=0，49 passed**。（仍要标：**in-process 验证，没起真宿主**，`ask` 之后由 DSH ApprovalService 弹批准这一步没有读数。）

bin 半边：`rg -n "approval" node_modules/.pnpm/@deepseek-ai+dsh-sdk-protocol@0.2.0-rc.2*/…/lib/types/index.d.ts` ⇒ **0 命中**；进程外没有任何批准入口（与 G1/G2 同一条边界，见上面的 `Context` 构造闸）。口径也守着：`rg -n '\-\-force' plugins/*/src/cli.ts` 的 6 处命中**全是"因此不做 `--force`"的说明**（`bandia:20`、`gifu:35`、`smartzip:42`、`classf:36,141`、`mvz:38`），没有一条真给了 `--force`。

台账末尾写"要么给 DSH 提提案，要么接受 bin = 计划器"。**提案没提**：`docs/upstream-proposals.md` 的标题只有 P1–P7（`rg -n "^## P"` 七行），P1–P7 里没有一条讲"非主机进程的 fs / settings / approval 入口"。G1/G2/G6 三条共同的这条出路目前是个空位。

## G7 · 帮助页与真注册的斜杠命令两头对不上 — open，且原文的修法是错的

原文的数（13 传 / 2 注册 / findz 不在 13 里）**逐条复读成立**：`rg -n "command:" --glob 'plugins/*/src/help.ts'` 滤掉注释 = 13 份真传（dissolvef/linedup/samea/nameu/logx/rawfilter/classq/timeu/sleept/recycleu/linku/crashu/formatv）；`inject` 带 `commands` 的 = 恰好 `plugins/findz/src/index.ts:45` 与 `plugins/sleept/src/index.ts:36` 两份；26 份 `src/help.ts` 而 27 个插件，缺的那份正是 findz（`findz/package.json` 的 `exports` 里也没有 `./help`）。

**后果那一栏是错的，而且错得实质。** 我把 26 份编译好的 help 模块全跑了一遍，读它们**实际印出**的 `commands[].command`：

```
bandia /bandia   bitv /bitv   classf /classf   classq /classq   cleanf /cleanf   crashu /crashu …
（26 份，每份都印一条 `/xxx`；其中 25 份宿主里没有对应注册，只有 sleept 那份是真的）
```

⇒ 印假命令的包是 **25**，不是 12。原因在推导器：`packages/node-sdk/src/help.ts:71` 的 `command?: string` **本来就是可选参数**（原文"修法：`command` 改成可选参数"要改的东西已经存在），而 `:108` `const hostCommand = options.command ?? \`/${nodeId}\`` 在缺席时照样兜出 `/id`。实跑证这一点——`classf` 就是按原文的修法写的（`plugins/classf/src/help.ts:36` 只传 `{ bin: 'xclassf' }`）：

```
$ node -e "import('./plugins/classf/lib/help.js').then(m=>console.log(m.help.commands.map(c=>c.command)))"
[ 'xclassf', '/classf' ]        # 没传 command，/classf 照样上屏
```

已经**照着这条错修法改过、并且自己在注释里承认没修好**的包有 5 个：`classf`、`trename`、`enginev`、`bandia`（各自 help.ts 头部都写着"这条偏离只堵住包自己声明那一半……要改推导器本身"）、`bitv`。它们不是没改，是改了不生效。

那把尺也没落地：`ls scripts/` 的 29 个脚本里没有任何 help↔commands 一致性检查；`rg -n "help\.ts|slash|commands" scripts/*.mjs` 只命中 `port-deps.mjs:47` 的一句无关注释；`check:cliface` 量的是"26 条 bin 的 `--help` 起不起得来"（本轮 rc=0），与斜杠命令无关。

⇒ 真正的修法只有一刀：**`help.ts:108` 不许兜底**（没给 `command` 就不产出 "Host command" 那一条），尺跟着这条判据走。原文那句"改成可选参数"会把人引向已经试过并且失败的那条路。

## G8 · 模型省略布尔时，声明式默认不生效 — open

折叠点原样在：`define-node.ts:144-145` `case 'asBoolean': return value === true || …` ⇒ 省略即 `false`；`:155-161 bindInputs` 只读 `args[binding.fieldId]`，**从不查 `field.default`**；`node.ts:33 TRANSFORMS = [identity, trim, lines, delimited, trimOrOmit, asInteger, asBoolean]`——字符串那侧有 `trimOrOmit`（见 G10），**布尔这侧没有对应变体**，所以想"省略 ⇒ 别折"现在没有工具可用。

分叉照旧，两份测试照旧钉着：`plugins/rawfilter/tests/core.spec.ts:154-160`（内核默认 `dryRun=false`，`:158` 明写"阳性对照：定义里 `dryRun` 的默认是 true，内核这里必须是 false"）与 `plugins/cleanf/tests/definition.spec.ts:179`（清单侧 `default: {boolean:true}`）。两包测试都跑过，rc=0。

一处**要加进账的加重**：rawfilter 为这一格写的兜底在工具路径上是死代码。`dryRun` 的绑定是 `asBoolean`（清单里 `{"fieldId":"dryRun","slot":"dryRun","transform":"asBoolean"}`），于是 `:103 typeof inputs.dryRun === 'boolean' ? inputs.dryRun : config.dryRun.get()` 的 else 永不成立——`Config.dryRun`（`:70 Schema.boolean().default(true).volatile()`）在这条腿上读不到。原文说"症状是分叉"，实际症状是**修分叉的那行没生效**，这一点比原文更严重也更具体。

另外"只有表单侧会填"这半句我这轮**没能证实**：`packages/node-sdk/src/node.ts:253-254` 只做形状校验；`ui-host` 里 `field.defaultValue` 唯一的读点是 `NodeHelpSheet.tsx:453-455`，那是**显示**不是填表单；带 `defaultValue?: string` 的类型在 `packages/contract/src/index.ts:159`，而 `packages/contract` 同样被 `!packages/contract` 排除在树外。⇒ 今天没有任何**在建图里**的消费者会把清单默认值填进表单。这条要么找出具来复核，要么把"表单侧会填"从依据里删掉。

## G9 · 一方节点界面 — changed-shape：源侧闭合，产物侧仍红

已经有的两半（都跑过）：

- 消费者**有了**：12 份 `packages/ui-host/src/nodes/*/entry.ts` 都 value-import 生成物（`nodes/sleept/entry.ts:13` 等），`client/node-mount.tsx:29` 更直接 `import { PACKAGE_MODULES, packageModuleLoaders }`，`:42/:58` 用起来。这否掉了 ADR-0014:16 那句"零消费者"的现读前提。
- 门禁**接上了**：根 `package.json:19 "check:noderegistry": "node scripts/gen-node-registry.mjs --check"`，并已排进 `test`（`:24` 那串里在 `check:cliregistry` 之后）。实跑 rc=0：`gen-node-registry: 12 个界面目录 → 12 条注册`。

**但 ADR-0014 自己定的验收还是红的**（判据原文在 `docs/adr/0014-first-party-node-ui-in-realm.md:60-62`："判据不是构建 rc=0，而是字面命中……`上次任务失败` 的 grep 必须从 0 变成非 0"）。我先重新构建了再量：

```
$ pnpm --filter @hibernalglow/xaihi-ui build      → rc=0（check-client-bundle OK：单文件、无 Node require、无分片）
  lib/client.js 1,433,889 B @ 03:21
$ rg -c "上次任务失败" packages/ui-host/lib/client.js        → 0（该串在 src 里有：i18n/zh.json 13 处 + 4 份 nodes/*/Component.tsx）
$ rg -c "src/nodes/" packages/ui-host/lib/client.js          → 0
$ rg -c "packageModules" packages/ui-host/lib/client.js      → 0
```

读到的因（不是猜的）：浏览器半边的入口是 `tsdown.config.ts:66 entry: { client: 'src/client/index.ts' }`；`src/client/index.ts` 的 18 条 import 里**没有** workspace/node-mount；`client/surface.tsx:20` 对 workspace 只写 `import type { RootProps }`，`:18` value-import 的是 `document-frame.tsx`；而 `WorkspaceRoot`（`workspace.tsx:68`）在 `packages/ui-host/src` 里的 value importer **数量是 0**（`rg -n WorkspaceRoot packages/ui-host/src` 只命中它自己那一行定义），唯一真的用它的是 `tests/node-mount.spec.tsx:23`。

⇒ 一句话的形状：**从"没有消费者"变成了"消费者写在盘上、但不在这棵构建树里"**。症状与台账原文一样（编译过、登记上、屏上没有），只是病名要改：要动的是 `client/index.ts` 那一条边，不是"给注册表找消费者"。

取证时要带的告诫：`packages/ui-host/src/client/node-mount.tsx` 的 `git status` 是 `?? `（未跟踪），`surface.tsx` 同屏出现 `D ` 与 `??`，`workspace.tsx` 是 `MM`——G9 这一块本轮正被别人重写在写。以上读数都是 03:12–03:30 那一份盘上的样子，不是落地状态。

## G10 · `inputBindings` 的 `trim` 把"省略"折成空串 — changed-shape（机制已经有了）

根修**已经存在并且可用**：`node.ts:33` 把 `trimOrOmit` 列进 `TRANSFORMS`，`define-node.ts:132-135` 实现为"`trimmed === '' ? undefined : trimmed`"。实跑（`import('./packages/node-sdk/src/define-node.ts')` 直接喂 `transformValue`）：

```
trim       undefined => ""          trimOrOmit  undefined => undefined
trim       empty     => ""          trimOrOmit  empty     => undefined
trim       blank     => ""          trimOrOmit  blank     => undefined
```

采用面：`rg -l trimOrOmit --glob 'plugins/*/package.json'` ⇒ **14 份清单**在用它（dissolvef/enginev/smartzip/classf/findz/cleanf/formatv/bandia/trename/…）。

⇒ 按这条仓库自己的判据（"缺口只有在没有绕开它的机制时才叫缺口"），G10 原来那句"判不出用户没填与填了空"**已经不成立**。剩的是**没换过去的边角**，两处都在原文点名的包里：

- `bitv`：`transferMode` 仍绑 `trim`（清单实证，并被 `plugins/bitv/tests/definition.spec.ts:241 ['transferMode','transferMode','trim']` 钉成期望值），靠本地白名单 `transferModeOf()` 兜（`src/index.ts:144-149`，`:146` 认值、`:147` 回落 `Config`），并由具名测试钉住后果——`tests/definition.spec.ts:428` "Config 与模型都没给 transferMode ⇒ 走内核默认的 copy，而不是 move 那条 link+unlink"，`:441` 原话"清单的绑定是 `trim`，'没给'到内核手里就是空串；`transferModeOf` 的白名单把它当'没给'"。`tests/core.spec.ts:191-210` 那份则是把病本身钉在盘上（"`""` 不是 nullish ⇒ 走 **move** 那条 link+unlink"）。
- `crashu`：`moveDirection` / `conflictPolicy` 同样 `trim`，兜法换成 `|| config.X.get()`（`src/index.ts:124-127`），`:63` 明写"空串 = 不覆盖"。

⇒ 判 changed-shape：缺口没了，纪律还在。台账那条该从"缺口"挪成"边角清单：`bitv/crashu` 的枚举型绑定没从 `trim` 换到 `trimOrOmit`"。

## G11 · `help.workflows` / `help.commands` 装不下上游那份 `{zh,en}` — obsolete（前提是编的）

上游那份**不是 `{zh,en}`**。逐条读到（`../Xiranite` 就是搬运源仓，本轮可达）：

- `../Xiranite/packages/contract/src/index.ts:139-144 NodeHelpCommand { title: string; command?: string; description?: string; examples }`
- 同文件 `:146-152 NodeHelpWorkflow { title: string; summary?: string; ui?: readonly string[]; cli?: readonly string[]; tips?: readonly string[] }`
- 同文件 `:179-180 / :198-199` 处 `workflows?: readonly NodeHelpWorkflow[]`、`commands?: readonly NodeHelpCommand[]`
- 被点名的样例文件 `../Xiranite/packages/nodes/bitv/src/help.ts`：`rg -c "zh:"` ⇒ **0 命中**，`:11-30` 的 workflows 就是带 title 的对象 + 裸英文串数组。

本仓那侧反倒是**逐字段对齐**的：`packages/node-sdk/src/help.ts:33-38 TerminalHelpCommand`、`:41-47 TerminalHelpWorkflow`（`ui/cli/tips: readonly string[]`）与上游同形。引用也对不上——原文写"`HelpWorkflow.commands: string[]`（`packages/node-sdk/src/help.ts:32`）"，而 `help.ts:32` 是一行注释、`TerminalHelpWorkflow` 上也没有 `commands` 这个键。

**真正还在的缺口是另一件**（形状不同，值得单独记）：清单侧 `packages/node-sdk/src/node.ts:158` 是 `workflows?: Partial<Record<'ui'|'cli'|'tips', string[]>>`——一张"使用面 → 裸串列表"的扁表，**丢掉了上游按 workflow 分组的 `title` / `summary`**；而这套分组终端侧已经建模（`help.ts:41-47`）。也就是说：上游那份表达得动，本仓的清单表达不动，本仓的终端载荷又表达得动——缺口在清单与推导器之间，不在双语上。

⇒ 判 obsolete：这一条要从台账里删，替成上面那句。留着"双语"这个说法会让下一个人去给 `workflows` 加 `{zh,en}`，而那正是上游没有的形状。

## G12 · vendored `cli-support.ts` 的 flag 语法窄于上游 — open（其中一条判据是假的）

一致性守得住：`ls plugins/*/src/cli-support.ts | wc -l` = **26**；`node scripts/check-vendored.mjs` ⇒ **rc=0**，"26 份一致（bandia … trename）"。

三条判据逐条实测（用真 bin，不是读码）：

- 没有位置参数——**成立**。`node plugins/bitv/lib/cli.js a.mp4 b.mp4` → `Unknown command: a.mp4.`；`node plugins/logx/lib/cli.js somefile.log` → `Unknown command: somefile.log.`；码在 `cli-support.ts:230-232`（非 `--` 前缀 ⇒ `throw new CliUsageError(\`Unknown argument: ${token}.\`)`）。
- 重复 flag 取后者——**成立**。`node plugins/logx/lib/cli.js query --limit 5 --limit 9 --json` 的计划里 `limit: 9`（对照组单给 `--limit 5` 得 `5`）；码在 `:264 args[key] = value`，没有累加成数组。
- 没有短 flag——**不成立**。`:226` 明写 `if (token === '-h' || token === '--help')`，`xlinedup -h` 实跑打出完整帮助页（`:297` 的帮助行本身也印 `--help, -h`）。准确的说法是"**只有一个短 flag：`-h`，它是 `--help` 的别名；除此之外没有短 flag**"。台账写"没有短 flag"，会把 `-h` 这条已被接受的上游拼法误报成不支持。

顺带核一下 03:14 那节补的那句"`--help=true` 会被当成真值"：半对。布尔型 flag 的 `=值` 是**校验过的**（`:251-259`，只收 `true|false`，其余 `throw`），所以 `--json=false` 不会被折成真。那个"当成真值"只发生在**未声明的 `help` 键**那一条支路（`:244-248 if (key === 'help') { help = true; continue }`，不看 `inlineValue`）——后果是更具体也更糟的一句：`--help=false` 一样出帮助。这条值得单独写进账，别停在"`=值` 处理不对"。

## G13 · `danger` 谓词里的 `actionIs` 在否定式上反噬 — open（03:14 那节的"已修"是错的）

不对称原样在，两句不同文件、不同写法：

- `packages/node-sdk/src/conditions.ts:56-58`（`actionIs`）：`const actual = test.actionField === undefined ? actionId : asText(args[test.actionField])` —— 给了 `actionField` 就**只**读参数表，无回退；`asText`（`:30-34`）把 `undefined` 折成 `''`。
- `packages/node-sdk/src/define-node.ts:186`（`actionIn`）：`String(danger.actionField === undefined ? actionId : args[danger.actionField] ?? args[selector?.id ?? ''] ?? actionId)` —— **有**两级回退。

而参数表里确实没有那个选择器：`define-node.ts:117 if (field.isActionSelector === true) continue`。⇒ `negated: true` 那条恒真，台账说的病还在。

03:14 那节写"**G13 那条修过的仍然成立**：`define-node.ts:186` 现在读 `danger.actionField`，`actionIn` 与 `actionIs` 走同一句取值"。这半句不成立：`:186` 是 `actionIn` 分支里的一句，`actionIs` 在另一个文件的 `:57`，且没有那两级 `??`。**把"某一侧读对了"读成"两侧同句"，正好抹掉了这条缺口本来的内容。**

现存处置是包级绕法，不是根修：`plugins/cleanf/package.json` 的 `danger.predicates[0].test` 是 `{ type:"actionIs", allowed:["undo"] }`——**不带** `actionField`（清单纯净、求值走 `actionId`），钉在 `plugins/cleanf/tests/definition.spec.ts:211`。阳性对照也在同一条测试里且**跑过**：`:224` 上游那份（带 `actionField`）判 `undo` 必须过拦、`:228-229` 我们自己那份 `undo` 放行 / `clean` 拦下、`:230-235` 把 `actionField` 塞回我们自己的清单 ⇒ `expect(dangerFor(reDef.value, undefined, 'undo', { preview:false })).toBeDefined()`。`pnpm --filter @hibernalglow/xaihi-cleanf test:unit` ⇒ **rc=0，49 passed**。`:215-218` 那句注释已经把病说清了（"`conditions.ts:57` 见 `actionField` … ⇒ `''` ∉ `['undo']` ⇒ 那条 negated 谓词恒真"）。

第二个子判据也仍然成立：`fields[].rules[].when` **从不求值**。`rg -n "matchCondition|matchTest|matchPredicate"` 的全部调用点是 `define-node.ts:118`（字段可见性）、`:192`、`:194`（危险闸门）；`rules[].when` 只在 `node.ts:272-274` 做形状校验，在 `define-node.ts:85-86` 只被用来**免除 required**（`entry.when === undefined && …`）。界面侧一旦开始求值就是同一条病——这句现在依然有效。

---

## 哪些还值得花工程时间，按实测依赖排序

只列能量出"这一步做完下一步才动得了"的顺序；不在表里的都不建议现在投。

1. **G7 —— 改 `packages/node-sdk/src/help.ts:108`，让 `command` 缺席时不产出 "Host command" 那一条，并配一把尺。** 一刀（一行 + 一条判据）解掉 25 份假命令。排在最前有两个实测理由：(a) 已经有 **5 个包**（classf/trename/enginev/bandia/bitv）按错修法改过、并且各自写下"这条偏离只堵住一半"，等于五个包在等同一个不存在的开关；(b) 这条尺是本轮唯一查过"没落地"的修法（`scripts/` 29 个脚本零命中），所以补它不需要先改谁。
2. **G3 —— 把 `exec.signal` 接进 `NodeCall`（`define-node.ts:50-54` 加字段、`:275 execute` 收下 `exec` 并递下去）。** 上游证据已经推翻"这是 DSH 的缺口"（`dsh-tools:127,241,305` 三条都在装机产物里）。它直接解锁两处已被代码显式拒绝的东西：`plugins/recycleu/src/index.ts:84` 的 `maxCycles=0` 与 `exec.ts:145` 那句 `CANCELLATION_GAP` 的前半。不改依赖：仓内闭环。
3. **G8 —— 在 `define-node.ts` 的折叠处补"省略 ⇒ 用清单默认"（或给布尔加一个 omit 变体）。** 依赖顺序在 G3 之后是实测出来的：G10 已经证明字符串那侧的同类修法（`trimOrOmit`）**能落地并被 14 份清单采用**，所以这一刀的通路形状是现成的；而它一旦落地，`plugins/rawfilter/src/index.ts:103` 那条现在是死代码的兜底才第一次真的读得到 `Config.dryRun`——G8 与 G10 的残余是同一个折叠点的两半，一起做比拆开便宜。
4. **G9 —— 把 `WorkspaceRoot` 接进 `client/index.ts` 的 value 图（或明确判它不进产物）。** 这一刀的验收**不用新写**：`ADR-0014:60-62` 已经把它定成一条 grep（`rg -c "上次任务失败" lib/client.js` 从 0 变非 0），门禁 `check:noderegistry` 也已经 rc=0。它排在 G7/G3/G8 之后只因为别的都不阻塞它、而它自己现在正被别人重写（`node-mount.tsx` 未跟踪、`surface.tsx` 状态自相）——这条要先跟使用者确认归属，不然会撞车。
5. **G13 —— 给 `conditions.ts:57` 补上 `define-node.ts:186` 已有的那两级回退。** 一句改动，而且**正控已经在盘上等着翻绿**（`cleanf/tests/definition.spec.ts:230-235` 现在期望"塞回 `actionField` 必须过拦"，根修后这条期望要跟着换）。方向提醒保留：这条是"多问一次"，不是危险，所以它排在这儿是因为便宜，不是因为急。顺手一起判 `rules[].when` 要不要求值——它现在从不求值，界面侧一动就同一条病。
6. **G1 / G2 / G6 —— 先补那份不存在的提案，再谈代码。** 三条是同一条边界（`docs/service-mapping.md` 末尾"共同形状"那句），本轮实测支持它：`dsh-fs-local:38` 要 `Context`、`dsh-settings` 只导出 `Service`、远程设置面在宿主控制器里、`dsh-sdk-protocol` 对 `filesystem|settings|approval|clipboard` **0 命中**——没有一条支持"绕过去"。工程动作是**写 `docs/upstream-proposals.md` 的 P8**（`rg -n "^## P"` 现在只到 P7），不是继续给每个 bin 写拒答文案：`check:cliface` 已 rc=0 证明 26 条 bin 面本身是好的，缺的那只手在 DSH 一侧。G2 还多一件便宜事：把它那两条不成立的出处换成真的那批（`bitv:38 / bandia:22 / enginev:18 / marku:40 / classf:36 / dissolvef:17`），并说清 `TerminalPreferenceController` 在 `!packages/cli-runtime` 里、今天不在构建图。
7. **只剩记账、不该再投人力的**：
   - **G12** —— 有意取舍，`check:vendored` rc=0 守着 26 份一致。要动的只有两句文案：把"没有短 flag"改成"只有 `-h` 这一个短 flag"；把"`--help=true` 当成真值"收窄成"未声明的 `help` 键不看 `=值`（`:244-248`）⇒ 连 `--help=false` 也出帮助"。
   - **G4** —— 真宣传未接腿的只有 **2 行 / 2 份清单**（`logx:532`、`recycleu:313`）。这两行要么随搬运批次改成"未接"的散文，要么等 G7 那把尺一起处理；单独为它设计一个"未出货"表示法，是给 2 行做 schema。
   - **G5** —— 要拍的是一个决定不是写一段代码：`dissolvef/src/platform.ts:37` 那份零调用者的 `readClipboardText()`（已提交于 `d01d135`，走裸 `execFile`）留还是删。留着它，`cleanf/src/cli.ts:265` 与 `mvz/src/cli.ts:338` 那句"`readClipboardText` 没搬"就是假话；删掉它，G5 回到原文形状。顺带把上游引用从 `platform.ts:23-62` 改成 `:56`（函数真在那儿，23-30 讲的是 `movePath`）。
   - **G11** —— **删掉**。前提（上游是 `{zh,en}`）已实测为假：上游 `contract:146-152` 就是 `readonly string[]`，上游 bitv `help.ts` 里 `zh:` 零命中。要留就留一句"清单侧 `workflows` 是扁表，丢了上游按 workflow 分组的 `title`/`summary`"（`node.ts:158` vs `../Xiranite/…/contract:146-152` vs 本仓 `help.ts:41-47`），那才是还没修的。

## 台账里读出来是**错的**（不只是过时）的行

按"我照着写就会写进一条假事实"的严重程度排：

| 行 | 台账的说法 | 实测 |
|---|---|---|
| **G11 全条** | 上游那份 `workflows`/`commands` 是 `{zh,en}` 数组，本仓的 `string[]` 装不下 | 上游 `../Xiranite/packages/contract/src/index.ts:146-152` 就是 `ui/cli/tips: readonly string[]`；`rg -c "zh:" ../Xiranite/packages/nodes/bitv/src/help.ts` ⇒ **0**；本仓 `help.ts:41-47` 与上游逐字段同形。这条从头到尾没有对应物 |
| **G7 的修法** | "`command` 改成可选参数、只在包真注册时传" | `command` **早就是**可选参数（`help.ts:71`），不传也照样印 `/${nodeId}`（`help.ts:108`）。5 个包已按这句话改过并各自承认没修好 |
| **G7 的后果数** | "12 个包印了一条宿主里不存在的 `/id`" | **25 个**。跑全 26 份编译产物 help，每份都印一条 `/xxx`；只有 `sleept` 那份是真的（`findz` 注册了却没有 `src/help.ts`） |
| **G3 的归类** | 挂在"DSH 这一侧现在兑现不了"的标题下 | DSH 每个工具体都收得到 `exec.signal`（`dsh-tools/lib/types/index.d.ts:127,241,305`）。这是我们没把第二个形参递下去（`define-node.ts:275`）；`ctx.jobs` 也在（`dsh-jobs:18`），只是没包 inject |
| **G12 的一条判据** | "没有短 flag" | `-h` 支持（`cli-support.ts:226`），`xlinedup -h` 实跑 rc=0 出帮助；帮助行自己也印 `--help, -h`（`:297`） |
| **G5 的一般化** | "该函数**没搬**"（原文只引 crashu 的注释，句子却是全仓的） | `plugins/dissolvef/src/platform.ts:37` 搬了，裸 `node:child_process`（`:1`、`:69-73`），已提交（`d01d135`），零调用者 |
| **G2 的证据** | 出处 = "`plugins/{logx,recycleu}/src/cli.ts` 的拒答文案"，用来支撑"没地方读写偏好" | 实跑那两条文案，一句 settings 都没提——它们讲的是缺渲染器 + `ctx.fs` / `ctx.subprocess` / 批准缝 |
| **03:14 那节的 G13** | "`actionIn` 与 `actionIs` **走同一句取值**" | 不同文件不同句：`conditions.ts:57` 无回退，`define-node.ts:186` 有 `?? args[selector.id] ?? actionId`。这句把这条缺口唯一的内容（不对称）抹掉了 |
| **03:14 那节的 G1** | "`@xiranite/file-operations` / `services` 已整块删边 ⇒ obsolete" | 11 份文件仍在提它，含真 value import `packages/api/src/client.ts:7,15` + `package.json:23`；只是被 `pnpm-workspace.yaml` 的 `!packages/api` 挡在树外，不是删了 |
| **03:14 那节的 G3 读数** | "3 份文件声明过 `signal: AbortSignal`" | 精确写法 0 命中；那 3 份是 `signal?: AbortSignal`，且在 `mvz/gifu/bitv` 的 `resolveExecutable` 上，与调用路径无关 |
| **G9 的前提（ADR-0014:16）** | "`rg 'PACKAGE_MODULES\|packageModuleLoaders\|NODE_MANIFESTS' packages/ui-host/src/client` ⇒ 零消费者" | 现在有命中：`client/node-mount.tsx:29,42,58,364`。消费侧已闭合；**没闭合的是产物**——重建 rc=0 后 `lib/client.js` 判据串仍 0 命中、`src/nodes/` 分区 0 命中、`WorkspaceRoot` 在 `src` 里零 value importer |

另有两处 `file:line` 漂移（事实对、坐标过期）：`recycleu/src/exec.ts` 的 `CANCELLATION_GAP` 现在在 **:145**（台账写 :141）；G6 让 `crashu`/`formatv` 引的 `docs/service-mapping.md:42-44` 现在落在 ADR-0013 那一段上。

## 本轮没跑的部分（按 AGENTS.md 的要求写出来）

- **没起真宿主**：`ask` 之后由 `ApprovalService` 弹批准、`ctx.fs` 装配后的真实行为、`ctx.remote.settings` 的往返延迟——都只有装机产物的类型读数与 in-process 测试，没有宿主读数。G1/G2/G6 三条里"宿主那半边能用"这一节是 **compile-verified / in-process-verified only**。
- **没跑全仓 `pnpm test`**（别人在飞，不可归因）。只跑了 `xaihi-sdk`（85 passed）、`xaihi-logx`（18）、`xaihi-cleanf`（49）、`xaihi-ui build`、7 把 `check:*` 尺与 `check:cliface`，全部 rc=0。
- **G9 那三处文件本轮正被别的 lane 重写**（`node-mount.tsx` 未跟踪、`surface.tsx` 状态自相、`workspace.tsx` MM）：它的读数只代表 03:12–03:30 那一份盘。
- **`packages/api` / `cli` / `cli-runtime` / `contract` / `logging` / `shared` 全在 workspace 之外**，所以任何落在这些包里的判断（G2 的 `TerminalPreferenceController`、G8 的 `defaultValue` 显示）都只是"读到的声明"，从未被构建或执行过。

## 追加（2026-10-07 晚）：`help.workflows` 整块没搬，27 个包里 24 个是空的

新尺 `scripts/check-cli-commands.mjs`（子代理跑、我复核）报"有终端面但清单一条 CLI 承诺都没写"的包有 23 个。
那不是遗漏几行，是**整块没搬**：现读两侧数字——

```
本仓包数: 27   上游 help.workflows 块合计: 54   本仓: 0（undefined 24 个 / 另外 3 个用的是我们自己的扁平形状）
```

两边形状本来就不同，这条要先说清楚再动手：

- **上游**（`<Xiranite>/node-definitions/<id>.json`）：`help.workflows` 是**数组**，
  每块 `{title:{zh,en}, summary:{zh,en}, ui:[…], cli:{zh:[…],en:[…]}}`。
- **本仓契约**（`packages/node-sdk/src/node.ts:158`）：
  `workflows?: Partial<Record<(typeof HELP_SURFACES)[number], string[]>>`——按使用面分组的扁平字符串数组。
  已在用的三份是 `linedup`、`logx`（`ui`/`cli`/`tips`）与 `recycleu`（`ui`/`cli`），形状与契约一致。

⇒ 这是**搬运缺口**，不是"上游本来就没有"：54 个块（其中带 `cli` 的 26 个）里，
本仓一个字都没接。面板上的"怎么用"和终端面的用例表都从这张表读，所以它同时是 WebUI 腿与 CLI 腿的缺口。

一条附带事实（我自己复核过，别在下一轮又被当成"子命令不存在也没关系"）：
`node plugins/bandia/lib/cli.js totally-bogus --help` **rc=0**，打的是父级屏
（`xbandia — Bandizip batch archive workflow…`）。所以只看退出码会把臆造的命令洗白；
`check-cli-commands.mjs` 的判据因此是"必须出现在子命令表里 + `--help` 打的是它自己那一屏"。

处置：已派代理把 54 个块按我们的契约逐包落进 `package.json#xaihi.node.help.workflows`
（排除 `findz`——那条 lane 在改；`kisaki` 尚不存在），每条 CLI 行都改写成本包 `bin` 的真实子命令，
验收是 `check-cli-commands` 里 `absent` 必须为 0、`check:brand` 必须 rc=0（上游原文里满是旧名字）、
以及生成物 `packageModules.generated.ts` 与清单同批（`gen-node-registry --check` rc=0）。

## 又追加：终端面第二段腿——参数这一层原来没人量（新尺 `scripts/check-cli-parity.mjs`）

`check-cli-face` 量"产物在、`--help` 退 0、屏里认得出自己的 bin"，`check-cli-commands` 量"清单承诺的子命令打得来"。
**两条都不碰参数**——所以"面板能设、终端设不了"这一类分叉以前看不见。新尺量三件事，判据全部现读：
上游 `noxide/packages/nodes/<id>/src/cli.ts` 里写过的长开关 vs 我们**每一屏**打出来的开关、
同参数跑两遍必须一模一样、`--json` 那条路必须解析得出结构。
挑"哪条动作可以真跑"用的是**契约自己那个** `dangerFor`（`packages/node-sdk/src/define-node.ts:179`，
从建好的 barrel 里 import）——与宿主给工具上 `ask` 闸门的是同一个判定，不会出现两把尺各说一套。

```
$ node scripts/check-cli-parity.mjs --self-check
check-cli-parity --self-check OK（18 条夹具，含"上游开关缺失""两次输出不同""--json 解析失败"三条必须红）
SELF_RC=0
$ node scripts/check-cli-parity.mjs
check-cli-parity: 27 个包，比了 26 张开关表，真跑了 7 条命令；跳过 17 个（形状/基线没有/没跑通）、3 个包每条动作都被契约判成危险。
  × classf: 上游那 10 条开关在任何一屏都没打出来 ⇒ crashu-source, samea-group-min, target, transfer, classify, placement, existing, items …
  × gifu: 上游那 3 条开关在任何一屏都没打出来 ⇒ renderer, lang, theme
PARITY_RC=1
$ pnpm check:cliregistry → rc=0   $ pnpm check:cliface → rc=0    # 没把邻_gate 带红
```

**两处我自己写错又改回来的，记下来别重复踩**：

1. **只比顶层 `--help` 会造出一批假阳性**：`--json`、`--dry-run`、`--recursive` 都挂在**子命令屏**上。
   第一版因此红 11 条，其中 8 条是这种。改成"全部屏取并集"后降到 7 条。
2. **拼法必须先归一再比**：`plugins/linedup/src/cli-support.ts:210` 明写 `--sourceFile` 与 `--source-file` 都认，
   而 citty 自动为布尔生成 `--no-x`（屏上通常不打）。上游源码写 `--dry-run`、我们屏上打 `--dryRun`，
   直接比字符串会把**五个能用的开关**报成缺失。加 `canonicalFlag`（剥 `no-`、去连字符、小写）之后
   红从 7 降到 **2**；夹具里两条新增的正反例（"kebab 对上 camel 放行""camel 真缺仍要报"）盯着这条规则。
   还有一条更早的装饰品 bug：`bin` 在本仓 27 个包里都是**对象**形状（`{"xlinedup":"./lib/cli.js"}`），
   我按 string 判 ⇒ 每个包都被跳过、尺一片绿而什么都没量（"比了 0 张表"就是这么来的）。

**剩下这 2 条红的性质不同，别混成一种**：`rg` 现读——classf 那 10 条**源码里写着**
（`crashu-source`/`placement`/`existing`/`transfer` 都在 `plugins/classf/src/cli.ts` 里命中），
是**屏上没打出来**的可发现性缺口；gifu 的 `renderer`/`lang`/`theme` 在我们源码里一条都搜不到，
是**真的没接**。所以尺的文案是"在任何一屏都没打出来"，并在那条里点名"不证代码里没有"——
判据不许比它能证明的东西走得更远。

**为什么不接线**：这条尺现在是红的（2 条真发现），塞进根 `test` 会在别人的回归之前先把整条链涂红；
这两条要先归口（classf 归"补屏"、gifu 归"补参数或申报上游本来没接"）。
先落在纸上，归口之后进链——与 `check:brand` 当年同一个口径。

## 再再追加：classf 那 10 条已归口（是真缺口，但性质是"改名"不是"没实现"）

现读上游那 17 条长开关对上来的是 **9 条被搬运改名的参数**（`--target`→`--targetDir`、
`--items`→`--workItemMode`、`--samea-group-min`→`--sameaGroupMinOccurrences`、
`--crashu-source`→`--crashuSourcesText`、`--placement`/`--transfer`/`--classify`/`--existing`/
`--blacklist-keyword` 同理）。**开关都实现了**（源码里逐条命中），但上游那个拼法不再被认——
搬运是并集，不是子集：改了名字等于让写过的脚本和文档里的示例失效。
本仓已有先例说清该怎么留：`xbandia` 的屏上写着 `export-efu  Alias for export_efu (upstream spelling)`。

落点（`plugins/classf/src/cli.ts`）：`UPSTREAM_CLASSF_FLAGS`（规范形 → 本包字段名）
+ `applyUpstreamFlagAliases(args)` 在 `runProgram` 入口换写，**保留否定**
（`--no-classify` → `--no-classifyMode`，不能翻成正面），再把 9 条 `(also --x)` 打进描述里
——屏上不打出来就等于看不见，尺读的也正是屏。`tests/cli-upstream-flags.spec.ts` 六条：
两种带值写法、否定写法、认识的与未知的原样过去、**别名目标必须本身在屏上**（挡住映射写错字），
9 条拼法都在屏上，以及一条端到端正反对照——真未知开关必须先被拒（本包支撑打的是
`Unknown option:`，文件头注释里写的是 `Unknown argument:`，只认一种会把正控判成"没拒"），
`--target` 必须不被拒。实测：`vitest run tests/cli-upstream-flags.spec.ts` **6 条全过 rc=0**、
`pnpm --filter @hibernalglow/xaihi-classf typecheck` rc=0、`check-node-bundle --dir plugins/classf` rc=0。

尺那边同时修掉一条我自己的假阳性：上游源码里的模板串 `` `--no-${flag}` `` 会被正则取出
光秃秃的 `--no-`，看着像"上游有个叫 `no-` 的开关"（classf 因此剩 1 条红）。加了夹具盯住它之后，
**classf 归零，只剩 gifu 的 `renderer`/`lang`/`theme` 三条**（那三条在我们源码里一条都搜不到，
是真没接，留给 gifu 那一档归口）。现跑：27 个包、26 张表、真跑 7 条、红 1 条（gifu）。
