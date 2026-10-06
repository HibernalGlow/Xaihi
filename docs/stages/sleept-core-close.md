# sleept 定时器内核收口（core / duration / interaction）

日期：2026-10-07。范围：`plugins/sleept/src/` 的内核那一半，以及工作台侧那两条一直解析不到的
value-import。基线 = `<Xiranite>` tag `noxide`（commit `ccf465fe`），实机 worktree 在
`/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide`。

## 1. 改了什么

新增（内核，逐字搬）：

| 文件 | 出处 | 形状 |
| --- | --- | --- |
| `plugins/sleept/src/core.ts` | `packages/nodes/sleept/src/core.ts`（350 行） | 定时器内核：`runSleept` + `SleeptRuntime` 注入，本身零 I/O |
| `plugins/sleept/src/duration.ts` | 基线 `core.ts:116-126` 那两条函数 | **偏离 1**，见 §3 |
| `plugins/sleept/src/interaction.ts` | `packages/nodes/sleept/src/interaction.ts`（280 行） | 交互面 schema + `sleeptInputFromInteractionValues` |
| `plugins/sleept/src/i18n.ts` | `packages/nodes/sleept/src/i18n.ts`（164 行） | 中英字典，逐键原样（`interaction.ts` 的标签出处） |
| `plugins/sleept/src/contract.ts` | `packages/contract` → 两个类型 | 迁移期垫片（同 `plugins/timeu/src/contract.ts` 口径） |
| `plugins/sleept/src/interaction-types.ts` | `packages/cli-runtime/src/interaction.ts:7-102` | 纯类型垫片（同 `plugins/marku/src/interaction-types.ts`） |
| `plugins/sleept/src/cli-i18n.ts` | `packages/cli-runtime/src/i18n.ts:3,96,118-129` | **偏离 2**：签名照抄、函数体未接，见 §3 |
| `plugins/sleept/tests/core.spec.ts` | 基线 `core.test.ts`（114 行，8 条用例） | 期望值逐条手抄，无一条来自跑本仓代码 |
| `plugins/sleept/tests/duration.spec.ts` | 表达式手算 + 再导出同一性 | 6 条，含"搬出去的两条还是同一份"那条 |

改动（接线与文案）：

- `packages/ui-host/build-aliases.mjs`：`XIRANITE_ALIASES` 加一条手写行
  `@xiranite/node-sleept/duration` → `plugins/sleept/src/duration.ts`（`/core` 与 `/interaction`
  由 `nodeCoreAliases()` 自动派生，不需要手写）；`UNRESOLVED_BY_DESIGN` 删掉那两条已经不再成立的账。
- `packages/ui-host/tsconfig.ported.json`：**由生成器写的**（`node packages/ui-host/build-aliases.mjs --write`），
  43 → 46 条受管键，撤掉再写回可以逐字节复现。手抄没有，人工也没有。
- `plugins/sleept/src/cli.ts`：只改被本刀说成假话的那三处文案（文件头、四条子命令的 `--help` 描述、
  `runUnwiredTimer` 的拒绝理由）。**行为一个字没动**：四条定时器仍然退出码 2。
  `tests/cli.spec.ts` 断言的两枚子串（`未接`、`定时器内核`）都在，用例不改。

`index.ts` 与 `exec.ts` **没有改**：逐条读过，它们没有复刻任何 `core.ts` 拥有的逻辑
（`index.ts:55-56` 的 `secondsText` 是 `pmset` 空闲超时的"N h / N min / Never"人话格式，
与 `formatDuration` 的 `HH:MM:SS` 不是同一件事；`exec.ts:121` 的 `minutes * 60_000` 是持有到期时刻，
不是 `countdownSeconds` 的总秒数）。`frontend/Panel.tsx` 同样没有。

## 2. 为什么

