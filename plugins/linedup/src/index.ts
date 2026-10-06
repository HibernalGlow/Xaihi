/**
 * linedup 的宿主半边：节点定义只有 `package.json#xaihi.node` 一份真源，
 * 工具注册读它；清单与代码不会各说一套。
 *
 * 这里是纯计算，所以危险闸门是 `none`：DSH 的 approval 缝只在有副作用的动作上才需要。
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode } from '@hibernalglow/xaihi-sdk'
import { filterLines, splitLines } from './core.ts'

export const name = '@hibernalglow/xaihi-linedup'

export const inject = ['tools']

export interface Config {
  /** 结果前缀标签，用于验证配置真的在使用点被读到。 */
  label: Volatile<string>
}

export const Config = Schema.object({
  label: Schema.string().default('linedup').volatile(),
})

/** 本包自己的清单；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    handlers: {
      async filter({ inputs }) {
        const result = filterLines({
          sourceLines: splitLines(String(inputs.sourceText ?? '')),
          filterLines: splitLines(String(inputs.filterText ?? '')),
          caseSensitive: inputs.caseSensitive !== false,
          sort: inputs.sort !== false,
        })
        return [
          `${config.label.get()} · kept ${String(result.keptCount)}, removed ${String(result.removedCount)}`,
          ...result.filteredLines.map((line) => `+ ${line}`),
          ...result.removedLines.map((line) => `- ${line}`),
        ].join('\n')
      },
    },
  })
}
