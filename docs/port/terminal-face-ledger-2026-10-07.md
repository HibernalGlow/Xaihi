# 终端面对照账（2026-10-07）

生成器：`scripts/check-terminal-face.mjs`（只读，不改仓、不装依赖）。重跑：

```sh
node scripts/check-terminal-face.mjs          # 人读表
node scripts/check-terminal-face.mjs --json   # 机读
```

- 上游根 `<Xiranite>/packages/nodes/<id>/src` —— **终端面在这里，不在 `src/nodes/<id>/`**。
  `src/nodes/<id>/` 是 GUI 面（`Component.tsx` / `ResultPanels.tsx`）。
- 本仓根 `plugins/<id>/src`。
- 列语义：数字 = 该件存在且行数；`.` = 该节点 src 存在但这件缺；`-` = 该节点 src 不存在。
- `Deck` 列 `self` = `cli.ts` 里出现 `@opentui/core` 的运行时入口（自制屏，不是搬上游 `Tui.tsx`）。

## 表

```
node         | 上游 Tui  interact presets  order  defns | T# || 本仓 Tui  interact presets  order  defns | T# | Deck
bandia       | 27        38       .        .      11    |  5 || .         .        .        .      .     |  0 |
bitv         | 54        288      .        .      11    |  6 || .         .        .        .      .     |  0 |
classf       | 59        44       .        .      11    |  7 || .         .        .        .      .     |  0 |
classq       | 27        31       .        .      11    |  2 || .         .        .        .      .     |  0 |
cleanf       | 20        44       101      18     11    |  6 || .         .        .        .      .     |  0 | self
clipm        | 128       278      .        .      11    | 12 || -         -        -        -      -     |  0 | --
crashu       | 5         21       .        .      11    |  4 || .         .        .        .      .     |  0 |
dissolvef    | 4         3        .        .      11    |  4 || .         .        .        .      .     |  0 |
encodeb      | 11        96       22       .      11    |  5 || .         .        .        .      .     |  0 |
enginev      | 723       30       .        .      11    |  5 || .         .        .        .      .     |  0 |
findz        | 3         1        .        .      11    |  3 || .         .        .        .      .     |  0 |
formatv      | 20        26       .        .      11    |  4 || .         .        .        .      .     |  0 |
gifu         | 28        247      .        .      11    |  7 || .         .        .        .      .     |  0 |
hello        | -         -        -        -      -     |  0 || -         -        -        -      -     |  0 | --
kisaki       | 622       128      .        .      11    | 24 || -         -        -        -      -     |  0 | --
lata         | 4         1        .        .      11    |  3 || -         -        -        -      -     |  0 | --
linedup      | 4         1        .        .      .     |  4 || 4         1        .        .      .     |  0 |
linku        | 219       153      .        .      11    |  5 || .         .        .        .      .     |  0 |
marku        | 200       13       .        .      11    |  6 || .         34       .        .      .     |  0 |
migratef     | 201       214      .        .      11    |  5 || .         .        .        .      .     |  0 |
mvz          | 4         1        .        .      11    |  4 || .         .        .        .      .     |  0 |
nameu        | 5         4        .        .      15    |  3 || .         .        .        .      .     |  0 |
rawfilter    | 10        5        .        .      15    |  4 || .         .        .        .      .     |  0 |
recycleu     | 494       157      .        .      15    |  5 || .         .        .        .      .     |  0 |
repacku      | 72        115      .        .      15    |  4 || .         .        .        .      .     |  0 |
samea        | 48        53       .        .      12    |  3 || .         .        .        .      .     |  0 |
sleept       | 545       282      .        .      15    |  6 || .         318      .        .      .     |  0 |
smartzip     | 84        91       .        .      15    |  5 || .         .        .        .      .     |  0 |
timeu        | 56        23       .        .      15    |  5 || .         .        .        .      .     |  0 |
trename      | 83        103      .        .      15    |  4 || .         .        .        .      .     |  0 |
```

## 汇总（双边都有的节点 = 26）