`packages/ui-host/src/nodes/sleept/Component.tsx:5-6` 一直在 **value-import**
`@xiranite/node-sleept/duration` 与 `/interaction`。这两条边在解析表里被标成"有意不给"，
理由写的是"那份定时器内核没迁"——内核确实没迁，可面已经搬进来了，于是每条
`pnpm run build:document` 都替这条账响两次。收口的判据就是那条：5 条错 → 3 条错，
剩下 3 条全在 `src/components/views/settings/RuntimeSection.tsx` 182/187/193（并发 lane 的）。

## 3. 两处偏离基线，都在明处

**偏离 1：`countdownSeconds` / `formatDuration` 不在 `core.ts` 里。**
`core.ts` 用 `import` + `export { … }` 再导出，所以基线里从 `./core.js` 取这两条的消费者
（`interaction.ts:9-17`）一行没改。分出去不是"更干净"：那两条是被浏览器面 value-import 的，
指到 `core.ts` 就把 `runSleept` 整只执行宿主拖进工作台产物，违反 ADR-0007 决定 4。
函数体逐字来自基线第 116-126 行，本仓没有第二份实现（`tests/duration.spec.ts` 那条
`expect(core.formatDuration).toBe(formatDuration)` 钉的就是"同一份"）。
上游 master 也做了同一刀（`duration.ts`，21 行），但本仓的实现只从 noxide 抄，那一刀只借分法。

后果：`node scripts/check-verbatim.mjs --only sleept` **红**（rc=1），
残差是第 52 字符处多出来的那条 import。这是对的：那把尺自动放行的只有 import 说明符、
`| undefined` 与注释三类，这一条不在里面。尺我没有改，也不会去改。

**尺现在给了一个正经的申报出口**（`docs/port/verbatim-deltas.json`，
`node scripts/check-verbatim.mjs --declare sleept --reason "…"`，需要时配 `--file`；
它先把要申报的残差打印给人读，再记本仓那份的 sha256，文件之后动一个字符就失效）。
**本刀没有替使用者申报**——"这处差量算不算本仓形状"是使用者的决定，不是 agent 顺手勾掉的。
申报之前它一直红，这条文档就是它的账本。

顺带一条读数变化：这把尺在本刀**之前**也是红的，但红的是覆盖缺口
（`基线有这份内核，本仓没有 ⇒ 内核没搬`）；现在红在一条被读完、被点名的差量上。

**偏离 2：`cli-i18n.ts` 的 `createI18nTranslator` 是响亮拒绝，不是实现。**
上游那 12 行做的是 `createCliI18n` + `getFixedT`，头一行是 `import { createInstance } from "i18next"`
（基线 `packages/cli-runtime/src/i18n.ts:1`）。实测 `i18next` 不在本包依赖里
（`plugins/sleept/node_modules/` 没有它；`plugins/*/package.json` 命中 0，只有
`packages/ui-host/node_modules/i18next` 那一份属于工作台），而 ADR-0002 不许装进 profile 的包引仓内包，
本刀又不许跑 install。手写一份内插值器等于重建已经提供的能力，也等于给保真尺造假数据，
所以这里一调用就抛，说清缺的是哪一格。签名与两个类型逐字抄自基线，字典（`i18n.ts`）整块是真数据。
影响面：只有 `createSleeptInteractionSchema`（引导流 `ui` / `gd` / `guided`，本来同为未接面）会走到它；
`sleeptInputFromInteractionValues`、`countdownSeconds`、`formatDuration` 这些被浏览器面 value-import 的
纯函数不经过这里，内核与用例一个字都不受影响。

## 4. 与 DSH API 的关系

这一刀**没有新增任何 DSH 调用面**：`core.ts` / `duration.ts` / `interaction.ts` / `i18n.ts` 四份文件
零 `@deepseek-ai/*` import（`node scripts/check-node-bundle.mjs --only sleept` rc=0 就是这条的读数，
它看的是产物 `lib/` 里的裸名）。执行仍然只有两个出口：

