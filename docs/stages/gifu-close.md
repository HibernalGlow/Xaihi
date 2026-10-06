# 阶段报告：gifu 收尾（内核保真 + 接线 + 单测）

来源：Xiranite tag `noxide`（commit `ccf465fe`）的 `packages/nodes/gifu/`。
本轮只做四件事：补上内核缺的那条类型层让步、确认三条动作都接到真内核、把减法跑成证据、
把六把尺的实测数字记下来。规则出处：`docs/adr/0006-ui-source-is-xiranite.md`（搬运不发明）、
`docs/adr/0010-brand-is-xaihi.md`（品牌）、`docs/adr/0013-config-goes-through-dsh-settings.md`（配置出口）。

## 一、改了什么

- `plugins/gifu/src/core.ts:96-104` —— 新增**类型层让步 4/4**：`GifuArchiveImageEntry.size`
  从 `size?: number` 写成 `size?: number | undefined`。这是纯类型记法，运行期一个字节都没动。
- `plugins/gifu/src/core.ts:10-17` —— 文件头那条"类型层让步"从三条改成四条，并写清这四条
  **都不许靠改尺放行**：尺只吞得下 `| undefined` 这一记号，`NormalizedGifuInput` 那条重记法
  仍是它打印出来的唯一差异。
- `plugins/gifu/src/index.ts:5` —— 同一计数的引用位同步（"三类差异 / 四条类型层让步"）。
- 没动 `scripts/**`、`docs/port/**`、别的包；`plugins/gifu/` 之外零写入。

## 二、为什么这样设计

1. **红的是编译，不是逻辑。** 本轮进来时 `pnpm --filter @hibernalglow/xaihi-gifu typecheck` 报
   `src/platform.ts(247,20): error TS2379`，根因是本仓 `tsconfig.base.json:10-11` 比基线严的两条
   开关（`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）：基线那份 tsconfig 没开。
2. **改类型声明，不改调用方。** `platform.ts:250` 那句 `size: numberOrUndefined(record.Size)`
   是逐字抄基线 `platform.ts:78`；在调用方写条件展开会改动搬运文本，而本仓对同一坑的两条先例
   都是在**声明处**补 `| undefined`、让调用方保持逐字：`plugins/bandia/src/contract.ts:27-28`
   与本文件已有的 1/3（`GifuInput` 整块）。
3. **这条差异仍由尺说话。** `| undefined` 属于 `scripts/check-verbatim.mjs` 的 `canonical()`
   自动放行的记号类，所以补它**不会**新增打印出来的差异；打印出来的照旧只有 2/3 那条
   `NormalizedGifuInput`（记法改写，成因是同一条开关：`Required<>` 在 `exactOptionalPropertyTypes`
   下仍允许显式 `undefined`）。那条按任务要求**留着、申报归 parent**：本轮没改尺、没加白名单、
   没写 `docs/port/verbatim-deltas.json`（现读：该文件还不存在，尺报"申报 0"）。

## 三、与 DSH API 的关系

- 外部程序那一格：`platform.ts:20-23` 把每一次 7-Zip / ffmpeg / ffprobe 调用接到
  **`ctx.subprocess`**（`dsh-subprocess/lib/types/index.d.ts:102` 的 `spawn`、
  `:75-111` 的 `SubprocessRuntime`，`resolveExecutable` 在 `:102` 前），裸名查找不再起
  `which` / `where.exe` 定位进程。缝的类型面是已发布 `.d.ts` 的**子集镜像**
  （`platform.ts:149-156`），本包没声明 `@deepseek-ai/dsh-subprocess` 依赖，
  与 `recycleu` / `mvz` 那两份口径一致；依赖请求归这条账。
- 取用走 `ctx.get('subprocess')`（`index.ts:190`），`inject = ['tools', 'subprocess']`
  （`index.ts:60`）⇒ 没有那条缝时装载被 cordis 挡住，缺席的话写在 `index.ts:191-193`。
- 运行账本：`index.ts:198` 每次调用现取 `ctx.get(OPERATIONS_SERVICE)`；
  内核 `progress` 是 0..100 百分数，所以 `index.ts:158-163` 不再 `* 100`。
- 危险动作：`make` 且非预演 → `ctx.approval`（清单 `danger.type: "all"`，
  `index.ts:25-32` 与 `index.ts:34-46` 那份"dryRun 三份默认值"的账）。
- 独立 bin 拿不到缝 ⇒ 响亮拒绝：`platform.ts:102` 那句 `GIFU_PROCESS_SEAM_REFUSAL`
  与 `createGifuUnwiredRuntime`（`platform.ts:220-237`），退出码 2，不演成功。

## 四、接线与内核完成度（实测）

- 基线 `core.ts` 现读 **781 行**（台账那句 781 是对的），本仓那份 **829 行**。
- 全文件比对（与尺同一套归一化：剥注释、压空白、抹 `| undefined` 与非空断言，再逐字符扫描，
  而不是只看尺打印的第一处）：canonical 长度上游 27336 / 本仓 27384，
  **差异总数 1**，就在字符 953 的 `NormalizedGifuInput`。⇒ 内核没有缺函数、没有缺分支。
- 非空断言两侧都是 **7**（用尺自己那一条 `([A-Za-z0-9_$)\]])!(?!=)` 正则数，`!==` 不算）。
- 三条动作（`package.json#xaihi.node.actions` = `inspect` / `plan` / `make`）逐条接到真内核：
  `index.ts:199-209` 三个 handler 全部走 `runOne`（`index.ts:220-232`）→ `runGifu(...)`，
  返回值来自内核的 `message` + `data()` 那七条计数（`summarize`，`index.ts:239-248`）。
  **没有一条是占位字符串。** 结构上也不可能悄悄漏：`packages/node-sdk/src/define-node.ts:250,266`
  对"声明了动作却没有 handler"直接抛。
