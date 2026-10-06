# 阶段报告：smartzip 收尾（交接两条申报都验伪 + 实机那一档补上）

来源：Xiranite tag `noxide`（commit `ccf465fe`）的 `packages/nodes/smartzip/`。
本轮进来时的交接是两条待验的申报：(a)「一个 vitest 文件红」；(b)「`src/index.ts` 的动作处理器
可能还在返回占位串而不是调真内核」，以及「上一个 agent 在重写 `src/platform.ts` 时被杀掉，
那个文件可能半截」。三条**都验伪**，本轮的写入只有一件事：把基线那份实机集成档搬过来。
规则出处：`docs/adr/0006-ui-source-is-xiranite.md`（搬运不发明）、`AGENTS.md`「门禁与证据」
（每条尺配阳性对照、区分「做了」与「实机验过」）、「降级铁律」（退化要读得回来）。

## 一、改了什么

- `plugins/smartzip/tests/fixtures/local-subprocess.ts` —— **新增**。一个真起进程的
  `SubprocessSeam`（`src/exec.ts:49` 那个结构类型）的测试对应物，形状照
  `plugins/findz/tests/fixtures/local-subprocess.ts`，两处按本包改：不引
  `@deepseek-ai/dsh-subprocess`（加依赖要 `pnpm install`，本轮不许碰锁文件），以及
  `exec.ts` 读的是 `collected.stdout.readFrom(0).text`（收完再读），所以输出攒成 Buffer
  再按字节偏移交回。
- `plugins/smartzip/tests/platform.integration.spec.ts` —— **新增**。3 条判据逐条手抄自基线
  `packages/nodes/smartzip/src/platform.integration.test.ts:19-110`（三层 AES256 加密嵌套 +
  220 000 字节随机分卷 + 错密码），夹具那串 `iniText`、两条正则
  （`/could not be unlocked.*1 configured password/i`、`/sample\.7z\.001$/`）、
  两条"密码不许出现在序列化结果里"都照抄。没有 7-Zip 的机器上响亮跳过
  （`describe.skipIf(tools === null)` + 那行 `console.warn`），判据与
  `plugins/findz/tests/kernel.integration.spec.ts:32,71` 同一格。
- **`src/` 一行没动。** 交接点名的 `src/platform.ts` 经核对是完整的，不是半截（见下面第二节 1）。
- 没动 `scripts/**`、`packages/**`、别的包；`plugins/smartzip/tests/` 之外零写入。
  本轮期间另一个 agent 正在给 `src/cli.ts` / `src/index.ts` / `src/contract.ts` /
  `tests/*.spec.ts` 做引用行号清扫（那些文件在 `git diff` 里是注释级 hunk），本轮一个 hunk 都没碰。

## 二、为什么这样设计

1. **"platform.ts 半截"是误报。** 函数清单两侧各 42 条声明，本仓 = 基线 − `runRaw` +
   `runCommandOf`。逐行比对（剥注释、压空白，再抹掉 `| undefined`、非空断言、`_` 前缀形参与
   `runRaw` 尾参这三类放行的记号）给出 **35 条只在基线、22 条只在本仓**，全部落在
   `src/platform.ts` 文件头申报的三格里：`runRaw`/`execFile` 换成注入的缝、`recyclePath` 的
   trash 提供方换成抛、`fileOperations` 沿调用链换成 `runRaw`。基线体
   `listArchiveEntries` 的 `codePage?: number` 在本仓是 `codePage: number | undefined`
   ——`exactOptionalPropertyTypes` 的记法让步，函数体逐字未动。`check-verbatim.mjs` 只量
   `core.ts`，所以这一段是手工补的账。
2. **"index.ts 返回占位串"也是误报。** 六条动作各调 `call(…)`，`call` 就一句
   `runSmartZip(inputFrom(…), createNodeSmartZipRuntime({ runCommand }), …)`
   （`src/index.ts:265-279`），没有第二条腿。`tests/definition.spec.ts` 那两条
   （`smartzip_status` 读出内核那句 `SmartZip status loaded: 9 archive extension(s).`、
   `smartzip_extract` 读出 `7-Zip was not found`）是从注册出来的工具上真调出来的。
   `pnpm --filter … test:unit` 现在 **4 个文件 59 条全绿**，交接说的"一个文件红"不复现。
