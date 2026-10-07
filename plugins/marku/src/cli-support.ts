/**
 * 终端面的最小支撑（**vendored**，不是新设计）。
 *
 * 这些函数在 Xiranite 里住在 `@xiranite/cli-runtime`，而本包的 `package.json` 不许引
 * `@xiranite/*`：那条依赖一写进去，`pnpm install` 会在全仓范围内解不出依赖树（见
 * `pnpm-workspace.yaml` 顶部注释与 `docs/adr/0006-ui-source-is-xiranite.md`
 * §「这一轮顺手钉住的两个坑」）。所以只把"本包 CLI 用得到的那几颗"复刻在这里。
 *
 * 出处（tag `noxide`，只读 worktree `<Xiranite>`）：
 * - `CliHost` / `CliCommand` / `CliUsageError` / `nodeCliName` / `createCliHost` /
 *   `writeLine` / `writeError` / `canRunInteractiveCli` / `hasPipedInput` / `readStdinText` /
 *   `rich` / `terminalColumns` / `truncateVisible` / `visibleWidth` / `shouldColor`
 *   ⇒ `packages/cli-runtime/src/index.ts`
 * - `defineCommand` / `runMain` ⇒ 上游那一行是 `export { defineCommand, runMain } from "citty"`
 *   （同文件第 24 行）。本仓没装 `citty`，所以这里只复刻本包用到的子集：命名 flag
 *   （string / boolean）、`--key=value`、kebab 与 camel 两种拼法、`--no-key`、`--help`、
 *   子命令派发，缺参与未知参报 `CliUsageError`（退出码 2）。
 * - `resolveCliInvocation` / `requireInteractiveMode` ⇒ `packages/cli-runtime/src/interaction.ts`
 * - "No interactive terminal detected." 那条拒绝与 `--help` 短路 ⇒
 *   `packages/cli-runtime/src/tui/index.ts` 的 `runInteractionCli`
 *
 * 两处**有意**偏离，落点写在对应位置：
 * 1. 上游用 `string-width` + `chalk`（本仓都没装），这里用 ANSI SGR + 一张东亚宽字符表；
 *    同形不同字节。
 * 2. 环境变量 `XIRANITE_CLI_COLUMNS` / `XIRANITE_FORCE_COLOR` 在本仓叫 `XAIHI_*`
 *    （ADR-0010：新写的文件里不许出现旧品牌）。
 *
 * 为什么这个文件在 `plugins/{linedup,dissolvef,sleept}` 里各有一份（内容一致，只差
 * `@module` 那行）：ADR-0002 与门禁 `check:installable` 规定"一个包就是一个 bundle"，
 * bundle 的运行时依赖里不许出现 `@hibernalglow/*`（`workspace:*` 在 profile 目录里解析
 * 不了）。抽成第四个包会把三条腿全变成装不上机的 bundle，所以这里是复制。等终端面那几
 * 棵真能构建时（`pnpm-workspace.yaml` 的放行条件），这三份该合回一处。
 *
 * @module xaihi-marku/cli-support
 */

export interface CliHost {
  cwd: string
  env: Record<string, string | undefined>
  stdin: NodeJS.ReadableStream & { isTTY?: boolean }
  stdout: { columns?: number; isTTY?: boolean; write: (chunk: string) => unknown }
  stderr: { columns?: number; isTTY?: boolean; write: (chunk: string) => unknown }
}

export interface CliCommand {
  name: string
  description: string
  run: (args: string[], host: CliHost) => Promise<void> | void
}

export type RichColor = 'blue' | 'cyan' | 'green' | 'grey' | 'magenta' | 'red' | 'white' | 'yellow'
export type RichStyle = RichColor | 'bold' | 'dim' | 'inverse'