| 件 | 上游有 | 本仓已搬 | 缺 |
|---|---|---|---|
| `Tui.tsx` | 29 | 1（linedup） | 25 |
| `interaction.ts` | 29 | 3（linedup / marku / sleept） | 23 |
| `presets.ts` | 2（cleanf 101 / encodeb 22） | 0 | 2 |
| `ordering.ts` | 1（cleanf 18） | 0 | 1 |
| `definition.ts` | 28 | 0 | 25 |

- 测试份数：上游 160 / 本仓 **0**。
- 只在上游（本仓未建包）：`clipm`、`kisaki`、`lata`。
- 只在本仓（上游没有）：`hello`。
- 自制 OpenTUI：`cleanf`（唯一）。

## 对既有结论的修正

1. **"缺 26 个节点"要按件分档，不能整包报。**
   `Tui.tsx` 缺 25、`interaction.ts` 缺 23、`definition.ts` 缺 25，但
   `presets.ts` 只缺 **2 个节点**（cleanf / encodeb）、`ordering.ts` 只缺 **1 个**（cleanf）。
   把这两件算进"26 次小活"是超计。
2. **`definition.ts` 是账上完全没出现的一栏**：28 个上游节点有、本仓 0 个，每份 11–15 行。
   这是最便宜的一批。
3. **`marku` / `sleept` 的 `interaction.ts` 已经在了**（34 / 318 行），且用的是
   **局部垫片**（`./interaction-types.ts`、`./cli-i18n.ts`）来消掉 `@xiranite/*` 说明符
   —— 这是本仓已有的成法，不是"待定方案"。
4. **上游那两件小得离谱是真的**，且用户给的数字逐项对上：cleanf 20 / 44 / 101 / 18 / 11，
   linedup `Tui.tsx` 4 行、`interaction.ts` 1 行。
5. 上游每节点测试数也对上：cleanf 6、bitv 6、classf 7、gifu 7、marku 6、sleept 6。

## 样板的现状（linedup）

- 字节拷贝**已核实为真**：
  - `plugins/linedup/src/Tui.tsx` 3855 B，`sha256 2da2c11ab33a0ddc…`
  - `plugins/linedup/src/interaction.ts` 2868 B，`sha256 402f54d03d8db170…`
  - 与上游 `Xiranite/packages/nodes/linedup/src/` 的对应件**哈希逐位相同**。
- 但它**还不是能用的样板**：逐字节 = 逐字节带着 `@xiranite/cli-runtime/*` 说明符
  （`Tui.tsx:2` 的 `.../terminal`、`.../terminal/opentui`、`.../i18n`）。本仓包名是
  `@hibernalglow/xaihi-cli-runtime`，`@xiranite/*` 在包代码里被 ADR-0002 禁止
  （`cleanf/src/cli.ts` 头部第 5 条原文："本仓没有那两个包也不许引 `@xiranite/*`"）。
  ⇒ 照现状编译只会新增红。

## Deck 取证：`runCleanfOpenTui` **调了内核**

`plugins/cleanf/src/cli.ts:212` 的 `runCleanfOpenTui` 是真的执行腿，不是空屏：

- `cli.ts:65` `import { CLEANING_PRESETS, getDefaultPresets, parseCleanfPaths, runCleanf } from './core.ts'`
- `cli.ts:66` `import { createNodeCleanfRuntime } from './platform.ts'`
- `cli.ts:250-251`（扫描腿）与 `cli.ts:283-284`（实机清理腿）都 `await runCleanf({...}, createNodeCleanfRuntime(), cb)`

⇒ 指控应收窄为**形状**（自己画屏、走裸 `@opentui/core`+`@opentui/react`，不经过
`runTerminalUi` / `Workbench*` / `TerminalThemeProvider`），**不是**"画了个假屏"。
另：同文件头部第 5 条仍写着 "ui / gd / guided 未接"，与 `cli.ts:445-446` 的
`runGd: runCleanfClackFlow, runUi: runCleanfOpenTui` 已经**过期不一致**。

## 四条边取证

