/**
 * dissolvef 的宿主半边：把 Xiranite 移植过来的内核接成一个 Xaihi 节点。
 *
 * 内核（`core.ts` / `platform.ts`）是从 `noxide` 基线逐字搬来的，唯一改动是
 * "默认历史路径的来源"（见 `platform.ts` 的注释与 `docs/adr/0003-...`）。
 * 因此这一侧只做三件事：把表单值绑成 `DissolvefInput`、把内核的过程事件接到运行账本、
 * 把危险动作交给 DSH 的审批缝。不重写内核逻辑，也不在这里偷偷加第二次文件系统。
 */

import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineNode, OPERATIONS_SERVICE, type OperationJournal } from '@hibernalglow/xaihi-sdk'
import { runDissolvef, type DissolvefAction, type DissolvefConflictMode, type DissolvefInput, type DissolvefMode } from './core.ts'
import { createNodeDissolvefRuntime } from './platform.ts'

export const name = '@hibernalglow/xaihi-dissolvef'

export const inject = ['tools']

export interface Config {
  /**
   * 撤销账本文件路径。内核需要一个**文件**路径（它写的是可被旧 Python 工具读的
   * 那份 undo journal），所以这里不给"默认到某个没人知道的地方"，而是要求显式设置：
   * 没设时 `plan` / `history` 照常，`dissolve` 会被内核要求历史路径而失败。
   */
  historyPath: Volatile<string>
}

export const Config = Schema.object({
  historyPath: Schema.string().default('').volatile(),
})

function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/** 模式选择器 → 内核要的四个布尔。放在这里是因为它是"表单形状"的一部分，不是内核逻辑。 */
function modeFlags(mode: unknown): Pick<DissolvefInput, 'nested' | 'media' | 'archive' | 'direct'> {
  switch (mode as DissolvefMode) {
    case 'nested':
      return { nested: true, media: false, archive: false, direct: false }
    case 'media':
      return { nested: false, media: true, archive: false, direct: false }
    case 'archive':
      return { nested: false, media: false, archive: true, direct: false }
    case 'direct':
      return { nested: false, media: false, archive: false, direct: true }
    default:
      // 缺省沿用内核自己选的 nested，与 Xiranite 命令行一致。
      return { nested: true, media: false, archive: false, direct: false }
  }
}

const conflict = (value: unknown, fallback: DissolvefConflictMode): DissolvefConflictMode =>
  value === 'auto' || value === 'skip' || value === 'overwrite' || value === 'rename' ? value : fallback

export function apply(ctx: Context, config: Config): void {
  defineNode(ctx, {
    definition: ownNodeDefinition(),
    // 每次调用现取：core 的 fiber 可能比本节点晚激活。
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers: {
      async plan({ inputs, run }) {
        const historyPath = config.historyPath.get()
        const result = await runDissolvef({
          action: 'plan',
          path: String(inputs.path ?? ''),
          ...modeFlags(inputs.mode),
          preview: true,
          exclude: String(inputs.exclude ?? ''),
          fileConflict: conflict(inputs.fileConflict, 'auto'),
          dirConflict: conflict(inputs.dirConflict, 'auto'),
          ...(historyPath === '' ? {} : { historyPath }),
        }, createNodeDissolvefRuntime())
        run.resultView({ plan: result.data?.plan ?? [], counts: result.data?.totalCount ?? 0 })
        if (!result.success) throw new Error(`dissolvef plan: ${result.message}`)
        return result.message
      },

      async dissolve({ inputs, run }) {
        const historyPath = config.historyPath.get()
        if (historyPath === '') {
          throw new Error('dissolvef: config.historyPath is unset, refusing to move files without an undo journal')
        }
        const runtime = createNodeDissolvefRuntime({ historyDir: dirname(historyPath) })
        const result = await runDissolvef({
          action: 'dissolve',
          path: String(inputs.path ?? ''),
          ...modeFlags(inputs.mode),
          exclude: String(inputs.exclude ?? ''),
          fileConflict: conflict(inputs.fileConflict, 'auto'),
          dirConflict: conflict(inputs.dirConflict, 'auto'),
          historyPath,
        }, runtime, (event) => {
          // 内核的 progress 是 0..1；接到运行账本时同时带上它说的话，界面才有可读进度。
          if (event.type === 'progress') run.progress({ done: Math.round((event.progress ?? 0) * 100), total: 100 })
          if (event.message !== '') run.preview({ message: event.message })
        })
        // 撤销这次需要的东西：历史文件 + 本次 operationId。这就是耐久账目里的 checkpoint。
        run.checkpoint({ historyPath, operationId: result.data?.operationId ?? null })
        run.resultView({
          success: result.success,
          moved: result.data?.successCount ?? 0,
          skipped: result.data?.skippedCount ?? 0,
          errors: result.data?.errors ?? [],
        })
        if (!result.success) throw new Error(`dissolvef: ${result.message}`)
        return result.message
      },

      async undo({ inputs, run }) {
        const historyPath = config.historyPath.get()
        if (historyPath === '') throw new Error('dissolvef: config.historyPath is unset, nothing to undo against')
        const undoId = String(inputs.undoId ?? '')
        const result = await runDissolvef({
          action: 'undo',
          historyPath,
          ...(undoId === '' ? {} : { undoId }),
        }, createNodeDissolvefRuntime({ historyDir: dirname(historyPath) }))
        run.resultView({ restored: result.data?.successCount ?? 0, errors: result.data?.errors ?? [] })
        if (!result.success) throw new Error(`dissolvef undo: ${result.message}`)
        return result.message
      },

      async history({ run }) {
        const historyPath = config.historyPath.get()
        if (historyPath === '') throw new Error('dissolvef: config.historyPath is unset')
        const result = await runDissolvef({ action: 'history', historyPath }, createNodeDissolvefRuntime())
        const records = result.data?.history ?? []
        run.resultView({ records })
        if (records.length === 0) return 'no dissolvef operations are recorded in this journal'
        return records.map((record) => `${record.id} ${record.timestamp} ${record.mode} ${record.operations.length} operation(s)`).join('\n')
      },
    },
  })
}

export type { DissolvefAction }
