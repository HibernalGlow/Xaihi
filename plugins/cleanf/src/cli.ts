#!/usr/bin/env node
/**
 * cleanf 的终端面，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/cleanf/src/cli.ts` 搬。
 *
 * 保留的东西：子命令名 `preview` / `run`（上游 `:123-141`）、flag 名单
 * `--paths --presets --exclude --preview --json`（上游 `cleanfArgs` 在 `:152-160`）、
 * `--paths -` 与"没给路径且 stdin 是管道"那两条读 stdin 的判据（`:128`、`:137`，读进来用 `;`
 * 拼回去，因为内核的 `parseCleanfPaths` 认换行与分号）、`presets` 只按逗号拆（`:163-167`）、
 * 无 `--presets` 时落回 `getDefaultPresets()`（同一行）、非 JSON 那一段的 **清理总结面板 +
 * 每个预设一行 + 预览清单最多 40 行**（`PREVIEW_TARGET_LIMIT` 在 `:40`、段落在 `:433-469`）、
 * 进度条只在非 JSON 时打（`:178-187`）、以及 `result.success` 为假时退出码 1（`:192`、`:198`）。
 *
 * 五处偏离，都写在能看见的地方：
 * 1. **`run` 不带 `--preview` 就是"抛出去的上游拒绝"**：本包的移除腿要的是**可恢复删除**
 *    （移进回收站 + 留下可撤销批次），Xaihi 到今天没有那条缝（新缺口 G10，逐调用表在
 *    `src/platform.ts`）。落点是基线 `platform.ts:131-134` 自己那一刀：
 *    `Recycle-bin restore is unavailable; Cleanf refused to run without undo support.`（`ENOTSUP`），
 *    经 `runPipeProgram` 的 catch 变成 stderr + 退出码 1——**与上游在同一条失败路上的形状一致**，
 *    不在这里另造一个退出码或一句新文案。预演那条腿是真跑的（只读枚举，`core.ts:289-296`）。
 * 2. **不读 `[nodes.cleanf]` 配置**（上游 `resolveCleanfDefaults`，`:68-84`）：按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md` 那条通路整块不搬，同一批默认值现在
 *    住在 `src/index.ts` 的 `Config`，独立 bin 读不到（缺口 G2）。连带后果：上游
 *    `preview = args.preview || defaults.preview || false` 在没有那份文件时只剩
 *    `args.preview === true` ⇒ `xcleanf run` 不带 `--preview` 就是"要真删"，
 *    这里保留同一个判据（它正好落在第 1 条那一刀上）。
 * 3. **`--preview` 的 `default` 拿不到**：上游给 `preview` 声明了 `default: previewDefault`
 *    （`preview` 命令 true、`run` 命令 false，`:125`/`:135` 传的），本仓 vendored 解析器
 *    （`src/cli-support.ts` 的 `CliArgSpec`）没有 `default` 这一格。两条命令的缺省因此写在各自己
 *    那一行上（`preview` 恒 true、`run` 看 flag），效果与上游一致，但**读的是代码不是声明**。
 * 4. **不印 `📁/📄` 图标与 `统计: X 个文件, Y 个文件夹`**：上游那两行的来源是它自己的
 *    `parsePreviewTargets`（`cli.ts:477-479`），那份实现把**每一条**都写成 `type: "file"`，
 *    于是"文件夹"恒为 0；而 `previewFiles` 只有路径、没有类型（内核 `core.ts:294` 把 target
 *    压成了 path），缝里拿不到真类型。宁可不印，也不印一条屏幕撒谎的行
 *    （判据同 AGENTS.md 的"不许伪造它没给的数据"）。清单里那四条计数一条不少。
 * 5. **`ui` / `gd` / `guided` 未接**：上游分别是 OpenTUI（`loadScreen` 里的 `./Tui.tsx`）与
 *    `@clack` 引导流（`interaction.ts` + `runGuidedInteraction`，`cli.ts:97`），本仓没有那两个包
 *    也不许引 `@xiranite/*`；`guided` 那条腿还依赖剪贴板读取（G5：`readClipboardText` 没搬）。
 *    三条腿**都不带任何参数校验**——未接的功能先报"缺参"会把"这块没搬"说成"你参数没给对"。
 *    另注：定义里的 `undo` 动作在本面上**没有子命令**，上游也没有（`xiranite cleanf undo` 不存在，
 *    撤销只在 guided 那条腿里出现，`cli.ts:253-255`）⇒ 这里不替它长一条。
 *
 * @module xaihi-cleanf/cli
 */

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
  writeError,
  writeJson,
  writeLine,
  writeRichPanel,
} from './cli-support.ts'
import type { CliArgs, CliCommand, CliCommandSpec, CliHost } from './cli-support.ts'
import type { CleanfInput, CleanfPresetId, CleanfResult } from './core.ts'
import { CLEANING_PRESETS, getDefaultPresets, parseCleanfPaths, runCleanf } from './core.ts'
import { createNodeCleanfRuntime } from './platform.ts'

const CLI_NAME = nodeCliName('cleanf')