3. **补的那一档补的是唯一量不到的地方。** 已有三份 spec 喂的都是假件：
   `core.spec.ts` 的 `stubRuntime`、`definition.spec.ts` 的 `fakeSubprocess` 永远以
   `exitCode` 收口，于是 `find7z` 的 `which` 必查不到东西——`t` 与 `x` 的先后、`-v` 的续卷筛除、
   `-mhe=on` 的清单读法、`exec.ts` 那三处退出码映射，全都没有真进程验过。
   本机有 `/opt/homebrew/bin/7zz`（7-Zip 26.03 arm64），所以这一档**是真跑出来的**，
   3 条 387ms 全绿。夹具的建包步骤也走同一条缝（`run7z` 调 `runCommand`），顺带把
   `exec.ts` 的映射也验了；产物里仍然不含 `node:child_process`（G4 量的就是这条）。
4. **嵌套那条与基线判据不同，写的是已申报的退化，不是放宽断言。** 基线 `:53` 期望
   `success: true`，因为它那一步 `recyclePath()` 把中间层交给 trash 提供方；本仓没有那条缝
   （缺口 **G-no-os-trash**，`src/platform.ts` 文件头申报的偏离 3，`:30-40`），它抛 `NO_TRASH_MESSAGE`，被
   `core.ts:306-307` 折成 `success:false`。基线那 3 条里能搬的两条（分卷、错密码）一条没改；
   嵌套这条保留了基线的三条实质断言（最深处载荷确实解出来、内容一字不差、密码不落结果），
   换掉的只有"提供方在场"这一个前提。再加一条阳性对照：三层源包都不许被永久删掉。
5. **这条尺配了阳性对照。** 把 `src/platform.ts:731-733` 的抛临时换成 `await rm(path)`，
   跑 `tests/platform.integration.spec.ts` + `tests/core.spec.ts`：**rc=1，2 条红**
   （`回收站那条拒绝不许退化成 rm` 与 `三层加密嵌套…`），随即按原字恢复，
   `git diff` 在该文件只剩另一个 agent 的注释级 hunk，代码行零差异。

## 三、与 DSH API 的关系

- 起外部程序只走 `ctx.subprocess`：`src/index.ts:285` 现取，`src/exec.ts:84-119` 兑现，
  本轮的 `tests/fixtures/local-subprocess.ts` 是它在**测试半边**的对应物，不是第二条生产腿。
- 进度与结果视图走 `ctx.get(OPERATIONS_SERVICE)`（`src/index.ts:290`），失败原因落在
  `packages/node-sdk/src/define-node.ts:258-259` 那条 `fail` 上。测试宿主没装 xaihi-core，
  所以跑 `definition.spec.ts` 会看到 SDK 那句
  `reportsProgress but no journal resolved`——`packages/node-sdk/src/define-node.ts:234-241`
  自己设计的可见降级，别的包同样有（bandia 的 test:unit 里 1 处，smartzip 2 处），不是本包的缺陷。
- 清单真源仍是 `package.json#xaihi.node`；本轮没改 `bin` / `exports['./cli']` /
  `exports['./help']` / `xaihi.node.description.en`，所以 `gen-cli-registry` 不需要重生成（G6 rc=0）。

## 四、六把尺的实测（仓根，rc + 一行摘录）

| 尺 | rc | 摘录 |
|---|---|---|
| `pnpm --filter @hibernalglow/xaihi-smartzip test:unit` | 0 | `Test Files 4 passed (4)` / `Tests 59 passed (59)` |
| `pnpm --filter @hibernalglow/xaihi-smartzip typecheck` | 0 | `$ tsc --noEmit`（无输出） |
| `pnpm --filter @hibernalglow/xaihi-smartzip build` | 0 | `✔ Build complete in 480ms` + `Rspack compiled successfully` |
| `node scripts/check-node-bundle.mjs --only smartzip` | 0 | `比对 27 个节点包的产物 / 没有未声明的裸名 import`（**这把尺不认 `--only`**，见下） |
| 同上 `--dir plugins/smartzip`（本包那一条） | 0 | `比对 1 个节点包的产物 / 没有未声明的裸名 import` |
| `node scripts/check-verbatim.mjs --only smartzip` | 0 | `覆盖 1 个包（比对 1、绿 1、申报 0、无内核 0、红 0；基线 = noxide ccf465fe）` |
| `node scripts/gen-cli-registry.mjs --check` | 0 | `--check OK（26 条…）` |

**G4 的一处坑要报备**：`scripts/check-node-bundle.mjs` 没有 `--only` 这个旗标（它只认
`--dir`，见该文件 `:118-121`），所以 `--only smartzip` 会被**整体忽略**并去量全部 27 个包。
本轮第一次跑它就是 rc=1，红的不是 smartzip 而是 `plugins/gifu: 没有 lib/ 产物`（另一条 lane
的包，本轮不许碰）；随后那个包建好了，同一条命令回到 rc=0。本包自己的产物用 `--dir` 单独量过，
两次都是 rc=0。

