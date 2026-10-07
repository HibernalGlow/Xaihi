/**
 * marku 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 上游这里是一份手写 `help.ts`（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/marku/src/help.ts`，106 行），内容是把手边的标题、描述与
 * `xiranite marku …` 那套命令再誊一遍英文样板。本仓的 bin 是 `xmarku`，那份手抄件说的是
 * 旧壳的命令名；照抄就会让使用者按帮助页敲一条不存在的命令。推导器与它为什么叫
 * `Terminal*` 的说明在 `@hibernalglow/xaihi-sdk` 的 `help.ts`。
 *
 * **只传 `bin`，不传 `command`**（台账 **G7**）：`command` 说的是宿主里那条无模型入口
 * `/marku`，而它存在的前提是本包 `inject` 里有 `commands` 并真注册——`src/index.ts` 的
 * `inject` 只有 `['tools']`，所以这里不许印一条宿主里不存在的斜杠命令。
 * （推导器本身对 `command` 有个 `/${nodeId}` 缺省值，那是 SDK 侧的事，改它不在本包权限内；
 * 本包的判据是"调用方不撒第二个谎"，见 `tests/cli.spec.ts` 那条结构尺。）
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-marku/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('xaihi-marku: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'marku' })
