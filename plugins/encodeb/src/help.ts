/**
 * encodeb 的终端帮助载荷：**由 `package.json#xaihi.node` 推导**，不抄第二份。
 *
 * 上游这里是一份手写 `help.ts`（`<Xiranite>` tag `noxide` 的
 * `packages/nodes/encodeb/src/help.ts`，120 行），内容是把手边的标题、描述与
 * `xiranite encodeb …` 那套命令再誊一遍英文样板。本仓的 bin 是 `xencodeb`，
 * 那份手抄件说的是旧壳的命令名；照抄就会让使用者按帮助页敲一条不存在的命令。
 * 推导器与它为什么叫 `Terminal*` 的说明在 `@hibernalglow/xaihi-sdk` 的 `help.ts`。
 *
 * `command` 这一项**故意不传**（台账 **G7**）：本包的 `inject` 只有 `tools`，
 * 没有往宿主注册 `/encodeb` 那条无模型命令（`ctx.commands`），印出来就是一条点不到的命令。
 * 要传得先在本包 `contributes` 出 commands；在那之前这里是"正确的做法 + 已知的残留"：
 * 推导器在 `options.command` 缺席时仍会按 `/${nodeId}` 兜底（`packages/node-sdk/src/help.ts:108`），
 * 所以那一屏目前还会带一行 `/encodeb`。这一格不在本包权限内（只能改 SDK），
 * 已在报告里点名，测试按现状钉住它，免得日后 SDK 改掉兜底时这里静默变绿。
 *
 * 导出名 `help` 是聚合 CLI 定的：`packages/cli/src/index.ts` 里
 * `interface NodeHelpModule { help?: NodeHelp }`，按 `{packageName}/help` 动态装载。
 *
 * @module xaihi-encodeb/help
 */

import { createRequire } from 'node:module'
import { nodeHelpFromManifest, type TerminalNodeHelp } from '@hibernalglow/xaihi-sdk'

const require = createRequire(import.meta.url)
const manifest = require('../package.json') as {
  xaihi?: { node?: Parameters<typeof nodeHelpFromManifest>[0] }
}

const node = manifest.xaihi?.node
if (node === undefined) {
  throw new Error('xaihi-encodeb: package.json 里没有 xaihi.node，帮助页无从推导')
}

// 类型在这里点名：不写的话 dts 生成会报 TS4023（用了外部模块的类型却叫不出名字）。
// 只传 bin：见文件头那条 G7 判据（本包不 inject `commands`）。
export const help: TerminalNodeHelp = nodeHelpFromManifest(node, { bin: 'xencodeb' })