/** 上游 `cli.ts:40` 的 `PREVIEW_TARGET_LIMIT`。 */
const PREVIEW_TARGET_LIMIT = 40

/**
 * 未接的交互腿：留在面上，跑起来响亮拒绝。
 * 导出是为了让测试与 `--help` 用同一份名单，而不是各抄一遍（抄两份就会漂）。
 */
export const UNWIRED_INTERACTIVE_LEGS = ['ui', 'gd', 'guided'] as const

export const cli: CliCommand = {
  name: CLI_NAME,
  description: 'Remove empty folders, backup files, temp folders, and trash patterns.',
  async run (args: string[], host: CliHost) {
    await runProgram(args, host)
  },
}

export const program = createProgram()

/** 派发形状对齐 vendored 支撑里的 `runNodeCliFace`（`--help` 短路与无参拒绝都在那儿）。 */
export async function runProgram (args = process.argv.slice(2), host: CliHost = createCliHost()): Promise<void> {
  await runNodeCliFace({
    args,
    host,
    cliName: CLI_NAME,
    runPipe: async (pipeArgs, pipeHost) => {
      await runPipeProgram(createProgram(pipeHost), pipeArgs, pipeHost)
    },
    interactiveBlockedReason: '全屏 TUI（OpenTUI 的 `Tui.tsx`）与引导流（@clack 的 `interaction.ts`）'
      + '都不随本包发布，而本节点的移除那一半要的缝今天不在（G10，见 `src/platform.ts`）。'
      + `脚本化请用 \`${CLI_NAME} preview --paths <文件夹> --json\`。`,
  })
}

function createProgram (host: CliHost = createCliHost()): CliCommandSpec {
  return defineCommand({
    meta: { name: CLI_NAME, description: 'File cleanup CLI: preview plans on the terminal face, removals need the recycle-bin seam (G10).' },
    subCommands: {
      // 描述逐条抄上游 `:124` 与 `:133`。
      preview: defineCommand({
        meta: { name: 'preview', description: 'Preview cleanup targets without deleting.' },
        args: cleanfArgs(),
        async run ({ args }) {
          await runCommand('preview', args, host)
        },
      }),
      run: defineCommand({
        meta: { name: 'run', description: 'Execute cleanup.' },
        args: cleanfArgs(),
        async run ({ args }) {
          await runCommand('run', args, host)
        },
      }),
      // ↓ 上游面上有、本包没带的那三条腿：面在这儿，实现不在这儿。
      ui: defineCommand({
        meta: { name: 'ui', description: 'Open the full terminal UI using OpenTUI.（未接）' },
        async run () {
          await runUnwiredFace('ui', host)
        },
      }),
      gd: defineCommand({
        meta: { name: 'gd', description: 'Open the compact guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('gd', host)
        },
      }),
      guided: defineCommand({
        meta: { name: 'guided', description: 'Open the rich guided terminal workflow.（未接）' },
        async run () {
          await runUnwiredFace('guided', host)
        },
      }),
    },
  })
}

/** flag 名单逐条对齐上游 `cleanfArgs`（`:152-160`）；第 3 处偏离说的就是那个 `default`。 */
function cleanfArgs () {
  return {
    paths: { type: 'string', description: 'Paths separated by semicolon or new lines. Use "-" to read the queue from stdin.' },
    presets: { type: 'string', description: 'Comma-separated presets.' },
    exclude: { type: 'string', description: 'Comma-separated exclude keywords.' },
    preview: { type: 'boolean', description: 'Preview mode. `preview` always previews; `run` needs --preview to stay a plan.' },
    json: { type: 'boolean', description: 'Print JSON result.' },
  } as const
}

/**
 * 上游 `:128` / `:137` 那两行的等价物：`--paths -` 或"没给路径且 stdin 是管道"时，
 * 把整份 stdin 读进来用 `;` 拼回去（内核的 `parseCleanfPaths` 认换行与分号）。
 */
async function resolvePathsValue (args: CliArgs, host: CliHost): Promise<string | undefined> {
  if (args.paths === '-' || (args.paths === undefined && hasPipedInput(host.stdin) && Symbol.asyncIterator in Object(host.stdin))) {
    return (await readStdinLines(host.stdin)).join(';')
  }
  return typeof args.paths === 'string' ? args.paths : undefined
}

/**
 * 上游 `inputFromArgs`（`:162-174`）逐条：`presets` 只按逗号拆、没有就落
 * `getDefaultPresets()`；`paths` 交给内核的 `parseCleanfPaths`。
 * `preview` 那一格按第 2、3 处偏离写成两条：`preview` 命令恒真，`run` 命令看 flag。
 */
function inputFromArgs (leg: 'preview' | 'run', args: CliArgs, paths: string | undefined): CleanfInput {
  const presets = typeof args.presets === 'string' && args.presets !== ''
    ? args.presets.split(',').map((item) => item.trim()).filter(Boolean) as CleanfPresetId[]
    : getDefaultPresets()
  return {
    paths: parseCleanfPaths(paths),
    presets,
    ...(typeof args.exclude === 'string' && args.exclude !== '' ? { exclude: args.exclude } : {}),
    preview: leg === 'preview' ? true : args.preview === true,
  }
}