实机另给两条从产物上跑出来的读数（不是从 `src/` 跑的）：`node lib/cli.js status` →
`SmartZip status loaded: 9 archive extension(s).`（rc=0）；`node lib/cli.js extract
--pathsText /tmp/x.zip` → rc=1 并点名 `NO_SUBPROCESS_MESSAGE` 那句；
`archive --pathsText … --dryRun` → rc=0 且**没有造出任何 zip**；未接的 `ui` / `gd` / `guided`
三条腿在 `--help` 里带 `（未接）`。

## 五、仍然不绿 / 没验的部分

- **G-no-os-trash 没解除**：嵌套解完的清理、`deleteSource`、`deleteSourceWhenPassword`
  三条在宿主里也会失败。基线那条"嵌套解完即成功"要等可恢复删除那条缝落地才能回归本仓；
  这是上游能力缺席，不是本包可以自己长的通路。
- **前端面板仍是脚手架**：`frontend/Panel.tsx` 那 22 行与 bandia / enginev / gifu / samea
  **逐字相同**（各 22 行），没接这份定义的六个动作。这是全仓一方节点界面那一格
  （台账 G9、`docs/adr/0014-first-party-node-ui-in-realm.md`），归 `packages/ui-host`，
  本轮单独给 smartzip 写一版界面就是"并列第二套"，按 ADR-0006 不做。
- **没在真宿主里跑过**：`pnpm host` / `plugin:install` 那一条本轮没跑，所以
  `ctx.subprocess` 对 7-Zip 的真兑现、`ask` 那道批准缝、账本里的进度条都是
  **compile-verified + 测试替身 verified**，不是实机 verified。
- **Windows 那一侧没验**：`find7z` 的 `C:\Program Files\7-Zip` 候选与 `7zFM.exe` 只在 macOS
  上跑过（`which 7zz` 那一条腿）。
- `check-brand` 仍是 rc=1（全仓，且按 ADR-0010 **故意没接 CI**）。本包命中的都是申报过的两类
  字面量（`.xiranite/smartzip-runs.jsonl` 旧数据落点、`__XIRANITE_NO_PASSWORD__` 喂给外部程序的
  参数本体）；本轮新增的两个文件在品牌尺里 **0 命中**（`<Xiranite>` 只出现在注释的出处位，
  尺剥注释）。

## 六、同批另一路：引用行号清扫 + 一句不实的申报（纯注释级）

同一段时间窗里的另一条 lane 写入，落在 `src/` 与 `tests/` 的**注释**上，代码行零改动。
写它的理由：交接那句"上一个 agent 被杀掉"在**这件事上是真的**——被杀在半截的不是
`src/platform.ts`（第二节 1 已核），而是它留下的 `file:line` 引用。

1. **症状是系统性的，不是零星笔误。** 本包有 26 处 `core.ts:<行>` 引用（`src/index.ts` 8、
   `src/cli.ts` 7、`src/platform.ts` 5、`tests/cli.spec.ts` 4、`tests/core.spec.ts` 1、
   `tests/definition.spec.ts` 2），其中 24 处的数值 = **本仓 `src/core.ts` 当前行号减 9**，
   也就是那份内核的文件头后来长了 9 行而引用一次没跟着动。照旧读法 `core.ts:77`
   （想说 `SmartZipAction`）落在头注释中间，`core.ts:311`（想说 `[ext]` 那 9 项缺省）落在
   `export const runSmartzip = runSmartZip` 上。逐条改到当前行号（86 / 320 / 233 / 232 / 230 /
   270 / 271 / 306-307 / 392 / 517 / 420-421 / 344 / 201-208 / 189-199 / 244,260,262 / 249-269），
   并用一把一次性的尺把**每一条** `core.ts:<行>` 展开成那一行的原文核过（26/26 命中目标语句）。
   证伪：同一把尺换成正向对照的那批旧数值，
   `rg 'core\.ts:(224|223|221|77|192-199|180-190|508|411-412|311|261|309|297-299|187|188|235,251,253|240-260)' src tests`
   现在 0 命中——清扫前它命中这 24 条。
