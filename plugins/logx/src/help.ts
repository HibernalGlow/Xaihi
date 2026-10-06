/**
 * logx 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 上游这里是一份手写 `help.ts`，把标题/描述/命令再誊一遍英文样板，实测已经漂了
 * （内容与命令名都是旧壳时代的）。手抄的第二真源迟早骗人，所以这里只从清单推。
 * 推导器与它为什么叫 `Terminal*` 的说明在 `@hibernalglow/xaihi-sdk` 的 `help.ts`。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-logx/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('xaihi-logx: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'xlogx', command: '/logx' })
