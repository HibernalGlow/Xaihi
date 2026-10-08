/**
 * ClassF 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 上游这里是一份手写 `help.ts`（`packages/nodes/classf/src/help.ts`，77 行），把标题、
 * 描述与 `xiranite classf …` 那套命令再誊一遍英文样板（连 `--classify auto` 那些 flag
 * 都写死在里面）。手抄的第二真源迟早骗人：本仓的 bin 是 `classf`，位置参也不接受了。
 * 推导器与它为什么叫 `Terminal*` 的说明在 `@hibernalglow/xaihi-sdk` 的 `help.ts`。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * **这里不传 `command`**（与同批已落地的那几份不一样）：缺口台账 G7
 * （`docs/service-mapping.md` §缺口台账）记的是"`help.ts` 传了 `command:'/…'`，
 * 而 `inject` 里带 `commands` 的只有 `findz` 与 `sleept`"。本包 `inject` 只有 `tools`，
 * 宿主里没有 `/classf` 这条斜杠命令，帮助页就不该宣传它。判据钉在
 * `tests/definition.spec.ts`。注意这条偏离只堵住"包自己声明"那一半：推导器在
 * `command` 缺席时仍按 `/${nodeId}` 兜底（`packages/node-sdk/src/help.ts:108`），
 * 要让这一屏彻底不印 `/classf` 得改推导器本身（G7 的修法里那条"尺"要一起做）。
 *
 * @module xaihi-classf/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('@hibernalglow/xaihi-classf: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'classf' })
