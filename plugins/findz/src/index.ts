/**
 * findz 的宿主半边：13 个动作 → 一个进程外的 Go 索引内核。
 *
 * 三件事各自归位，与 sleept / dissolvef 同一套分工：
 *
 * - 动作怎么翻译成一次内核调用：`core.ts`（逐字移植，不认识宿主）。
 * - 进程怎么起、帧怎么收发：`gateway.ts`（ADR-0004 那条边界）。
 * - 表单值怎么变成 `FindzInput`、进度怎么接到运行账本：本文件。
 *
 * 定义只有一份真源：`package.json#xaihi.node`。本文件从它**读**动作清单来生成
 * handler 表，而不是另写一张 id 表 —— 否则"清单里多一个动作、实现里少一个"这类
 * 分叉只能靠人盯。
 *
 * 危险闸门：findz v2 的 13 个动作没有一个会动使用者的文件（`findz-v2-design.md`：
 * "No member is extracted to disk"），索引只写自己那一个 SQLite。所以定义里是
 * `danger: {type:'none'}`，与上游一致；安全边界靠内核自己的归档路径策略。
 *
 * @module xaihi-findz
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Context, Volatile } from '@deepseek-ai/cordis'
// 只取类型：它的 `declare module '@deepseek-ai/cordis'` 补上 `ctx.commands`，
// 运行时实现由宿主提供，本包不在产物里引它。
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import Schema from '@deepseek-ai/schemastery'
import {
  dangerFor,
  defineNode,
  OPERATIONS_SERVICE,
  validateNodeDefinition,
  type NodeCall,
  type NodeDefinition,
  type NodeHandlers,
  type OperationJournal,
} from '@hibernalglow/xaihi-sdk'
import { helpText, parseFindzCommand } from './command.ts'
import { runFindzWithGateway, type FindzAction, type FindzInput, type FindzResult } from './core.ts'
import { startFindzHost, type FindzHost } from './gateway.ts'
import type { FindzAnalysisScope, FindzArchiveQuery, FindzPage, FindzTask } from './contract.ts'

export const name = '@hibernalglow/xaihi-findz'

export const inject = ['tools', 'subprocess', 'commands']

export interface Config {
  /**
   * 每个库的索引 SQLite 落在哪个目录。
   *
   * 留空时 `open_library` **拒绝动手**，而不是让内核退回它自己的默认路径
   * （`$LOCALAPPDATA/Xiranite/findz/indexes/`，非 Windows 退到 `os.UserCacheDir()`）。
   * 理由与 `docs/adr/0003-migrated-node-file-state.md` 里 `historyPath` 的那条相同：
   * 索引库是使用者的数据，不把它写进一个以别的产品命名的目录。
   */
  indexDir: Volatile<string>
  /**
   * `findz-host` 可执行文件的绝对路径。留空则按平台可选依赖包解析
   * （`@hibernalglow/xaihi-findz-<platform>-<arch>`）。本仓开发期指向
   * `native/findz-go/dist/findz-host`（见 `README.md`）。
   */
  hostBinary: Volatile<string>
}

export const Config = Schema.object({
  indexDir: Schema.string().default('').volatile(),
  hostBinary: Schema.string().default('').volatile(),
})

/** 本包自己的节点定义；读不到就是打包/安装出错，宁可直接抛。 */
function ownNodeDefinition(): unknown {
  const pkg = createRequire(import.meta.url)('../package.json') as { xaihi?: { node?: unknown } }
  const node = pkg.xaihi?.node
  if (node === undefined) throw new Error(`${name}: package.json#xaihi.node is missing`)
  return node
}

/** 平台可选依赖包的短名。 */
export function platformPackageOf(platform: string, arch: string): string {
  return `@hibernalglow/xaihi-findz-${platform}-${arch}`
}

/**
 * 定出 `findz-host` 的路径。
 *
 * 显式给的路径优先；否则按平台可选依赖包解析 `bin/findz-host`。**解析不到就抛**，
 * 而不是等第一次搜索给出"空结果" —— ADR-0004 决定 3 的原话是"节点在装载期就报"。
 *
 * @param options - 显式路径、当前平台与架构、以及一个解析器（测试用替身）。
 * @returns 可执行文件的绝对路径。
 * @throws 显式路径为空且该平台没有对应内核包。
 */
