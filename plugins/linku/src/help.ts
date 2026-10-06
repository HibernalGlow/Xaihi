/**
 * linku 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 上游这里是一份手写 `help.ts`（tag `noxide` 的 `packages/nodes/linku/src/help.ts`，140 行），
 * 把标题/描述/命令再誊一遍，命令名还写着旧壳的 `xiranite linku`（本仓的 bin 是 `xlinku`、
 * 无模型入口是 `/linku`）。手抄的第二真源迟早骗人，所以这里只从清单推。
 * 推导器与它为什么叫 `Terminal*` 的说明在 `@hibernalglow/xaihi-sdk` 的 `help.ts`。
 *
 * 上游清单 `help.commands` 里那两条"引导模式"的例子（`xiranite linku` 直接进 guided）
 * 随 guided 腿一起不随本包发布，推导器因此只会给出**脚本化**的两条
 * （`xlinku --help` 与每个动作一行）——这不是漏，是那条腿本就没搬。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-linku/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('xaihi-linku: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'xlinku', command: '/linku' })
