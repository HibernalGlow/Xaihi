#!/usr/bin/env node
/**
 * dissolvef 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/dissolvef/src/cli.ts`
 * 搬来。子命令名、每个 flag 的名字与默认值、进度条/面板/`--json` 的输出形状都照原样，
 * 内核仍然是本包的 `src/core.ts`（同一份 `runDissolvef`，不另写第二套逻辑）。
 *
 * 上游那份分三层：`runInteractionCli`（ui/gd/pipe 派发）+ `runMain`（citty 管道面）+
 * `runGuided`（@clack 引导流）。本包只带得出管道面：
 * - `ui` / `gd` / `guided` **未接**：上游分别要 OpenTUI（`@xiranite/cli-runtime/terminal`）
 *   与 `@clack/prompts`，本仓既没装也不许引 `@xiranite/*`。替代归属：面板
 *   （`frontend/Panel.tsx`，走 `xaihi.manifest/1` 的 remote）与 `ctx.commands`。
 * - `@xiranite/config` 的 `loadNodeConfigWithHints` / `updateNodeConfigFile` **未接**：
 *   上游从 `xiranite.config.toml [nodes.dissolvef]` 读 `enable_undo` 与 `history_path`。
 *   按 `docs/adr/0013-config-goes-through-dsh-settings.md`，这条"配置文件在磁盘上"的通路
 *   整块不搬：同一份默认值在 Xaihi 是 `Config = Schema.object(...)`（本包 `src/index.ts`
 *   的 `historyPath`），值由 DSH 的 patch 层组合，读写走 `ctx.settings` /
 *   `ctx.remote.settings`。独立 bin 不在宿主进程里，读不到那份 settings，
 *   所以 `--historyPath` 是终端面唯一的来源。
 *
 * 一条**新增的**闸门（上游没有，本仓必须有）：会动文件的动作在拿不到撤销账本路径时直接拒绝。
 * 上游可以把历史默认落在自己的配置目录旁，而本包的 `platform.ts` 明确要求路径显式给
 * （`docs/adr/0003-migrated-node-file-state.md`）。内核 `executePlan` 是"先搬完再记账"，
 * 没有这条闸门就是文件已移动、历史写失败——`src/index.ts` 的 `dissolve` 处理器已经在做
 * 同样的拒绝，这里补的是终端面这一半。
 *
 * @module xaihi-dissolvef/cli
 */

import { dirname } from 'node:path'
import {
  canRunInteractiveCli,
  createCliHost,
  defineCommand,
  hasPipedInput,
  nodeCliName,
  readStdinLines,
  renderProgressBar,
  rich,
  runNodeCliFace,
  runPipeProgram,
  terminalColumns,
  truncateVisible,
  visibleWidth,
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliCommand, CliCommandSpec, CliHost, RichColor } from './cli-support.ts'
import type { DissolvefAction, DissolvefConflictMode, DissolvefInput, DissolvefMediaType, DissolvefPlanItem, DissolvefResult } from './core.ts'
import { runDissolvef } from './core.ts'
import { createNodeDissolvefRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('dissolvef')
const PREVIEW_LIMIT = 40
const ARCHIVE_PATH_LIMIT = 80
const HISTORY_LIMIT = 20

/** 会写盘的动作：没有撤销账本路径就不许跑（见文件头那条闸门）。 */
const MUTATING_ACTIONS: readonly DissolvefAction[] = ['dissolve', 'nested', 'media', 'archive', 'direct', 'undo']

interface DissolvefCliOptions {
  path?: string
  exclude?: string
  nested?: boolean
  media?: boolean
  archive?: boolean
  direct?: boolean
  preview?: boolean
  dryRun?: boolean
  fileConflict?: DissolvefConflictMode
  dirConflict?: DissolvefConflictMode
  similarityThreshold?: string
  enableSimilarity?: boolean
  protectFirstLevel?: boolean
  historyPath?: string
  historyLimit?: string
  undoId?: string
  mediaTypes?: string
  skipBlacklist?: boolean
  json?: boolean
}

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Dissolve nested, single-media, single-archive, or direct folders.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await legacyRunProgram(pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI）与引导流（@clack）都不随本包发布，'
      + `脚本化请用 \`${CLI_NAME} plan --path <文件夹> --json\`。`,
  })
}

