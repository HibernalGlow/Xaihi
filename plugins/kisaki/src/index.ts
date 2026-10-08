/**
 * kisaki 的宿主半边：Czkawka Rust 原生引擎去重与文件分析工作台。
 * @module xaihi-kisaki
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal, type OperationRun } from '@hibernalglow/xaihi-sdk'
import { runKisaki, type KisakiAction, type KisakiData, type KisakiInput, type KisakiTool } from './core.ts'
import { createNodeKisakiRuntime } from './platform.ts'
import { def } from './definition.ts'

export const name = '@hibernalglow/xaihi-kisaki'

export const inject = ['tools']

export interface Config {
  defaultTool: Volatile<string>
  recursive: Volatile<boolean>
  useCache: Volatile<boolean>
  saveAlsoAsJson: Volatile<boolean>
  cacheFolderPath: Volatile<string>
  configFolderPath: Volatile<string>
}

export const Config = Schema.object({
  defaultTool: Schema.string().default('duplicate-files').volatile(),
  recursive: Schema.boolean().default(true).volatile(),
  useCache: Schema.boolean().default(true).volatile(),
  saveAlsoAsJson: Schema.boolean().default(false).volatile(),
  cacheFolderPath: Schema.string().default('').volatile(),
  configFolderPath: Schema.string().default('').volatile(),
})

function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) {
    throw new Error('xaihi-kisaki: package.json 里没有 xaihi.node，节点清单无从注册')
  }
  return node
}

export function apply(ctx: Context, config: Config): void {
  const nodeDef = ownNodeDefinition()

  defineNode(ctx, {
    definition: nodeDef as any,
    run: async (input: KisakiInput, run: OperationRun, journal: OperationJournal) => {
      const mergedInput: KisakiInput = {
        tool: (input.tool || config.defaultTool || 'duplicate-files') as KisakiTool,
        recursive: input.recursive ?? config.recursive,
        useCache: input.useCache ?? config.useCache,
        saveAlsoAsJson: input.saveAlsoAsJson ?? config.saveAlsoAsJson,
        cacheFolderPath: input.cacheFolderPath || config.cacheFolderPath || undefined,
        configFolderPath: input.configFolderPath || config.configFolderPath || undefined,
        ...input,
      }

      journal.log(`Kisaki: 开始执行 ${mergedInput.action ?? 'scan'} · 工具: ${mergedInput.tool}`)

      const runtime = createNodeKisakiRuntime()
      const result = await runKisaki(mergedInput, runtime, (event) => {
        if (event.progress !== undefined) {
          journal.progress(event.progress, event.message)
        } else {
          journal.log(event.message)
        }
      })

      if (!result.success) {
        throw new Error(result.message)
      }

      journal.log(result.message)
      return result
    },
  })
}

export { def }
export default { def }