export function resolveHostBinary(options: {
  override: string
  platform: string
  arch: string
  resolvePackage(specifier: string): string
}): string {
  const override = options.override.trim()
  if (override !== '') return override
  const specifier = `${platformPackageOf(options.platform, options.arch)}/bin/findz-host`
  try {
    return options.resolvePackage(specifier)
  } catch {
    throw new Error(
      `findz: no core binary for ${options.platform}-${options.arch} (install ${platformPackageOf(options.platform, options.arch)}, or set config.hostBinary)`,
    )
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** 库 id 会被用作索引文件名，所以它必须是一个文件名而不是一段路径。 */
const LIBRARY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * 表单值 → `FindzInput`（`core.ts` 的入参）。
 *
 * 纯函数，因为它属于"表单形状"而不是"内核逻辑"：内核只认 `FindzInput`。
 * `libraryRoot` + `indexDir` 拼成 `library.databasePath` —— **路径由本节点决定，
 * 内核只接受**（ADR-0003 同一条理由）。
 *
 * @param action - 已由定义约束在词表内的动作 id。
 * @param inputs - 按 `inputBindings` 绑好的槽位。
 * @param indexDir - 索引目录；空串表示没配。
 * @throws 缺库 id / 库根 / 索引目录，或库 id 不是合法文件名。
 */
export function toFindzInput(action: FindzAction, inputs: Record<string, unknown>, indexDir: string): FindzInput {
  if (action === 'api_info') return { action }

  const libraryId = text(inputs.libraryId)
  if (libraryId === '') throw new Error('findz: libraryId is required')
  if (!LIBRARY_ID.test(libraryId)) {
    throw new Error(`findz: libraryId ${JSON.stringify(libraryId)} is not a usable index file name`)
  }

  if (action === 'open_library') {
    if (indexDir.trim() === '') {
      throw new Error('findz: config.indexDir is unset, refusing to open a library at an implicit index location')
    }
    const root = text(inputs.libraryRoot)
    if (root === '') throw new Error('findz: libraryRoot is required')
    return { action, libraryId, library: { libraryId, root, databasePath: join(indexDir, `${libraryId}.sqlite`) } }
  }

  if (action === 'scan' || action === 'close_library') return { action, libraryId }

  if (action === 'analyze') {
    const kind = text(inputs.scopeKind)
    const analysisScope: FindzAnalysisScope = { kind: kind === 'archives' || kind === 'members' ? kind : 'all' }
    if (inputs.deepRetry === true) analysisScope.deepRetry = true
    return { action, libraryId, analysisScope }
  }

  if (action === 'task' || action === 'pause' || action === 'resume' || action === 'cancel') {
    const taskId = text(inputs.taskId)
    if (taskId === '') throw new Error('findz: taskId is required')
    return { action, libraryId, taskId }
  }

  const rawQuery = (typeof inputs.query === 'object' && inputs.query !== null ? inputs.query : {}) as Record<string, unknown>
  const rawPage = (typeof rawQuery.page === 'object' && rawQuery.page !== null ? rawQuery.page : {}) as Record<string, unknown>

  const page: FindzPage = {}
  const limit = typeof inputs.pageLimit === 'number' ? inputs.pageLimit : rawPage.limit
  if (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0) page.limit = limit
  const cursor = text(inputs.pageCursor) || text(rawPage.cursor)
  if (cursor !== '') page.cursor = cursor

  const search = text(inputs.text)
  const pathPrefix = text(inputs.pathPrefix)
  const prefix = pathPrefix === '' ? {} : { pathPrefix }

  if (action === 'treemap') {
    const areaBy = text(inputs.areaBy)
    return {
      action,
      libraryId,
      text: search,
      ...prefix,
      ...(areaBy === '' ? {} : { areaBy }),
      query: { page, ...(rawQuery.rules !== undefined ? { rules: rawQuery.rules as never } : {}) },
    }
  }
  if (action === 'query_members') {
    const archiveId = inputs.archiveId
    if (typeof archiveId !== 'number' || !Number.isSafeInteger(archiveId) || archiveId < 1) {
      throw new Error('findz: archiveId is required')
    }
    return { action, libraryId, archiveId, text: search, query: { page } }
  }

  const query: Omit<FindzArchiveQuery, 'libraryId'> = { ...(rawQuery as Omit<FindzArchiveQuery, 'libraryId'>) }
  const sortBy = text(inputs.sortBy) || text(rawQuery.sortBy)
  if (sortBy !== '') query.sortBy = sortBy
  if (inputs.sortDesc === true || rawQuery.sortDesc === true) query.sortDesc = true
  if (Object.keys(page).length > 0) query.page = page
  return { action, libraryId, text: search, query, ...prefix }
}

const MAX_ROWS = 20

const taskLine = (task: FindzTask): string =>
  `task ${task.id} · ${task.kind} · ${task.status} · archives ${String(task.doneArchives)}/${String(task.totalArchives)} · members ${String(task.doneMembers)}/${String(task.totalMembers)}${task.message === '' ? '' : ` · ${task.message}`}`

/**
 * 把内核的数据结构压成一段可读文本。
 * 面板侧读 `result_view` 里的同一份 `data`，所以两条路不会给出两套数字。
 */
export function renderResult(result: FindzResult): string {
  const lines: string[] = [result.message]
  const data = result.data
  if (data === undefined) return lines.join('\n')
  if (data.apiInfo !== undefined) {
    lines.push(`core ${data.apiInfo.coreVersion} · abi ${String(data.apiInfo.abiVersion)} · ${String(data.apiInfo.capabilities.length)} capabilities`)
    lines.push(`formats: ${data.apiInfo.supportedFormats.join(', ')}`)
  }
  if (data.library !== undefined) {
    lines.push(`library ${data.library.libraryId} · root ${data.library.root}`)
    lines.push(`index ${data.library.databasePath} · archives ${String(data.library.archiveCount)} · members ${String(data.library.memberCount)} · watcher ${data.library.watcherHealth}`)
  }
  if (data.task !== undefined) lines.push(taskLine(data.task))
  if (data.archives !== undefined || data.members !== undefined) {
    const page = data.archives ?? data.members
    const rows = data.archives?.items.map(
      (row) => `${String(row.id)} · ${row.relativePath} · ${String(row.size)} B · ${String(row.memberCount)} member(s) · ${String(row.imageMemberCount)} image(s)${row.errorCode === undefined ? '' : ` · ${row.errorCode}`}`,
    ) ?? (data.members?.items ?? []).map(
      (row) => `${String(row.id)} · ${row.memberPath} · ${String(row.compressedSize)} B${row.actualFormat === undefined ? '' : ` · ${row.actualFormat} ${String(row.width ?? '?')}x${String(row.height ?? '?')}`}${row.anomalyKind === undefined ? '' : ` · ${row.anomalyKind}`}`,
    )
    lines.push(`${String(page?.total ?? rows.length)} row(s) in this query`)
    for (const row of rows.slice(0, MAX_ROWS)) lines.push(row)
    if (rows.length > MAX_ROWS) lines.push(`… ${String(rows.length - MAX_ROWS)} more on this page`)
    if (page !== undefined && page.nextCursor !== undefined && page.nextCursor !== '') lines.push(`nextCursor: ${page.nextCursor}`)
  }
  if (data.treemap !== undefined) {
    lines.push(`treemap ${data.treemap.name} · value ${String(data.treemap.value)} · ${String((data.treemap.children ?? []).length)} child node(s)`)
  }
  return lines.join('\n')
}

/**
 * 命令路径上的危险闸门判据。
 *
 * `node.invoke` 不过 `tools/pre-execute`，所以命令入口**不能**成为危险动作的后门。
 * 这个函数就是那条守卫，单独抽出来是因为它必须能被测：findz 现在的定义是
 * `danger:{type:'none'}`，走真定义的守卫不会触发，只有拿一份 `actionIn` 的替身定义
 * 才量得到它确实拦得住（`tests/command.spec.ts`）。
 *
 * @param definition - 已校验的节点定义；危险语义的真源就在它的 `danger` 里。
 * @param action - 本次动作 id。
 * @param args - 本次参数（`fieldFlag` / `all` / `any` 型闸门要读它）。
 * @returns 拒绝时给出可直接回给使用者的一句话。
 */
export function gateReason(definition: NodeDefinition, action: string, args: Record<string, unknown>): string | undefined {
  if (dangerFor(definition, undefined, action, args) === undefined) return undefined
  return `refused /findz ${action}: gated as dangerous, run it through the agent so DSH can ask for approval`
}

export function apply(ctx: Context, config: Config): void {
  // 定义先校验一次：动作清单要用来生成 handler 表，必须是同一个真源。
  const validated = validateNodeDefinition(ownNodeDefinition())
  if (!validated.ok) throw new Error(`xaihi.node/v1 invalid: ${validated.errors.join('; ')}`)
  const definition = validated.value

  // 装载期就定路径：该平台没有内核包时这里就炸，而不是等第一次搜索。
  const binaryPath = resolveHostBinary({
    override: config.hostBinary.get(),
    platform: process.platform,
    arch: process.arch,
    resolvePackage: (specifier) => createRequire(import.meta.url).resolve(specifier),
  })

  // 内核宿主持有打开的库与 SQLite 连接：一个插件实例一个进程，卸载时树级终止。
  // 第一次动作才真起进程 —— 无头 profile 里不该有一个空转的索引进程。
  let pending: Promise<FindzHost> | undefined
  const host = (): Promise<FindzHost> => {
    pending ??= startFindzHost(ctx.subprocess, { binaryPath, cwd: process.cwd() })
    // 起不来就不要把这个失败的 promise 永久记住，否则一次启动失败等于节点永久不可用。
    pending.catch(() => { pending = undefined })
    return pending
  }
  ctx.effect(() => () => {
    const started = pending
    if (started !== undefined) void started.then((live) => { live.dispose() }, () => undefined)
  }, 'findz: terminate the core host on unload')

  const runAction = async (actionId: FindzAction, call: NodeCall): Promise<string> => {
    // 先翻译再起进程：`toFindzInput` 是纯函数，它拒绝的用法（缺索引目录、库 id 像路径）
    // 不该先付一次进程启动的代价。顺序反过来时，`/findz open` 少配一个 indexDir 会去
    // 起一个内核、再因为别的原因死掉，报出来的是启动失败而不是那句真正的原因。
    const input = toFindzInput(actionId, call.inputs, config.indexDir.get())
    const kernel = await host()
    const result = await runFindzWithGateway(input, kernel, (event) => {
      // 内核的 progress 是 0..100；接到运行账本时同时把它说的话带上，界面才有可读进度。
      if (event.type === 'progress') call.run.progress({ done: Math.round(event.progress ?? 0), total: 100 })
      if (typeof event.message === 'string' && event.message !== '') call.run.preview({ message: event.message })
    })
    call.run.resultView({ action: actionId, ...(result.data ?? {}), data: result.data ?? null })
    if (!result.success) throw new Error(`findz ${actionId}: ${result.message}`)
    return renderResult(result)
  }

  // handler 表由定义推导：清单里每个动作都必须有实现，`defineNode` 也会再查一遍。
  const handlers: NodeHandlers = {}
  for (const action of definition.actions) {
    handlers[action.id] = (call) => runAction(action.id as FindzAction, call)
  }

  const node = defineNode(ctx, {
    definition,
    journal: () => ctx.get(OPERATIONS_SERVICE) as OperationJournal | undefined,
    handlers,
  })

  /**
   * 不经过模型的入口：composer 里输入 `/findz api` 就直接执行。面板按钮走同一条路
   * （`.dsh/skills/xaihi-node-ui/SKILL.md`：面板要动宿主只能走命令入口，不许自建 RPC）。
   *
   * 危险动作由 `gateReason` 拦下（它读的就是定义里的 `danger`），要跑就得走带审批的
   * 工具路径。
   */
  ctx.effect(() => ctx.commands.register({
    name: 'findz',
    description: 'Xaihi 归档检索 / archive search: /findz api | open | scan | query | members | export | treemap | analyze | close | task',
    async handler({ rawInput }): Promise<CommandResult> {
      const parsed = parseFindzCommand(rawInput, definition)
      if (parsed.kind === 'help') return { kind: 'success', text: helpText(definition) }
      if (parsed.kind === 'error') return { kind: 'error', text: parsed.text }
      const refused = gateReason(definition, parsed.action, parsed.args)
      if (refused !== undefined) return { kind: 'error', text: refused }
      try {
        return { kind: 'success', text: await node.invoke(parsed.action, parsed.args) }
      } catch (error) {
        return { kind: 'error', text: `findz ${parsed.action} failed: ${String(error instanceof Error ? error.message : error)}` }
      }
    },
  }), 'findz: slash command')
}

export type { FindzAction, FindzHost }