2. **两种约定分开，不再混。** 带文件名的（`core.ts:N`）一律指**本仓那份**；裸 `:N` 一律指
   **基线那份**，两份文件头各有一句点名（`src/core.ts` 的「行号指上游那份文件」、
   `src/platform.ts` 的「行号指基线那份文件」）。按这个约定复核：基线相对的那些**本来就是对**
   的（`src/platform.ts` 头那 44 条 `:N` 抽了 1、5、6、21、24、76、87、109-111、116、122、
   144-155、165、170、175、189、247-258、268-274、430-438、458-465、492-506、523、528-539、
   543、566-573、616-643 逐条对过基线），跨包的三条（`plugins/bandia/src/exec.ts:24-28`、`:91`、
   `plugins/recycleu/src/exec.ts:63`）也对得上。唯一的例外是 `src/index.ts:195` 那句
   "上游 `platform.ts:76,154`"：基线 76 是那句按条目折算的 progress，154 是 `extractArchive`
   里 `args` 数组的收尾 `]`。改成 `76,436`（436 是 `archivePaths` 里同一形状的另一种折算）。
3. **一句不实的申报。** `src/platform.ts` 的 G-no-os-trash 那一格原文写
   "`src/index.ts` 在合成缝里把这一句补进运行账本的 `preview`"——`src/index.ts` **没有**这条腿：
   `call()` 是 `run.resultView(viewOf(result.data))` 然后 `throw`（`src/index.ts:273-277`），
   失败原因走 `packages/node-sdk/src/define-node.ts:258-259` 那条 `journal?.fail(…)`，
   与 `preview` 无关。按实测行为改写了那几行（**没有为了对上文档去加代码**：这一抛本来就
   在结果视图的 `data.errors` 与账本的 fail 两处读得回来，依据是下面第 4 条那行读数）。
4. **实机读数（独立于第二节 3 那一档，从 `src/` 直接跑，不是从产物跑）。** 本机
   `/opt/homebrew/bin/7zz`，用一条与 `src/exec.ts` 同形状的 `runCommand` 喂
   `createNodeSmartZipRuntime`：加密 `x`（AES256 + 中文/日文名）→ `success:true`、
   `passwordUsed:true`、产物内容逐字相等、`JSON.stringify(result)` 不含口令；`archive`
   真建出 `tobag.zip`；`inspect_codepage` 对真包报 `65001 / certain` 并列出文件树 1 条；
   错口令 → `success:false`；`delSource=1` 那一条 → 文件已解出、`keep.zip` **仍在盘上**、
   `data.errors[0]` 就是 `NO_TRASH_MESSAGE`（第 3 条那句改写据此）。
5. **尺重跑（清扫之后，仓根）**：G1 `test:unit` rc=0（`Test Files 4 passed (4)`、
   `Tests 59 passed (59)`）、G2 `typecheck` rc=0、G3 `build` rc=0
   （`✔ Build complete in 515ms` + `Rspack compiled successfully`）、
   G4 `check-node-bundle --only smartzip` 与 `--dir plugins/smartzip` 均 rc=0、
   G5 `check-verbatim --only smartzip` rc=0、G6 `gen-cli-registry --check` rc=0。
   本节没动 `bin` / `exports` / `xaihi.node.description.en`，G6 不需要重生成。
6. **仍然没核回来的那一格**：`package.json#xaihi.node` 的词表来源写的是
   `<Xiranite>/node-definitions/smartzip.json`，而那份文件**不在 noxide 这个 commit 里**
   （`git cat-file -p ccf465fe:node-definitions/smartzip.json` → "路径在磁盘上，但是不在
   `ccf465fe` 中"；它只在工作树更新的那个 checkout 里有）。所以这条引用按 `noxide` 读不回来。
   本轮改用一个读得到的真源复核整张清单：与 `/Users/glow/Base/Code/Freya/Xiranite/node-definitions/smartzip.json`
   逐字段深比对，先把四条已申报的偏离（`isActionSelector`、`danger.predicates[].test.actionField`
   剥掉、`options[].value` 收成 string、`help` 只剩 `whenToUse`+`safety`）在上游一侧同样施加，
   结果**除 `help` 那一节之外零差异**，且 `help.whenToUse` / `help.safety` 与上游逐字相等；
   动作与字段的 zh/en 词表另与基线 `packages/nodes/smartzip/src/interaction.ts:38-58`
   逐条一致（含 `pathsText` 对 `status` 隐藏、`codePage` 只对 `extract_codepage` 可见、
   `databasePath` 随 `recordRun`、`dryRun` 对两条只读动作隐藏这四条 visible 判据）。
   **台账里那句 `node-definitions/…` 的出处要不要统一改成 `interaction.ts` 加上那个非 noxide
   路径**，是跨 26 份的同一格（同批包都写这一句），本轮没有代全仓改。