- `plugins/gifu/src/index.ts` 里唯一一处 `return '...'` 就是上面那个 summarize，
  它拼的是内核的 `result.message` 与 `result.data`，不是写死的句子。

## 五、单测：期望值手抄，减法跑过

- `tests/core.spec.ts`：上游 `core.test.ts`（181 行 / 11 条用例）那 11 条**一条不加、一条不减**，
  改动只有 import 说明符与本文件头；另加 5 条钉内核自己那份 `defaultGifuInput` 与校验器边界。
- `tests/platform.spec.ts`：上游 `platform.test.ts:5-26` 那条 `parse7zImageEntries` 逐字手抄
  （含 `.JXL` → `.jxl`、`Folder = +` 与 `Attributes = D` 都算目录、保留 7-Zip 顺序），
  其余测的是"换成 `ctx.subprocess` 之后仍然要说的那些话"。
- `tests/cli.spec.ts` / `tests/definition.spec.ts`：断清单词表逐字对上游、三条动作的参数表、
  danger 闸门、终端面的 flag 名单与"未接的腿响亮拒绝"。
- 没有 `it.skip` / `describe.skip` / 被删的断言（`grep` 那一类记号在 `tests/` 下命中 0）。

**减法跑 1（单测可证伪）**：把 `core.ts:249` 的 `namePrefix: "[#dyna]"` 故意改成 `""` ⇒
`pnpm --filter @hibernalglow/xaihi-gifu test:unit` **rc=1**，`Tests 2 failed | 52 passed (54)`，
点名 `normalizes native defaults…` 与 `plans same and separate output trees`，后者原话：
`expected 'D:\manga\vol01\chapter.tar.gif' to be 'D:\manga\vol01\[#dyna]chapter.tar.gif'`。已还原（sha256 与改前一致）。

**减法跑 2（本轮那条让步是承重的）**：把 `size?: number | undefined` 退成 `size?: number` ⇒
`test:unit` 仍 rc=0（它确实是纯类型），而 `typecheck` **rc=1** 并打印
`src/platform.ts(247,20): error TS2379 … Type 'number | undefined' is not assignable to type 'number'`。
已还原。⇒ 这条让步不是装饰，typecheck 的绿也不是空的。

