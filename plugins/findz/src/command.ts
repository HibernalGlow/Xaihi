/**
 * `/findz` 的命令行解析（纯函数）。
 *
 * 为什么 findz 要有这条路：面板按 `.dsh/skills/xaihi-node-ui/SKILL.md` 的判据只能
 * 走"DSH 的命令入口"，不许自建 RPC。13 个动作里带路径参数的（`open_library`）没法
 * 压成一个按钮就完事的调用，所以位置参数表得有个**可测的**真源，而不是散在按钮里。
 *
 * 这一层刻意比动作清单**窄**：命令只覆盖面板要按的那几个形状（`start`），
 * `treemap` 的文本过滤与 `pathPrefix`、翻页游标 `pageCursor`、分页 `pageLimit`
 * 等仍然只有工具路径（agent + 表单）能到。这不是遗漏，见 `README.md` 的"命令面"。
 *
 * 词表从定义里**读**、不在这里重抄：`areaBy` / `scopeKind` 的合法值取自
 * `package.json#xaihi.node`，`tests/command.spec.ts` 钉住这一点，清单改了就红。
 *
 * @module xaihi-findz/command
 */

import type { NodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { FindzAction } from './core.ts'

/** 短名 → 动作 id。两条路都收（`/findz query` 与 `/findz query_archives` 等价）。 */
const ALIASES: Record<string, FindzAction> = {
  api: 'api_info',
  api_info: 'api_info',
  open: 'open_library',
  open_library: 'open_library',
  close: 'close_library',
  close_library: 'close_library',
  scan: 'scan',
  analyze: 'analyze',
  query: 'query_archives',
  query_archives: 'query_archives',
  members: 'query_members',
  query_members: 'query_members',
  export: 'export_rows',
  export_rows: 'export_rows',
  treemap: 'treemap',
  task: 'task',
  pause: 'pause',
  resume: 'resume',
  cancel: 'cancel',
}

/** 命令里位置参数的形状；`args` 用的是定义里的字段 id，交给 `bindInputs` 绑。 */
export type ParsedUsage =
  | { kind: 'help' }
  | { kind: 'invoke'; action: FindzAction; args: Record<string, unknown> }
  | { kind: 'error'; text: string }

const USAGE: Array<{ pattern: string; zh: string }> = [
  { pattern: '/findz', zh: '列出这条帮助' },
  { pattern: '/findz api', zh: '内核自述（ABI、能力集、支持的图像格式）' },
  { pattern: '/findz open <libraryId> <库根目录>', zh: '打开库；库根可以带空格，取到行尾' },
  { pattern: '/findz scan <libraryId>', zh: '扫描库（只读目录与 ZIP 中央目录）' },
  { pattern: '/findz query <libraryId> [文本…]', zh: '按文本查归档，默认按大小降序' },
  { pattern: '/findz members <libraryId> <archiveId> [文本…]', zh: '查某个归档的成员' },
  { pattern: '/findz export <libraryId> [文本…]', zh: '按同样条件导出结果行（只回数据）' },
  { pattern: '/findz treemap <libraryId> [面积指标]', zh: '投影矩形图；面积指标见下表' },
  { pattern: '/findz analyze <libraryId> [all|archives|members] [deep]', zh: '读图像头信息；deep 把预算提到 8/16 MiB' },
  { pattern: '/findz close <libraryId>', zh: '关闭库并释放索引连接' },
  { pattern: '/findz task|pause|resume|cancel <libraryId> <taskId>', zh: '任务状态与控制' },
]

/** 帮助文本。合法值从定义里取，所以它不会和清单说两套话。 */
export function helpText(definition: NodeDefinition): string {
  const optionsOf = (fieldId: string): string[] => {
    const field = definition.fields.find((candidate) => candidate.id === fieldId)
    return (field?.options ?? []).map((option) => option.value)
  }
  return [
    'findz — 归档检索（进程外 Go 内核）',
    ...USAGE.map((entry) => `  ${entry.pattern.padEnd(52)}${entry.zh}`),
    `  面积指标: ${optionsOf('areaBy').join(' | ')}`,
    `  分析范围: ${optionsOf('scopeKind').join(' | ')}`,
    '  分页、路径前缀、游标只有工具路径（agent）能到，命令面不覆盖。',
  ].join('\n')
}

/**
 * 解析 `ctx.commands.register({name:'findz'})` 收到的 `rawInput`。
 *
 * @param rawInput - `/findz` 之后的那一段（DSH 已经剥掉命令名）。
 * @param definition - 已校验的节点定义，用来取 `areaBy` / `scopeKind` 的合法值。
 * @returns 帮助、一次 `node.invoke` 的入参，或一段给使用者看的错误。
 */
export function parseFindzCommand(rawInput: string, definition: NodeDefinition): ParsedUsage {
  const parts = rawInput.trim().split(/\s+/).filter((part) => part !== '')
  const head = parts[0]
  if (head === undefined || head === 'help') return { kind: 'help' }

  const action = ALIASES[head]
  if (action === undefined) {
    return { kind: 'error', text: `unknown findz action ${JSON.stringify(head)} — try /findz` }
  }
  const rest = parts.slice(1)
  const need = (count: number, pattern: string): string | undefined =>
    rest.length < count ? `findz ${action} needs ${pattern}, got ${String(rest.length)} argument(s)` : undefined

  if (action === 'api_info') {
    if (rest.length > 0) return { kind: 'error', text: 'findz api takes no arguments' }
    return { kind: 'invoke', action, args: { action } }
  }

  if (action === 'open_library') {
    const missing = need(2, '<libraryId> <libraryRoot>')
    if (missing !== undefined) return { kind: 'error', text: missing }
    // 库根目录取到行尾：`/tmp/My Comix` 这类带空格的路径不该逼使用者去引号。
    return { kind: 'invoke', action, args: { action, libraryId: rest[0], libraryRoot: rest.slice(1).join(' ') } }
  }

  if (action === 'scan' || action === 'close_library') {
    const missing = need(1, '<libraryId>')
    if (missing !== undefined) return { kind: 'error', text: missing }
    if (rest.length > 1) return { kind: 'error', text: `findz ${action} takes exactly one argument` }
    return { kind: 'invoke', action, args: { action, libraryId: rest[0] } }
  }

  if (action === 'task' || action === 'pause' || action === 'resume' || action === 'cancel') {
    const missing = need(2, '<libraryId> <taskId>')
    if (missing !== undefined) return { kind: 'error', text: missing }
    if (rest.length > 2) return { kind: 'error', text: `findz ${action} takes exactly two arguments` }
    return { kind: 'invoke', action, args: { action, libraryId: rest[0], taskId: rest[1] } }
  }

  if (action === 'analyze') {
    const missing = need(1, '<libraryId> [all|archives|members] [deep]')
    if (missing !== undefined) return { kind: 'error', text: missing }
    const kinds = declaredOptions(definition, 'scopeKind')
    const args: Record<string, unknown> = { action, libraryId: rest[0] }
    for (const token of rest.slice(1)) {
      if (token === 'deep') {
        if (args.deepRetry === true) return { kind: 'error', text: 'findz analyze: deep given twice' }
        args.deepRetry = true
        continue
      }
      if (!kinds.includes(token)) {
        return { kind: 'error', text: `findz analyze: ${JSON.stringify(token)} is not a scope (${kinds.join(' | ')}) or deep` }
      }
      if (args.scopeKind !== undefined) return { kind: 'error', text: 'findz analyze: scope given twice' }
      args.scopeKind = token
    }
    return { kind: 'invoke', action, args }
  }

  if (action === 'treemap') {
    const missing = need(1, '<libraryId> [areaBy]')
    if (missing !== undefined) return { kind: 'error', text: missing }
    const areas = declaredOptions(definition, 'areaBy')
    const args: Record<string, unknown> = { action, libraryId: rest[0] }
    if (rest.length > 2) {
      return { kind: 'error', text: 'findz treemap: text filter and path prefix are agent-only; see /findz' }
    }
    if (rest[1] !== undefined) {
      if (!areas.includes(rest[1])) {
        return { kind: 'error', text: `findz treemap: ${JSON.stringify(rest[1])} is not an area metric (${areas.join(' | ')})` }
      }
      args.areaBy = rest[1]
    }
    return { kind: 'invoke', action, args }
  }

  if (action === 'query_members') {
    const missing = need(2, '<libraryId> <archiveId> [text…]')
    if (missing !== undefined) return { kind: 'error', text: missing }
    const archiveId = toPositiveInteger(rest[1])
    if (archiveId === undefined) {
      return { kind: 'error', text: `findz members: ${JSON.stringify(rest[1])} is not an archive id` }
    }
    return { kind: 'invoke', action, args: { action, libraryId: rest[0], archiveId, ...textArg(rest.slice(2)) } }
  }

  // query_archives / export_rows：一个库 id，其余是文本过滤。
  const missing = need(1, '<libraryId> [text…]')
  if (missing !== undefined) return { kind: 'error', text: missing }
  return { kind: 'invoke', action, args: { action, libraryId: rest[0], ...textArg(rest.slice(1)) } }
}

function declaredOptions(definition: NodeDefinition, fieldId: string): string[] {
  const field = definition.fields.find((candidate) => candidate.id === fieldId)
  return (field?.options ?? []).map((option) => option.value)
}

const textArg = (tokens: string[]): Record<string, unknown> => (tokens.length === 0 ? {} : { text: tokens.join(' ') })

function toPositiveInteger(token: string): number | undefined {
  if (!/^[0-9]+$/.test(token)) return undefined
  const value = Number.parseInt(token, 10)
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined
}
