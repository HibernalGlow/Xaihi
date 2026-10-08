/**
 * linedup 的宿主半边：节点定义只有 `package.json#xaihi.node` 一份真源，
 * 工具注册读它；清单与代码不会各说一套。
 *
 * 这里是纯计算，所以危险闸门是 `none`：DSH 的 approval 缝只在有副作用的动作上才需要。
 */

import { createRequire } from 'node:module'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal } from '@hibernalglow/xaihi-sdk'
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
    // core 的 fiber 可能比本节点晚激活，注册时读一次会永久读空，所以每次调用现取。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async filter({ inputs, run }) {
        const source = Array.isArray(inputs.sourceLines)
          ? (inputs.sourceLines as string[])
          : splitLines(String(inputs.sourceText ?? ''))
        const targetFilters = Array.isArray(inputs.filterLines)
          ? (inputs.filterLines as string[])
          : splitLines(String(inputs.filterText ?? ''))
        const result = filterLines({
          sourceLines: source,
          filterLines: targetFilters,
          caseSensitive: inputs.caseSensitive !== false,
          sort: inputs.sort !== false,
        })
        // 纯计算没有中间态，所以只发结果视图：定义里承诺的 resultExport 到此才真的有人发。
        //
        // 形状必须是 `core.ts` 那份 `LinedupFilterResult` **逐字**，不能另起一套短名：
        // 面板（`ui-host/src/nodes/linedup/ResultPanels.tsx:54,65` 与 `model.ts:52`）
        // 与终端面（`cli.ts:182,190`）读的都是 `filteredLines` / `removedLines`。
        // 曾经这里发的是 `kept` / `removed`，症状是"计数对了（keptCount 同名）、
        // 列表页整个崩"—— 端到端判据在 `ui-host/tests/local-runner-e2e.spec.tsx` 里钉住了它。
        run.resultView(result)
        return [
          `${config.label.get()} · kept ${String(result.keptCount)}, removed ${String(result.removedCount)}`,
          ...result.filteredLines.map((line) => `+ ${line}`),
          ...result.removedLines.map((line) => `- ${line}`),
        ].join('\n')
      },
    },
  })
}