- `plugins/sleept/src/index.ts:78` `createRunner(ctx.subprocess, …)` 与 `:86` 的 `ctx.effect` 卸载放锁；
  定时器内核要的 `SleeptRuntime.executePowerAction` 必须落在这条缝上，不许在 bin 里自己 `spawn`。
- `plugins/sleept/src/index.ts:221` `ctx.commands.register({ name: 'sleept' })`，
  危险动作仍由 `dangerFor` 拦下（定义真源 `package.json#xaihi.node.danger`）。
  内核的 `dryrun` 与 DSH 的批准是**两件事**：`dryrun=true` 是"我不动机器"，批准是"你敢不敢动"，
  谁都不许拿一个顶另一个。

内核与账本的接缝也还没接：`core.ts` 吐的是 `NodeRunEvent`（`progress` 为 0..100 百分数，
见 `src/contract.ts` 头注释那条单位说明），而本包 `defineNode` 现在只登记电源那六个动作。

## 5. 门禁读数（2026-10-07，仓库根，逐条真跑）

| 命令 | rc | 读数 |
| --- | --- | --- |
| `pnpm --filter @hibernalglow/xaihi-sleept test:unit` | 0 | `Test Files 5 passed (5)` / `Tests 43 passed (43)` |
| `pnpm --filter @hibernalglow/xaihi-sleept typecheck` | 0 | `tsc --noEmit` 无输出 |
| `pnpm --filter @hibernalglow/xaihi-sleept build` | 0 | `Build complete in 468ms` + `Rspack compiled successfully` |
| `node scripts/check-node-bundle.mjs --only sleept` | 0 | `节点包产物里没有未声明的裸名 import` |
| `node scripts/check-verbatim.mjs --only sleept` | **1** | `覆盖 1 个包（比对 1、绿 0、申报 0、无内核 0、红 1）`，残差 `第 52 个字符起不等` |
| `node packages/ui-host/build-aliases.mjs` | 0 | `aliases: 46 条指向存在的源码… alias 同步 OK` |
| `pnpm run build:document`（`packages/ui-host`） | 1 | `Rspack compiled with 3 errors`（原 5 条，sleept 那 2 条已消） |
| `pnpm exec vitest run`（`packages/ui-host`） | **1** | `Test Files 1 failed \| 25 passed (26)`，见 §6 |
| `node scripts/port-ui.mjs --check` | 0 | `657 tracked file(s), 0 out of sync, 24 条申报过的本地改动` |
| `node scripts/check-installable.mjs` | 0 | `30 个 bundle 包都能被 file: 安装` |

保真用例的阳性对照（改一个字符必须红，每条都当场跑、当场还原）：

```
A duration: formatDuration 去掉 padStart               rc=1  Tests 3 failed | 3 passed (6)
B duration: countdownSeconds 去掉 Math.max(0, …) 夹子  rc=1  expected -3600 to be +0
C duration: core.ts 删掉那条再导出                     rc=1  红："core.ts 再导出的是同一份实现"
D core: tickCountdown 两道 isCancelled 门一起拆        rc=1  红："取消发生在电源动作之前…"
E core: runCpuMonitor 丢掉的 === 0 无限位              rc=1  红："maxWaitSeconds 为 0 的 CPU 监控…"
F core: normalizeInput 下界 0 → 1                      rc=1  Tests 2 failed | 6 passed (8)
```

D 有一条要说清：只拆**第一道**门（循环顶部那条）用例仍然全绿——那两道门是冗余的一对，
`sleep` 里翻转的 `cancelled` 下一圈一定会被另一条抓到。所以对照对象是"这一对"，不是其中一条；
写"拆一条就红"会是假证据。

## 6. 还红着的，以及归谁

- `check-verbatim --only sleept` 红：本包 `core.ts` 的偏离 1。等使用者裁决要不要
  `--declare` 进 `docs/port/verbatim-deltas.json`。**不是我改尺，也不是我偷偷申报。**