## 六、门禁实测（2026-10-07 现读，六把尺全部当场跑）

| 尺 | rc | 摘录 |
| --- | --- | --- |
| `node scripts/check-verbatim.mjs --only gifu` | **1**（预期红） | `× plugins/gifu · core.ts 与基线不止差在自动放行的形状上：第 953 个字符起不等`，两侧文本只差 `Required<GifuInput>` 与 `{ [Key in keyof Required<GifuInput>]: NonNullable<GifuInput[Key]> }` |
| `pnpm --filter @hibernalglow/xaihi-gifu test:unit` | 0 | `Test Files 4 passed (4)` / `Tests 54 passed (54)` |
| `pnpm --filter @hibernalglow/xaihi-gifu typecheck` | 0 | `tsc --noEmit` 无输出 |
| `pnpm --filter @hibernalglow/xaihi-gifu build` | 0 | `✔ Build complete in 652ms`（`lib/index.js` 12.12 kB、`lib/cli.js` 20.31 kB） |
| `node scripts/check-node-bundle.mjs --only gifu` | 0 | `check-node-bundle: 比对 27 个节点包的产物` / `节点包产物里没有未声明的裸名 import`；`lib/*.js` 里 `import "@hibernalglow/xaihi-sdk"` 命中 0（本包依赖只有 `@deepseek-ai/schemastery`，SDK 已内联：`lib/index.js` 出现 `defineNode` 三处，实现在 `lib/lib-DLBWAEJL.js` 的 `function defineNode`） |
| `node scripts/gen-cli-registry.mjs --check` | 0 | `gen-cli-registry --check OK（26 条，逐条来自 plugins/*/package.json 的 bin + ./cli + ./help）` |

`package.json` 那四个字段本轮**一个都没改**（`bin.xgifu`、`exports['./cli']`、`exports['./help']`、
`xaihi.node.description.en` 都在），所以没跑写入版的 `gen-cli-registry.mjs`，
`packages/cli/src/node-cli-registry.generated.ts` 也没被本轮碰过。

## 七、什么仍然红，归谁

- `check-verbatim --only gifu` 的红**就是终点状态**，不是没做完：唯一差异是申报类的
  `NormalizedGifuInput` 记法。转绿的路径是 parent 正在加的申报机制
  （`node scripts/check-verbatim.mjs --declare … --reason …` 写 `docs/port/verbatim-deltas.json`），
  本轮无权也没必要替它申报。
- **申报要在本轮之后现读**：那条台账记的是本仓那份文件的 sha256，而 `core.ts` 本轮改过
  （829 行 / 让步四条）。任何在此之前算好的 gifu 指纹都会对不上，尺会判"申报的指纹对不上"。

## 八、没在这里覆盖的（说清没验的部分）

- 基线 `platform.integration.test.ts`（真 7-Zip + 真 ffmpeg 跑 gif/webp/apng/webm/mp4 五种格式）
  **没搬**：它要的是宿主进程里真的 `ctx.subprocess`。⇒ 真媒体编码今天是
  compile-verified + fake-seam 等级，实机验证留给接进宿主之后。
- 基线 `cli.test.ts` / `cli.visual.test.ts` / `Tui.bun.test.tsx` / `browser-boundary.test.ts`
  依赖本仓还没搬的 `interaction.ts` / `Tui.tsx` / `i18n.ts` 与 `@opentui/*` 那套 harness；
  那三条交互腿（`ui` / `gd` / `guided`）在 `src/cli.ts` 里以 `UNWIRED_INTERACTIVE_LEGS`
  标明并响亮拒绝（退出码 2），`tests/cli.spec.ts` 钉的就是"留在面板上并标明未接"。
- 本轮**没跑**：全仓 `pnpm test`（并发时段结果不可归因）、`pnpm install`、
  `check:pins` / `check:installable` / `check:brand`、宿主实机（`pnpm host`）、
  `plugins/gifu/frontend/` 与 `locale/` 那半边的任何验证。