| 说明符 | 落点 | 真导出（实测） |
|---|---|---|
| `…/terminal` | `src/terminal.ts` → `src/tui/index.ts` | `runTerminalUi`、`runInteractionCli`、`listTerminalThemes`、`resolveTerminalTheme`、`writeTerminalNodeHelp`、`TerminalUiScreenProps`（类型）、`TerminalPreferenceController`/`Values`（类型） |
| `…/terminal/opentui` | `src/terminal-opentui.ts` → `src/tui/opentui/public.ts` | `ProgressBar`、`TerminalThemeProvider`、`WorkbenchButton/Field/Panel`、`resolveTerminalTheme`、`terminalIcon`、`useAnimation`、`useTerminalChromeActions`、`useTerminalTheme`、`useTerminalUiSession`…（13 个构件全在） |
| `…/i18n` | `src/i18n.ts` | `createTerminalTranslator` ✓ |
| `…/interaction` | `src/interaction.ts` | 类型面 ✓ |

**但用户给的那行接线是错的**：上游节点腿的**引导入口是 `runInteractionCli`**（在 `…/terminal`），
**不是 `runGuidedInteraction`**。实测 `runGuidedInteraction` 只从包根 `src/index.ts` 导出，
`…/terminal` 桶里没有它（桶内部把它当默认 guide 用，不对外再导出）。
照 `import { runTerminalUi, runGuidedInteraction } from '@xiranite/cli-runtime/terminal'` 写
⇒ 编译新增红。实测上游 12 个节点用的都是：

```ts
import { runInteractionCli, runTerminalUi, type TerminalPreferenceController, type TerminalPreferenceValues } from "@xiranite/cli-runtime/terminal"
import { resolveInteractionPreferences, type CliInteractionPreferencesSource, type TerminalInteractionDefinition } from "@xiranite/cli-runtime/interaction"
```
（例：`Xiranite/packages/nodes/rawfilter/src/cli.ts:26-27`、`bandia/src/cli.ts:28-30`、
`migratef/src/cli.ts:27-28`、`classq/src/cli.ts:4-6`、`dissolvef/src/cli.ts:31-32`）

## `pnpm install` 裁定：**先不要**

三条读数：

1. `pnpm-workspace.yaml` 是 **MM**：暂存区那半是"**删掉负名单**"（19 行），工作区那半把负名单
   **加回来了**并附上 `overrides: react/react-dom 19.2.4`。
   ⇒ **当前生效（工作区）配置里那 6 个包仍然是排除的**。此刻跑 `pnpm install`，
   它读的是工作区配置 ⇒ 包**不会入表**，只会把 `pnpm-lock.yaml` 重写一遍。
2. `pnpm-lock.yaml` 也是 **MM**，且全仓脏区 **1318** 项。重写它 = 把别人的锁改动一起推进去。
3. 真正的拦路不在 install，而在**依赖图本身**——而且比"6 包"小得多：
   - 负名单 7 条里，`!packages/tui` 指向的 `packages/tui` **目录已不存在**（陈旧条目）。
   - 7 个包里只有 **`packages/api`** 还带 `@xiranite/*` 依赖
     （`@xiranite/file-operations`、`@xiranite/services`，两个本仓都不存在）。
   - 其余 5 个（`cli` / `cli-runtime` / `contract` / `logging` / `shared`）**已经全是
     `@hibernalglow/xaihi-*` 名**，无 `@xiranite/*` 依赖。
   - 而 `cli-runtime` 依赖 `@hibernalglow/xaihi-api@workspace:*` ⇒ 入表必须先解开 `api`
     那两个 `@xiranite/*` 名。
   - 顺手能做的第一刀：`allowBuilds` 里的 `@parcel/watcher` 与 `overrides` 已在工作区，
     不需要回头再改。

⇒ 建议顺序：**先做不吃 install 的那一大批**（`interaction.ts` 23 份 + `definition.ts` 25 份
走局部垫片，`presets.ts` 2 份、`ordering.ts` 1 份），把 linedup 这份样板按成法收尾
（说明符改指 `@hibernalglow/xaihi-cli-runtime`，类型面走垫片），再单开一次
"`api` 改名 → 负名单删条目 → install"的原子动作，且那一次要在没有别的 lane 碰
`pnpm-workspace.yaml` / `pnpm-lock.yaml` 的窗口里做。
