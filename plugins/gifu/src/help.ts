/**
 * Gifu 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 手写一份 help.ts 就是把标题、描述与命令再誊一遍英文样板，那是会漂的第二真源——同批节点
 * 实测过：内容还是旧壳时代的，命令名连 bin 都对不上。推导器与它为什么叫 `Terminal*` 的
 * 说明在 `@hibernalglow/xaihi-sdk` 的 help.ts。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * **不给 `command` 这一格**（缺口 G7，`docs/service-mapping.md`）：推导器的 `command` 参数
 * 说的是"这个包在 `ctx.commands` 上真注册了一条 `/id`"，而本包的 `src/index.ts` 里
 * `inject = ['tools', 'subprocess']`，**没有 `commands`** ⇒ 本包不传那条参数，也不许印一条
 * 宿主里不存在的斜杠命令。这一格由推导器自己的缺省（`/${nodeId}`）填，所以
 * `packages/node-sdk/src/help.ts:108` 那一条行为与"传了 `/gifu`"相同，差别在**这份代码没有
 * 代替宿主承诺它没注册的东西**；`gen-cli-registry` 之外还没有尺管这条（G7 的修法原文），
 * 所以本包按口径不传，而不是靠那条缺省看起来一样就随便传。
 *
 * @module xaihi-gifu/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('@hibernalglow/xaihi-gifu: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'gifu' })
