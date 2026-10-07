/**
 * BitV 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 手写一份 help.ts 就是把标题、描述与命令再誊一遍英文样板，那是会漂的第二真源——同批节点
 * 实测过：内容还是旧壳时代的，命令名连 bin 都对不上。推导器与它为什么叫 `Terminal*` 的
 * 说明在 `@hibernalglow/xaihi-sdk` 的 help.ts。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-bitv/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('@hibernalglow/xaihi-bitv: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
//
// `command` **故意不传**：本包的 `inject` 里没有 `commands`（见 `src/index.ts`），也就没有
// `/bitv` 这条宿主侧斜杠命令。缺口台账 G7 记的就是"帮助页印了一条宿主里不存在的 `/id`"，
// 修法写明"只在包真注册时传"。这里今天只能少印一条真入口；推导器仍然会按 nodeId 兜出
// `/bitv` 那一格（`packages/node-sdk/src/help.ts:108` 的 `?? \`/${nodeId}\``），
// 那一刀在 SDK 侧，不在本包顺手改。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'bitv' })