async function runCommand (leg: 'preview' | 'run', args: CliArgs, host: CliHost): Promise<void> {
  const json = args.json === true
  const input = inputFromArgs(leg, args, await resolvePathsValue(args, host))

  // 第 1 处偏离：**不在这里拦**。非预览那一条会走到基线 `platform.ts:131-134` 那一刀，
  // 抛的是上游原话，经 `runPipeProgram` 的 catch 变成 stderr + 退出码 1（与上游同一条失败路的形状一致）。
  let progressActive = false
  const result = await runCleanf(input, createNodeCleanfRuntime(), json ? undefined : (event) => {
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
  writeSummary(host, result, input.preview === true)
  if (!result.success) process.exitCode = 1
}

/**
 * 上游 `writeCleanfSummary`（`:433-469`）的三段：结论那句之后是清理总结面板
 * （每个预设一行 `• <name>: N 个`）、预览清单（最多 40 行，宽度按 `columns - 6` 截断）。
 * 图标行与"统计: X 个文件, Y 个文件夹"按第 4 处偏离**不印**。
 */
function writeSummary (host: CliHost, result: CleanfResult, preview: boolean): void {
  const data = result.data
  if (data === undefined) return
  const columns = terminalColumns(host)
  const detailLines = Object.entries(data.removedDetails).map(([key, count]) => {
    const preset = CLEANING_PRESETS[key]
    const name = preset?.name ?? key
    return `• ${name}: ${String(count)} 个`
  })
  const headline = preview
    ? `预览完成，找到 ${String(data.totalRemoved)} 个待删除项目。`
    : `已移入系统回收站: ${String(data.totalRemoved)} 个项目${data.skipped ? `，跳过 ${String(data.skipped)} 个` : ''}。`
  writeRichPanel(host, '清理总结', [headline, ...detailLines], {
    color: result.success ? 'green' : 'yellow',
    maxWidth: columns - 2,
    minWidth: Math.min(76, columns - 6),
  })

  if (preview && data.previewFiles.length) {
    writeLine(host)
    writeLine(host, rich(host, '待删除文件预览：', 'cyan'))
    for (const path of data.previewFiles.slice(0, PREVIEW_TARGET_LIMIT)) {
      writeLine(host, `  ${truncateVisible(path, columns - 6)}`)
    }
    if (data.previewFiles.length > PREVIEW_TARGET_LIMIT) {
      writeLine(host, rich(host, `  ... 还有 ${String(data.previewFiles.length - PREVIEW_TARGET_LIMIT)} 个项目`, 'grey'))
    }
  }
}

/**
 * 未接：`ui` / `gd` / `guided` 三条腿。原因点名到具体的包与文件，
 * 并且**不做任何参数校验**（见文件头第 5 条）。
 */
async function runUnwiredFace (name: string, host: CliHost): Promise<void> {
  if (!(UNWIRED_INTERACTIVE_LEGS as readonly string[]).includes(name)) {
    throw new Error(`${CLI_NAME}: "${name}" 不在 UNWIRED_INTERACTIVE_LEGS 里，却走了未接分支`)
  }
  if (!canRunInteractiveCli(host)) {
    writeError(host, `Guided mode requires an interactive terminal. Use \`${CLI_NAME} preview --paths <folder> --json\` for scripted use.`)
    process.exitCode = 2
    return
  }
  const what = name === 'ui'
    ? '全屏 TUI 在 OpenTUI 上（上游 `packages/nodes/cleanf/src/Tui.tsx` + `@xiranite/cli-runtime/terminal`），本包不引它'
    : '引导流的字段表在 `@clack/prompts` 上（上游 `packages/nodes/cleanf/src/interaction.ts`），本包不引它；'
      + '那条腿还依赖剪贴板读取（G5：`readClipboardText` 没搬）'
  writeError(host, `${CLI_NAME} ${name} 未接：${what}。替代归属是工作台面板与宿主侧的工具 \`cleanf_clean\` / \`cleanf_undo\`。`)
  process.exitCode = 2
}

/** 上游 `writeProgress`（`:494-500`）：TTY 走行内覆盖，非 TTY 成行打印。 */
function writeProgress (host: CliHost, line: string): void {
  if (host.stdout.isTTY) {
    host.stdout.write(`\r\u001b[2K${line}`)
    return
  }
  writeLine(host, line)
}

/** 上游 `endProgress`（`:502-504`）。 */
function endProgress (host: CliHost, active: boolean): void {
  if (active && host.stdout.isTTY) host.stdout.write('\n')
}

/**
 * 自执行闸门：与同批节点同一写法（`.bin` 软链下 argv[1] 未必等于 `import.meta.url`，
 * 而聚合 CLI 引本模块时 argv[1] 是它自己的入口，两条都不该点亮）。
 */
const entry = process.argv[1] ?? ''
if (/\bcli\.[cm]?[jt]s$/.test(entry.replace(/\\/g, '/'))) {
  try {
    await runProgram()
  } catch (error) {
    writeError(createCliHost(), error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
