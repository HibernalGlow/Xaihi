# 内核保真分诊：四个先于尺子落地的包

基线 = noxide `ccf465fe`（`/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide`），尺 = `scripts/check-verbatim.mjs`。
这四个包的内核在尺子出现之前就搬进仓，带着未申报的偏差。逐包判决如下。

## linedup — restored（还原基线文本，无申报）

`plugins/linedup/src/core.ts` 搬漏了：本仓 3024 字节 vs 基线 3773 字节。还原内容：

- 补缺失的四个声明：`createDiffRows`、`LinedupReadStats`、`findDuplicateLines`、`analyzeReadLines`
  （基线 58–93 行，位置在 `filterLines` 与 `LinedupRemovalDetail` 之间）。
- 引号风格：`splitLines` / `localeSort` 里单引号还原成基线的双引号（本仓无 prettier/eslint 强制单引号，实测确认）。
- 去掉本仓多加的 `: string` 返回类型标注（`normalizeCompare` 两处）、还原 `filterLines` 里 `if/else` 的花括号写法。

结果：`node scripts/check-verbatim.mjs --only linedup` RC=0（绿，非申报）。测试补了 `createDiffRows`/`findDuplicateLines`/`analyzeReadLines`
三条断言（期望值手抄自基线 `core.test.ts`）；把 `findDuplicateLines` 的 `count > 1` 改成 `count >= 1` 做一次减法运行，
两条断言立刻红（`Tests 2 failed | 16 passed`），还原后 `Test Files 2 passed / Tests 18 passed`。

## linku — declared（noUncheckedIndexedAccess 让步）

唯一差异在 `parseLinkRecords`：基线 `const key = rawKey.trim()`，本仓 `const key = (rawKey ?? "").trim()`。
`const [rawKey, ...] = line.split("=")` 在 `noUncheckedIndexedAccess` 下 `rawKey` 类型为 `string | undefined`，基线那句类型报错。
`?? ""` 只收窄类型：`line.includes("=")` 已保证至少一段，最坏空串，`"".trim()` 对不上任何键名，与上游一样跳过。
归一化 diff 反证：撤销这一处后全文件与基线逐字符相等（仅 import 说明符文本，属自动放行）。台账：`plugins/linku/src/core.ts`。

## logx — declared（exactOptionalPropertyTypes 类型层让步）

唯一差异是 `normalizeLogxInput` 返回类型：基线派生式 `Required<Omit<LogxInput, 7 文本键>> & Pick<LogxInput, 7 文本键>`，
本仓摊开手写成 `export interface NormalizedLogxInput`。成员逐一核对（Required 侧 4 个：`action/minimumSeverity/limit/order`；
Pick 侧 7 个：`directory/scope/eventName/sessionId/search/since/until`），无删除、无收窄、函数体逐字节相同。
不是"只申报"就过关——做了实测：把基线派生式换回 `core.ts` 跑 `typecheck`，RC=2 报两处
（`src/core.ts(121)` `minimumSeverity: LogSeverityText | undefined` 不可赋给 `LogQuery.minimumSeverity`；`(178)` `LogxAction | undefined`），
证实派生式在本仓 `exactOptionalPropertyTypes` 下无法照抄（`Required<>` 只去 `?`、留下 `| undefined`），是纯类型层让步。
撤销临时改动后恢复手写形态。台账：`plugins/logx/src/core.ts`。

## recycleu — declared（noUncheckedIndexedAccess，实测行为空让步）

唯一差异是 `normalizeDriveLetter` 末句：基线 `return match ? match[1].toUpperCase() : ""`，本仓 `return match?.[1]?.toUpperCase() ?? ""`。
`match[1]` 在 `noUncheckedIndexedAccess` 下类型为 `string | undefined`，基线那句类型报错。判决靠实测：
正则 `/^([a-zA-Z])(?::)?$/` 的捕获组 1 `([a-zA-Z])` 是必选组（`(?::)?` 只是可选非捕获冒号），整条命中时组 1 必然存在且为单字母，永不为 undefined。
探针集 `("","c","C","c:","C:","cc",":","1","a:","z","Z ","  ","Q")`：命中且组 1 为 undefined 的输入 = 0，两种写法输出逐个相等。
故 `?.`/`?? ""` 只收窄类型不改语义（不需要还原成 `!`，因为让步本身就是空操作）。
归一化 diff 反证：撤销这一处后全文件与基线逐字符相等。台账：`plugins/recycleu/src/core.ts`。

## 门禁读数（真实 rc）

- 全量 `node scripts/check-verbatim.mjs`：红由 7 降到 3（余 `findz`、`gifu`、`sleept`，非本次范围）；`--self-check` RC=0。
- 四包各自 `test:unit` / `typecheck` / `build` 全部 RC=0。
- `node scripts/check-node-bundle.mjs`：RC=0（本次运行 gifu 未红）。