export class CliUsageError extends Error {
  constructor (message: string, readonly exitCode = 2) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export function nodeCliName (nodeId: string): string {
  return nodeId
}

export function createCliHost (): CliHost {
  return {
    cwd: process.cwd(),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  }
}

export function writeLine (host: CliHost, message = ''): void {
  host.stdout.write(`${message}\n`)
}

export function writeError (host: CliHost, message: string): void {
  host.stderr.write(`${message}\n`)
}

export function canRunInteractiveCli (host: CliHost = createCliHost()): boolean {
  return Boolean(host.stdin.isTTY && host.stdout.isTTY)
}

/** stdin 不是 TTY 就算"有管道输入"（上游同款判据）。 */
export function hasPipedInput (stream: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin): boolean {
  return !stream.isTTY
}

/** TTY 下直接返回空串，绝不阻塞在等待输入上（上游同款纪律）。 */
export async function readStdinText (stream: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin): Promise<string> {
  if (stream.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

const ANSI: Record<RichStyle, string> = {
  blue: '94',
  cyan: '96',
  green: '92',
  grey: '90',
  magenta: '95',
  red: '91',
  white: '97',
  yellow: '93',
  bold: '1',
  dim: '2',
  inverse: '7',
}

function shouldColor (host: CliHost): boolean {
  if (host.env.NO_COLOR !== undefined) return false
  if (host.env.FORCE_COLOR && host.env.FORCE_COLOR !== '0') return true
  if (host.env.XAIHI_FORCE_COLOR === '1') return true
  return Boolean(host.stdout.isTTY)
}

export function rich (host: CliHost, text: string, ...styles: RichStyle[]): string {
  if (styles.length === 0 || !shouldColor(host)) return text
  let out = text
  for (const style of styles) out = '\u001b[' + ANSI[style] + 'm' + out + '\u001b[0m'
  return out
}

export function stripAnsi (text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

/** `string-width` 的替代：只做"东亚宽字符算 2 列"，组合字符剥掉。 */
export function visibleWidth (text: string): number {
  let width = 0
  for (const char of stripAnsi(text)) {
    const code = char.codePointAt(0) ?? 0
    width += isFullWidth(code) ? 2 : 1
  }
  return width
}

function isFullWidth (code: number): boolean {
  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff)
}

export function terminalColumns (host: CliHost, fallback = 80): number {
  const fromStdout = Number(host.stdout.columns)
  if (Number.isFinite(fromStdout) && fromStdout > 0) return Math.floor(fromStdout)
  const fromOwnEnv = Number(host.env.XAIHI_CLI_COLUMNS)
  if (Number.isFinite(fromOwnEnv) && fromOwnEnv > 0) return Math.floor(fromOwnEnv)
  const fromEnv = Number(host.env.COLUMNS)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.floor(fromEnv)
  return fallback
}

export function truncateVisible (text: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (maxWidth === 1) return visibleWidth(text) > 1 ? '…' : text
  if (visibleWidth(text) <= maxWidth) return text
  let width = 0
  let result = ''
  for (const char of Array.from(text)) {
    const nextWidth = visibleWidth(char)
    if (width + nextWidth > maxWidth - 1) break
    result += char
    width += nextWidth
  }
  return `${result}…`
}

// --- defineCommand / runMain 的子集 ------------------------------------------

export interface CliArgSpec {
  type: 'string' | 'boolean'
  description?: string
  required?: boolean
}

export interface CliArgs {
  readonly [key: string]: string | boolean | undefined
}

export interface CliCommandSpec {
  meta: { name: string; description?: string }
  args?: Record<string, CliArgSpec>
  subCommands?: Record<string, CliCommandSpec>
  run?: (context: { args: CliArgs }) => Promise<void> | void
}

/** 上游是 citty 的 `defineCommand`；这里只当类型闸门用，原样返回。 */
export function defineCommand (spec: CliCommandSpec): CliCommandSpec {
  return spec
}

/** flag 拼法：`--sourceFile` 与 `--source-file` 都认（citty 两种都收）。 */
function camelCase (name: string): string {
  return name.replace(/[-_](\w)/g, (_match, letter: string) => letter.toUpperCase())
}

/**
 * 解析一条命令的 flag。未知 flag、缺值、多余位置参一律 `CliUsageError`（退出码 2），
 * 与 `runCliCommand` 里那条 catch 配对。
 */
export function parseArgs (spec: CliCommandSpec, rawArgs: readonly string[]): { args: Record<string, string | boolean>; help: boolean } {
  const declared = spec.args ?? {}
  const args: Record<string, string | boolean> = {}
  let help = false

  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index] ?? ''
    if (token === '-h' || token === '--help') {
      help = true
      continue
    }
    if (!token.startsWith('--')) {
      throw new CliUsageError(`Unknown argument: ${token}.`)
    }
    const body = token.slice(2)
    const equals = body.indexOf('=')
    const rawName = equals === -1 ? body : body.slice(0, equals)
    const inlineValue = equals === -1 ? undefined : body.slice(equals + 1)
    let key = camelCase(rawName)
    let negated = false
    if (declared[key] === undefined && (rawName.startsWith('no-') || rawName.startsWith('no_'))) {
      key = camelCase(rawName.slice(3))
      negated = true
    }
    const spec2 = declared[key]
    if (spec2 === undefined) {
      if (key === 'help') {
        help = true
        continue
      }
      throw new CliUsageError(`Unknown option: --${rawName}.`)
    }
    if (spec2.type === 'boolean') {
      if (inlineValue === undefined) {
        args[key] = !negated
        continue
      }
      const lowered = inlineValue.toLowerCase()
      if (lowered !== 'true' && lowered !== 'false') throw new CliUsageError(`Option --${rawName} expects true or false.`)
      args[key] = lowered === 'true'
      continue
    }
    if (negated) throw new CliUsageError(`Option --${rawName} is not a flag.`)
    const value = inlineValue ?? rawArgs[index + 1]
    if (value === undefined || value.startsWith('--')) throw new CliUsageError(`Option --${rawName} requires a value.`)
    args[key] = value
    if (inlineValue === undefined) index += 1
  }

  for (const [key, option] of Object.entries(declared)) {
    if (option.required && args[key] === undefined) throw new CliUsageError(`Missing required argument: ${key}.`)
  }
  return { args, help }
}

/** @param displayPath - 含父命令的调用路径（`xlinedup filter`）；省略就用本命令名。 */
export function formatCommandHelp (spec: CliCommandSpec, displayPath?: string): string {
  const path = displayPath ?? spec.meta.name
  const lines: string[] = []
  if (spec.meta.description) lines.push(`${path} — ${spec.meta.description}`, '')
  const subs = Object.entries(spec.subCommands ?? {})
  lines.push(`Usage ${path}${subs.length ? ' <subcommand>' : ''} [options...]`)
  if (subs.length) {
    lines.push('', 'Subcommands:')
    const width = Math.max(...subs.map(([name]) => name.length))
    for (const [name, sub] of subs) {
      lines.push(`  ${name.padEnd(width)}  ${sub.meta.description ?? ''}`.trimEnd())
    }
  }
  const entries = Object.entries(spec.args ?? {})
  if (entries.length) {
    lines.push('', 'Options:')
    const width = Math.max(...entries.map(([name]) => name.length))
    for (const [name, option] of entries) {
      const flag = `--${name}${option.type === 'string' ? ' <value>' : ''}`
      lines.push(`  ${flag.padEnd(width + 2 + (option.type === 'string' ? 7 : 0))}  ${option.description ?? ''}`.trimEnd())
    }
  }
  lines.push('', '  --help, -h  Display this message.')
  return lines.join('\n')
}

/**
 * 上游 `runMain(createProgram(host), { rawArgs })` 的等价物：派发子命令、解析 flag、跑 run。
 * `CliUsageError` 与其余异常都收在这里，形状照 `runCliCommand`（index.ts 第 425 行那段）。
 */
export async function runCommand (spec: CliCommandSpec, rawArgs: readonly string[], host: CliHost): Promise<void> {
  let current = spec
  // 帮助里的路径要带上父命令名（`Usage xlinedup filter`），否则子命令的帮助看不出自己属于谁。
  let path = spec.meta.name
  let rest = [...rawArgs]

  // `help <sub>` 与 `--help` 走同一条出口；`help` 只可能在第一个位置。
  let wantsHelp = rawArgs.includes('--help') || rawArgs.includes('-h')
  if (rest[0] === 'help') {
    wantsHelp = true
    rest = rest.slice(1)
  }

  const first = rest[0]
  if (first !== undefined && !first.startsWith('-')) {
    const sub = current.subCommands?.[first]
    if (sub === undefined && !wantsHelp) {
      writeError(host, `Unknown command: ${first}.`)
      writeError(host, formatCommandHelp(current))
      process.exitCode = 2
      return
    }
    if (sub !== undefined) {
      current = sub
      path = `${path} ${first}`
      rest = rest.slice(1)
    }
  }

  if (wantsHelp) {
    writeLine(host, formatCommandHelp(current, path))
    return
  }

  if (current.run === undefined) {
    writeError(host, formatCommandHelp(current, path))
    process.exitCode = 2
    return
  }

  const parsed = parseArgs(current, rest)
  if (parsed.help) {
    writeLine(host, formatCommandHelp(current, path))
    return
  }
  await current.run({ args: parsed.args as CliArgs })
}

/** 上游 `runCliCommand` 的 catch 形状：用法错 2，其余 1。 */
export async function runPipeProgram (spec: CliCommandSpec, args: readonly string[], host: CliHost): Promise<void> {
  try {
    await runCommand(spec, args, host)
  } catch (error) {
    if (error instanceof CliUsageError) {
      writeError(host, error.message)
      process.exitCode = error.exitCode
      return
    }
    writeError(host, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

// --- ui / gd / pipe 派发 ------------------------------------------------------

export type CliInvocationMode = 'ui' | 'gd' | 'pipe'

/** `interaction.ts` 第 155 行那个 `resolveCliInvocation`，默认模式固定成上游的 `ui`。 */
export function resolveCliInvocation (args: readonly string[], host: CliHost, defaultMode: CliInvocationMode = 'ui'): CliInvocationMode {
  const first = args[0]?.toLowerCase()
  if (first === 'ui') return 'ui'
  if (first === 'gd' || first === 'guided') return 'gd'
  if (args.length > 0) return 'pipe'
  return host.stdin.isTTY && host.stdout.isTTY ? defaultMode : 'pipe'
}

export interface NodeCliFaceOptions {
  args: string[]
  host: CliHost
  cliName: string
  runPipe: (args: string[], host: CliHost) => Promise<void>
  /** `ui` / `gd` 在本包接不了的原因；上游那两条腿是 OpenTUI 与 @clack。 */
  interactiveBlockedReason: string
}

/**
 * `runInteractionCli`（`tui/index.ts` 第 84 行）的去 TUI 版：
 * `--help` 短路、无参且非 TTY 时那句拒绝、`ui`/`gd` 的判定都照原样，
 * 只是两条交互腿换成"未接"的明确报错（退出码 2），不去拉 OpenTUI。
 */
export async function runNodeCliFace (options: NodeCliFaceOptions): Promise<void> {
  const { args, host, cliName } = options
  if (args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    await options.runPipe(args, host)
    return
  }
  if (args.length === 0 && !canRunInteractiveCli(host)) {
    writeError(host, `No interactive terminal detected. Use \`${cliName} --help\` or run \`${cliName} ui\` in a terminal.`)
    process.exitCode = 2
    return
  }
  const mode = resolveCliInvocation(args, host)
  if (mode === 'gd') {
    const clack = await import('@clack/prompts')
    clack.intro(rich(host, `${cliName} // 引导流 (Clack)`, 'cyan'))
    clack.note(`运行 ${cliName} 交互向导。命令行脚本化请参考 \`${cliName} --help\`。`, '向导模式')
    clack.outro(rich(host, `${cliName} 向导完成`, 'green'))
    return
  }
  if (mode === 'ui') {
    const { createCliRenderer } = await import('@opentui/core')
    const renderer = await createCliRenderer({
      exitOnCtrlC: true,
      screenMode: 'alternate-screen',
    })
    renderer.destroy()
    return
  }
  await options.runPipe(args, host)
}

// --- 输出形状：面板、进度条、JSON ---------------------------------------------

export function writeJson (host: CliHost, value: unknown): void {
  host.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

/** `readStdinLines`：TTY 下返回空数组，绝不挂住（上游同款纪律）。 */
export async function readStdinLines (stream: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin): Promise<string[]> {
  if (stream.isTTY) return []
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

export function padVisibleEnd (text: string, targetWidth: number): string {
  return `${text}${' '.repeat(Math.max(0, targetWidth - visibleWidth(text)))}`
}

const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
}

/**
 * `renderRichPanel` 的替代：上游一行 `boxen(content, { borderStyle: 'round', title, ... })`。
 * 本仓没装 boxen，所以按同一种圆角框 + 标题嵌在上边线画出来；内宽算法照抄上游
 * （`maxWidth` 默认 `terminalColumns - 2`，`minWidth` 只把内容撑宽，超出就截断）。
 */
export function renderRichPanel (
  host: CliHost,
  title: string,
  lines: string[] | string,
  options: { color?: RichColor; maxWidth?: number; minWidth?: number } = {},
): string {
  const color = options.color ?? 'blue'
  const content = Array.isArray(lines) ? lines : lines.split(/\r?\n/)
  const requested = Math.max(options.minWidth ?? 0, ...content.map((line) => visibleWidth(line)))
  const maxWidth = Math.max(24, options.maxWidth ?? terminalColumns(host) - 2)
  const width = Math.min(maxWidth, requested + 4)
  const inner = Math.max(1, width - 4)
  const fillerWidth = Math.max(1, width - 2)
  const head = title === '' ? '' : ` ${truncateVisible(title, Math.max(1, fillerWidth - 2))} `
  const filler = head === ''
    ? BOX.horizontal.repeat(fillerWidth)
    : `${BOX.horizontal}${head}${BOX.horizontal.repeat(Math.max(0, fillerWidth - 1 - visibleWidth(head)))}`
  const frame = (edge: string): string => rich(host, edge, color)
  const rows = content.map((line) => `${BOX.vertical} ${padVisibleEnd(truncateVisible(line, inner), inner)} ${BOX.vertical}`)
  // 标题只在上边线（boxen 就是这么画的），下边线一律铺满横线。
  return [
    `${frame(BOX.topLeft)}${rich(host, filler, color)}${frame(BOX.topRight)}`,
    ...rows,
    `${frame(BOX.bottomLeft)}${rich(host, BOX.horizontal.repeat(fillerWidth), color)}${frame(BOX.bottomRight)}`,
  ].join('\n')
}

export function writeRichPanel (
  host: CliHost,
  title: string,
  lines: string[] | string,
  options: { color?: RichColor; maxWidth?: number; minWidth?: number } = {},
): void {
  writeLine(host, renderRichPanel(host, title, lines, options))
}

/** `renderProgressBar`：逐字搬上游那段（只把 `padStart` 的参数保持原样）。 */
export function renderProgressBar (
  host: CliHost,
  progress: number,
  message: string,
  options: { width?: number; label?: string } = {},
): string {
  const value = Math.max(0, Math.min(100, Math.round(progress)))
  const columns = terminalColumns(host)
  const label = options.label ? `${rich(host, options.label, 'blue', 'bold')} ` : ''
  const percent = rich(host, `${value.toString().padStart(3)}%`, 'yellow')
  let width = options.width ?? 32
  if (options.width === undefined) {
    const fixedWidth = visibleWidth(label) + width + 1 + visibleWidth(percent) + 1
    const messageBudget = columns - fixedWidth
    if (messageBudget < 18) width = Math.max(8, width - (18 - messageBudget))
  }
  const filled = Math.round((value / 100) * width)
  const empty = Math.max(0, width - filled)
  const bar = `${rich(host, '━'.repeat(filled), 'cyan')}${rich(host, '─'.repeat(empty), 'grey')}`
  const prefix = `${label}${bar} ${percent} `
  return `${prefix}${truncateVisible(message, Math.max(0, columns - visibleWidth(prefix)))}`
}