async function legacyRunProgram (args: readonly string[], host: CliHost): Promise<void> {
  if (args.length === 0) {
    writeLine(host, `${CLI_NAME} ui | gd | plan | dissolve | nested | media | archive | direct | collect-archives | history | undo`)
    return
  }
  await runPipeProgram(createProgram(host), args, host)
}

/**
 * 未接：上游的 `runGuided` 要 `selectRich`/`promptRich`/`confirmRich`（@clack）与
 * 剪贴板读取。替代归属是宿主侧的面板与 `ctx.commands`，不是这里自己拉一个 TUI。
 */
async function runGuided (host: CliHost): Promise<void> {
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} plan --path <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  writeError(host, `\`${CLI_NAME} guided\` 未接：引导流的选项树在 @clack 上，本包不引它。`)
  process.exitCode = 2
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'Folder dissolve utility with guided terminal mode.' },
    subCommands: {
      plan: defineCommand({
        meta: { name: 'plan', description: 'Preview the operations without changing files.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'plan', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      dissolve: defineCommand({
        meta: { name: 'dissolve', description: 'Run the selected dissolve modes.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'dissolve', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      nested: defineCommand({
        meta: { name: 'nested', description: 'Flatten single-subfolder chains.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'nested', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      media: defineCommand({
        meta: { name: 'media', description: 'Release folders containing exactly one media file.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'media', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      archive: defineCommand({
        meta: { name: 'archive', description: 'Release folders containing exactly one archive.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'archive', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      direct: defineCommand({
        meta: { name: 'direct', description: "Move a folder's contents to its parent." },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'direct', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      'collect-archives': defineCommand({
        meta: { name: 'collect-archives', description: 'Print matching single-archive paths.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'collect_archives', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      history: defineCommand({
        meta: { name: 'history', description: 'Show undo history.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'history', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      undo: defineCommand({
        meta: { name: 'undo', description: 'Undo the latest or selected dissolve record.' },
        args: commonArgs(),
        async run ({ args }) {
          await runAction({ action: 'undo', ...inputFromArgs(await argsWithPipedPath(args, host)) }, Boolean(args.json), host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Open the rich guided terminal workflow.' },
        async run () {
          await runGuided(host)
        },
      }),
    },
  })
}

function commonArgs () {
  return {
    path: { type: 'string', description: 'Root folder path.' },
    exclude: { type: 'string', description: 'Comma-separated exclude keywords.' },
    nested: { type: 'boolean', description: 'Enable nested mode.' },
    media: { type: 'boolean', description: 'Enable single-media mode.' },
    archive: { type: 'boolean', description: 'Enable single-archive mode.' },
    direct: { type: 'boolean', description: 'Enable direct mode.' },
    preview: { type: 'boolean', description: 'Preview without changing files.' },
    dryRun: { type: 'boolean', description: 'Alias for preview.' },
    fileConflict: { type: 'string', description: 'auto, skip, overwrite, or rename.' },
    dirConflict: { type: 'string', description: 'auto, skip, overwrite, or rename.' },
    similarityThreshold: { type: 'string', description: 'Similarity threshold from 0 to 1.' },
    enableSimilarity: { type: 'boolean', description: 'Enable similarity filter.' },
    protectFirstLevel: { type: 'boolean', description: 'Do not dissolve first-level folders below --path.' },
    historyPath: { type: 'string', description: 'Undo history JSON path.' },
    historyLimit: { type: 'string', description: 'Maximum history records.' },
    undoId: { type: 'string', description: 'Undo record id.' },
    mediaTypes: { type: 'string', description: 'Comma-separated media types: video, archive, image.' },
    skipBlacklist: { type: 'boolean', description: 'Disable built-in archive/nested blacklists.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/** `--path -` 或管道里第一行当路径（上游 `plan`/`dissolve`/... 十个分支同一条逻辑，收成一个函数）。 */
async function argsWithPipedPath (args: DissolvefCliOptions, host: CliHost): Promise<DissolvefCliOptions> {
  const stdinPiped = hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin)
  if (args.path === '-' || (!args.path && stdinPiped)) {
    const [first] = await readStdinLines(host.stdin)
    return { ...args, path: first }
  }
  return args
}

function inputFromArgs (args: DissolvefCliOptions): DissolvefInput {
  return {
    path: args.path,
    exclude: splitArg(args.exclude),
    nested: args.nested,
    media: args.media,
    archive: args.archive,
    direct: args.direct,
    preview: Boolean(args.preview || args.dryRun),
    fileConflict: args.fileConflict,
    dirConflict: args.dirConflict,
    similarityThreshold: numberArg(args.similarityThreshold),
    enableSimilarity: args.enableSimilarity,
    protectFirstLevel: args.protectFirstLevel,
    historyPath: args.historyPath,
    historyLimit: numberArg(args.historyLimit),
    undoId: args.undoId,
    mediaTypes: splitArg(args.mediaTypes).filter(isMediaType),
    skipBlacklist: args.skipBlacklist,
  }
}

async function runAction (input: DissolvefInput & { action: DissolvefAction }, json: boolean, host: CliHost): Promise<void> {
  const preview = Boolean(input.preview)
  if (!preview && MUTATING_ACTIONS.includes(input.action) && !input.historyPath) {
    writeError(host, `${CLI_NAME}: ${input.action} 会移动文件，但没有 --historyPath 就没有撤销账本，拒绝执行。`
      + '（要么显式给 --historyPath <json 路径>，要么只看看计划用 `plan`）')
    process.exitCode = 2
    return
  }

  let progressActive = false
  const runtime = input.historyPath === undefined
    ? createNodeDissolvefRuntime()
    : createNodeDissolvefRuntime({ historyDir: dirname(input.historyPath) })
  const result = await runDissolvef(input, runtime, json ? undefined : (event) => {
    if (event.type === 'progress') {
      writeProgress(host, renderProgressBar(host, event.progress ?? 0, event.message, { label: CLI_NAME }))
      progressActive = true
      return
    }
    endProgress(host, progressActive)
    progressActive = false
    if (event.message.trim()) writeLine(host, rich(host, event.message, 'grey'))
  })
  endProgress(host, progressActive)

  if (json) {
    writeJson(host, result)
    if (!result.success) process.exitCode = 1
    return
  }

  writeLine(host, result.success ? rich(host, result.message, 'green', 'bold') : rich(host, result.message, 'red', 'bold'))
  writeDissolvefSummary(host, result, preview)
  if (!result.success) process.exitCode = 1
}

function writeDissolvefSummary (host: CliHost, result: DissolvefResult, preview: boolean): void {
  const data = result.data
  if (!data) return

  const columns = terminalColumns(host)
  const modePrefix = preview ? '将' : '已'

  const lines = [
    `${rich(host, '总计', 'cyan')}  ${data.totalCount} 个操作  ${rich(host, '成功', 'green')} ${data.successCount}  ${rich(host, '跳过', 'yellow')} ${data.skippedCount}  ${rich(host, '失败', 'red')} ${data.failedCount}`,
  ]

  if (data.nestedCount) lines.push(`${rich(host, '嵌套', 'blue')}  ${modePrefix}解散 ${data.nestedCount} 个嵌套文件夹`)
  if (data.mediaCount) lines.push(`${rich(host, '媒体', 'green')}  ${modePrefix}解散 ${data.mediaCount} 个单媒体文件夹`)
  if (data.archiveCount) lines.push(`${rich(host, '压缩包', 'magenta')}  ${modePrefix}解散 ${data.archiveCount} 个单压缩包文件夹`)
  if (data.directFiles || data.directDirs) {
    lines.push(`${rich(host, '直接', 'yellow')}  ${modePrefix}移动 ${data.directFiles} 个文件和 ${data.directDirs} 个文件夹`)
  }
  if (data.archivePaths.length) {
    lines.push(`${rich(host, '收集', 'cyan')}  ${data.archivePaths.length} 个压缩包路径`)
  }
  if (data.history.length) {
    lines.push(`${rich(host, '历史', 'grey')}  ${data.history.length} 条撤销记录`)
  }
  if (data.operationId) {
    lines.push(`${rich(host, '撤销ID', 'green')}  ${data.operationId}`)
  }

  writeRichPanel(host, '解散操作总结', lines, { color: result.success ? 'green' : 'yellow', maxWidth: columns - 2, minWidth: Math.min(76, columns - 6) })

  if (data.plan.length) {
    writeLine(host)
    writeLine(host, rich(host, preview ? '待执行操作预览：' : '已执行操作：', 'cyan'))
    for (const item of data.plan.slice(0, PREVIEW_LIMIT)) {
      writeLine(host, formatPlanItem(item, host))
    }
    if (data.plan.length > PREVIEW_LIMIT) {
      writeLine(host, rich(host, `  ... 还有 ${data.plan.length - PREVIEW_LIMIT} 个操作`, 'grey'))
    }
  }

  if (data.archivePaths.length) {
    writeLine(host)
    writeLine(host, rich(host, '已收集到的压缩包路径：', 'cyan'))
    for (const path of data.archivePaths.slice(0, ARCHIVE_PATH_LIMIT)) {
      writeLine(host, `  ${truncateVisible(path, columns - 4)}`)
    }
    if (data.archivePaths.length > ARCHIVE_PATH_LIMIT) {
      writeLine(host, rich(host, `  ... 还有 ${data.archivePaths.length - ARCHIVE_PATH_LIMIT} 个路径`, 'grey'))
    }
  }

  if (data.history.length) {
    writeLine(host)
    writeLine(host, rich(host, '撤销历史：', 'cyan'))
    for (const record of data.history.slice(0, HISTORY_LIMIT)) {
      const status = record.undone ? rich(host, 'undone', 'grey') : rich(host, 'active', 'green')
      writeLine(host, `  ${rich(host, record.id, 'magenta')} ${record.mode} ${record.count} ${status}`)
    }
  }

  if (data.errors.length) {
    writeRichPanel(host, '错误', data.errors.join('\n'), { color: 'red', minWidth: 76 })
  }
}

function formatPlanItem (item: DissolvefPlanItem, host: CliHost): string {
  const status = item.status === 'success'
    ? rich(host, 'success', 'green')
    : item.status === 'error'
      ? rich(host, 'error', 'red')
      : item.status === 'skipped'
        ? rich(host, 'skipped', 'yellow')
        : rich(host, 'planned', 'cyan')
  const modeColor: RichColor = item.mode === 'nested' ? 'blue' : item.mode === 'media' ? 'green' : item.mode === 'archive' ? 'magenta' : 'yellow'
  const mode = rich(host, item.mode, modeColor)
  const operation = rich(host, item.operation, 'grey')
  const columns = terminalColumns(host)
  const prefix = `  ${status} ${mode} ${operation} `

  if (item.targetPath) {
    const arrow = ` ${rich(host, '->', 'grey')} `
    const pathBudget = Math.max(0, columns - visibleWidth(prefix) - visibleWidth(arrow))
    if (pathBudget < 20) return `${prefix}${truncateVisible(item.sourcePath, pathBudget)}`
    const sourceWidth = Math.max(8, Math.floor(pathBudget * 0.48))
    const targetWidth = Math.max(0, pathBudget - sourceWidth)
    return `${prefix}${truncateVisible(item.sourcePath, sourceWidth)}${arrow}${truncateVisible(item.targetPath, targetWidth)}`
  }

  if (item.reason) {
    const separator = ` ${rich(host, '/', 'grey')} `
    const pathBudget = Math.max(0, columns - visibleWidth(prefix) - visibleWidth(separator))
    return `${prefix}${truncateVisible(item.sourcePath, pathBudget)}${separator}${rich(host, item.reason, 'yellow')}`
  }

  const pathBudget = Math.max(0, columns - visibleWidth(prefix))
  return `${prefix}${truncateVisible(item.sourcePath, pathBudget)}`
}

function splitArg (value?: string): string[] {
  return (value ?? '').split(/[,;\r\n]/).map((item) => item.trim()).filter(Boolean)
}

function numberArg (value?: string | number): number | undefined {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isMediaType (value: string): value is DissolvefMediaType {
  return value === 'video' || value === 'archive' || value === 'image'
}

function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

function endProgress (host: CliHost, active: boolean): void {
  if (active && host.stdout.isTTY) host.stdout.write('\n')
}

/** 自执行闸门：与 linedup 同一写法（`.bin` 软链下 argv[1] 未必等于 import.meta.url）。 */
const entry = process.argv[1] ?? ''
if (/\bcli\.[cm]?[jt]s$/.test(entry.replace(/\\/g, '/'))) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