- `build:document` 的 3 条：`src/components/views/settings/RuntimeSection.tsx` 182/187/193
  （`./NodeMemoryProtectionSettings` 等），并发 lane。
- `packages/ui-host` 的 `tests/document-host.spec.ts` 一条红：
  `config.saveUi 走的是同一个 (node, patch, revision) 形状` ⇒
  `BridgeError: no-provider`，抛点在 `src/client/document-host.ts:137 requireSettingsNs`（调用位 `:237`）。
  那份文件不在本刀的可改范围，实测它在我这次会话进行中被另一条 lane 写过
  （mtime 02:56:31，我的 vitest 是 02:57:12 跑的），import 面只有 `@hibernalglow/xaihi-sdk/bridge`，
  与本刀的三个模块没有任何一条边。归那条 lane。
- 本刀**揭出来**的搬运界面类型差（不是新增的错，但确实是我把模块解析通之后才现形的）：
  撤掉三行别名再跑 `tsc -p tsconfig.ported.json` 是 **169** 条（`nodes/sleept/**` 占 9 条，
  其中 7 条是 TS2307 `Cannot find module '@xiranite/node-sleept/…'`），接上是 **165** 条
  （`nodes/sleept/**` 只剩 5 条）。多出来的三条是：
  `src/nodes/sleept/constants.ts:57,58` 说 `"display-sleep"` / `"screensaver"` 不是 `PowerMode`——
  noxide 那份内核的 `PowerMode` 只有 4 个成员，而这条 UI 是按上游**更新的工作树**搬的
  （manifest 记 `nodes/sleept/constants.ts` 为 `state: head`、无本地差量申报）；
  `Component.tsx:608` 把 `string | undefined` 的 `targetDatetime` 交进 `Readonly<InteractionValues>`。
  两条都在 `packages/ui-host/src/nodes/sleept/**`（UI-port lane 的范围），本刀按纪律**没有动**它们：
  要么给基线类型加成员（偏离内核），要么改搬运文件（要连 `xaihi-deltas.json` 一起申报），两边都是使用者的决定。
  `check-types` 的判据（own 必须为 0）没有被这些影响——它们在 ported 桶，而 own 桶那 3 条
  在 `src/backend/localBackendConfig.ts`，同样是别的 lane。

## 7. 后续扩展

1. 给 `SleeptRuntime` 挑一台宿主侧的实现：`now` / `sleep` 用宿主时钟，`getCpuPercent` /
   `getNetCounters` 走 `src/platform.ts` 的解析 + `ctx.subprocess`，`executePowerAction` 落到
   `planCommand(platform, 'sleep', { suspendKind })` 那条唯一出口，并且**经过** `danger.actionIn` 的批准；
   然后把 `runSleept` 的 `progress` 事件接进 `OPERATIONS_SERVICE` 的账本（注意单位：内核是 0..100）。
2. 内核接上之后，`package.json#xaihi.node.actions` 要不要收 `countdown` / `specific_time` /
   `netspeed` / `cpu` 四条，是一条被 ADR-0007 与 `check-node-bundle` 一起看着的决定：定义真源只有一份，
   `cli.ts` 的 `UNWIRED_TIMER_ACTIONS` 名单必须跟着动，不许留成"面上有、定义里没有"。
3. `i18next` 那条依赖要么作为**包依赖**进来（同时把 `createI18nTranslator` 换回上游实现），
   要么让引导流继续未接。二者都行，唯独不行的是现在这样再写一份假的。
4. 别的面 value-import 自家节点 core 的那一族（`/core` 自动派生已经覆盖）以后新增纯函数文件时，
   在 `build-aliases.mjs` 加行或扩 `nodeCoreAliases()` 的名单，两处都要带上判据与理由，
   不许再靠 `UNRESOLVED_BY_DESIGN` 记一条"没搬"来让构建闭嘴。
