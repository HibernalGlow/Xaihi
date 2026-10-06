/**
 * SmartZip 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 手写一份 help.ts 就是把标题、描述与命令再誊一遍英文样板，那是会漂的第二真源——同批节点
 * 实测过：内容还是旧壳时代的，命令名连 bin 都对不上。推导器与它为什么叫 `Terminal*` 的
 * 说明在 `@hibernalglow/xaihi-sdk` 的 help.ts。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-smartzip/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('@hibernalglow/xaihi-smartzip: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
//
// **不传 `command`**（缺口 G7）：那个参数说的是"宿主里真注册的无模型入口"，而本包的
// `inject` 只有 `tools` 与 `subprocess`，一条 `ctx.commands` 都没注册 ⇒ 本包没有资格
// 声明命令名。注意推导器自己的兜底是 `/${nodeId}`（`packages/node-sdk/src/help.ts` 里
// `options.command ?? '/'+nodeId`），所以产出的那一屏**仍会印 `/smartzip`** —— 那是
// SDK 的默认值而不是本包注册的入口；把这一格真正关掉要改的是推导器（把 `command` 变成
// "不给就不印那一块"），不在本包的写入范围里。`tests/cli.spec.ts` 钉的是本包不传它。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'xsmartzip' })
