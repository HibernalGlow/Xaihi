/**
 * formatv 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 上游这里是一份手写 `help.ts`（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/formatv/src/help.ts`，120 行），内容是把手边的标题、描述与
 * `xiranite formatv …` 那套命令再誊一遍英文样板。本仓的 bin 是 `xformatv`、
 * 无模型入口是 `/formatv`，那份手抄件说的是旧壳的命令名；照抄就会让使用者按帮助页
 * 敲一条不存在的命令。推导器与它为什么叫 `Terminal*` 的说明在
 * `@hibernalglow/xaihi-sdk` 的 `help.ts`。
 *
 * 四个动作 `scan` / `add_nov` / `remove_nov` / `check_duplicates` 在推导结果里
 * 同时出现在两处：`commands[].examples` 用 `xformatv <action>`，而终端面的子命令名是
 * `add-nov` / `remove-nov` / `duplicates`（上游 `cli.ts:194-214` 的 kebab 拼法）。
 * 这条落差是上游本来就有的（帮助页与子命令名不是一套字），这里不替它统一，
 * 也不在推导器之外补一份"真实命令表"。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-formatv/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('xaihi-formatv: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'formatv', command: '/formatv' })
