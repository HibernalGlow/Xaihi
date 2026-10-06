/**
 * 平台差异的**唯一**落点：把"读状态 / 阻止休眠 / 立即睡眠"翻成 argv 与解析结果。
 *
 * 这里不执行任何东西（执行在 `exec.ts`），所以两条平台的分支都能用真机抓回来的输出做
 * 单元测试。夹具来自本机 macOS 与那台 Windows 11 测试盒的只读查询，字面量是抄的。
 *
 * 两条从真机测量里得出的规矩：
 * 1. **不许按本地化标签解析 `powercfg`。** 测试盒是 zh-CN，标签是"当前交流电源设置索引"，
 *    英文系统是 "Current AC Power Setting Index"。能跨 locale 站住的只有 ASCII 的
 *    `GUID 别名: <ALIAS>` 行与它后面那串 `0x........` 十六进制的**位置**，所以解析按
 *    "别名行之后的最后两个 0x 值 = AC、DC"来读，不读任何一个词。
 * 2. **不许假设控制台是 UTF-8。** 同一条 `powercfg /availablesleepstates` 经 SSH 直接拿
 *    到的是 GBK 字节（夹具 `windows-availablesleepstates.gbk.txt` 保留了那份原样），
 *    所以只有十六进制与 ASCII 别名可以依赖，状态文字一律不当成事实来源。
 *
 * @module xaihi-sleept/platform
 */

/** 本节点的动作，与 `package.json#xaihi.node` 的 actions 一一对应。 */
export type SleeptAction = 'status' | 'block' | 'unblock' | 'sleep' | 'displayOff' | 'screensaver'

/** 一次要执行的命令；`unblock` 不发命令（它杀住住的子进程），所以是 null。 */
export interface PlannedCommand {
  readonly argv: readonly string[]
  /** 子进程最长活多久；`block` 是长驻的，靠 terminate 收尾。 */
  readonly graceMs: number
  /** 是否需要读它的输出。 */
  readonly collect: boolean
}

/** Windows 上"立即睡眠"的两条不同结局，混为一谈就是错。 */
export type WindowsSuspendKind = 'suspend' | 'hibernate'

/**
 * 翻成 argv。
 * @param platform - `process.platform`。
 * @param action - 本次动作。
 * @param options - `minutes`（block 的时限）、`suspendKind`（Windows 睡眠/休眠二选一）。
 * @returns 要执行的命令，或 null 表示这一步不发命令。
 * @throws 平台不认识、或 Windows 要求真睡眠但缺少可用手段时抛出可读原因，不做静默替代。
 */
export function planCommand(
  platform: NodeJS.Platform,
  action: SleeptAction,
  options: { minutes?: number | undefined; suspendKind?: WindowsSuspendKind | undefined } = {},
): PlannedCommand | null {
  if (action === 'unblock') return null
  switch (platform) {
    case 'darwin':
      return planMac(action, options.minutes)
    case 'win32':
      return planWindows(action, options)
    default:
      throw new Error(`sleept: platform "${platform}" is not supported (v1 covers darwin and win32)`)
  }
}

const macStatus: PlannedCommand = { argv: ['pmset', '-g', 'custom'], graceMs: 5_000, collect: true }
const macAssertions: PlannedCommand = { argv: ['pmset', '-g', 'assertions'], graceMs: 5_000, collect: true }

function planMac(action: SleeptAction, minutes: number | undefined): PlannedCommand | null {
  switch (action) {
    case 'status':
      // 两条命令：设置一项、持有者一项。断言表才是"谁在拦"的答案，只看 custom 会漏。
      return macStatus
    case 'block': {
      const argv = ['caffeinate', '-di']
      if (minutes !== undefined && minutes > 0) argv.push('-t', String(Math.trunc(minutes * 60)))
      return { argv, graceMs: 2_000, collect: false }
    }
    case 'sleep':
      return { argv: ['pmset', 'sleepnow'], graceMs: 5_000, collect: true }
    case 'displayOff':
      // 只关屏幕，不睡眠：机器继续算，动一下键鼠就回来。可逆且不影响后台任务。
      return { argv: ['pmset', 'displaysleepnow'], graceMs: 5_000, collect: true }
    case 'screensaver':
      return { argv: ['open', '-a', 'ScreenSaverEngine'], graceMs: 5_000, collect: true }
    case 'unblock':
      return null
  }
  return null
}

/** `pmset -g assertions` 是状态的第二半，Windows 没有对等物，所以单独问。 */
export function planAssertionProbe(platform: NodeJS.Platform): PlannedCommand | null {
  return platform === 'darwin' ? macAssertions : null
}

const POWERSHELL = 'powershell.exe'

function planWindows(action: SleeptAction, options: { minutes?: number | undefined; suspendKind?: WindowsSuspendKind | undefined }): PlannedCommand | null {
  switch (action) {
    case 'status':
      return { argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', WINDOWS_STATUS_SCRIPT], graceMs: 8_000, collect: true }
    case 'block': {
      // SetThreadExecutionState 是**进程级**状态，进程一退就没了，所以只能靠一个活着的
      // 子进程持有；解除就是杀它。mac 的 caffeinate 同形，两边因此共用一套生命周期。
      const seconds = options.minutes !== undefined && options.minutes > 0 ? Math.trunc(options.minutes * 60) : 0
      return { argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', windowsHoldScript(seconds)], graceMs: 3_000, collect: false }
    }
    case 'sleep': {
      const kind: WindowsSuspendKind = options.suspendKind ?? 'suspend'
      if (kind === 'hibernate') {
        return { argv: ['rundll32.exe', 'powrprof.dll,SetSuspendState', '1,1,0'], graceMs: 5_000, collect: false }
      }
      // 经典坑：休眠开着时 `SetSuspendState 0,1,0` 会把"睡眠"睡成"休眠"。PowerShell 直接
      // PInvoke `SetSuspendState(FALSE, TRUE, FALSE)` 同样不保险，所以真睡眠走 Win32 API
      // 的 Sleep() 之前的那条路：写 ES 位之后交给 powrprof 的 SetSuspendState(bHibernate=FALSE)。
      return { argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', WINDOWS_SLEEP_SCRIPT], graceMs: 5_000, collect: true }
    }
    case 'displayOff':
      return { argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', WINDOWS_MONITOR_OFF_SCRIPT], graceMs: 8_000, collect: true }
    case 'screensaver':
      return { argv: [POWERSHELL, '-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCREENSAVER_SCRIPT], graceMs: 8_000, collect: true }
    case 'unblock':
      return null
  }
  return null
}

/**
 * Windows 上"关屏 / 起屏保"都是给活动窗口广播一条 WM_SYSCOMMAND。
 * 常量固定：`SC_MONITORPOWER = 0xF170`（参数 2 = 关）、`SC_SCREENSAVE = 0xF140`。
 * 这里没有本地化文字可依赖，所以判据全在码值上 —— 与 platform.ts 顶部的解析纪律一致。
 */
const SEND_MESSAGE_PINVOKE = "Add-Type -Namespace Xaihi -Name Win -MemberDefinition '[DllImport(\"user32.dll\", SetLastError=true)] public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);'"

export const WINDOWS_MONITOR_OFF_SCRIPT = [
  SEND_MESSAGE_PINVOKE,
  '[Xaihi.Win]::SendMessageW([IntPtr]0xffff, 0xF170, [IntPtr]2, [IntPtr]0) | Out-Null',
].join('; ')

export const WINDOWS_SCREENSAVER_SCRIPT = [
  SEND_MESSAGE_PINVOKE,
  '[Xaihi.Win]::SendMessageW([IntPtr]0xffff, 0xF140, [IntPtr]0, [IntPtr]0) | Out-Null',
].join('; ')

/** 状态采集：一律走 ASCII 别名，不读任何本地化标签。 */
export const WINDOWS_STATUS_SCRIPT = [
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  'powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE',
  'powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE',
  'reg query HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power /v HibernateEnabled',
].join('; ')

/** 睡眠脚本：`bHibernate=false` 直接调 powrprof，绕开 rundll32 那条休眠歧义。 */
export const WINDOWS_SLEEP_SCRIPT = [
  'Add-Type -Namespace Xaihi -Name Powr -MemberDefinition \'[DllImport("powrprof.dll", SetLastError=true)] public static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);\'',
  '[Xaihi.Powr]::SetSuspendState($false, $true, $false) | Out-Null',
  'exit 0',
].join('; ')

/** @param seconds - 0 表示一直持有到进程被终止。 */
export function windowsHoldScript(seconds: number): string {
  const flags = '0x80000000 -bor 0x00000001'
  const wait = seconds > 0 ? `Start-Sleep -Seconds ${String(seconds)}` : 'while ($true) { Start-Sleep -Seconds 30 }'
  return [
    'Add-Type -Namespace Xaihi -Name Exec -MemberDefinition \'[DllImport("kernel32.dll", SetLastError=true)] public static extern uint SetThreadExecutionState(uint esFlags);\'',
    `[Xaihi.Exec]::SetThreadExecutionState(${flags}) | Out-Null`,
    wait,
  ].join('; ')
}

/** 一份 sleep 设置（秒）；`null` 表示"从不"，与"读不到"是两件事，所以调用方看 `known`。 */
export interface IdleSetting {
  /** 交流电下的秒数；null = 从不。 */
  acSeconds: number | null
  /** 直流（电池）下的秒数；null = 从不。 */
  dcSeconds: number | null
  /** 这一段到底解析出来了没有。 */
  known: boolean
}

const HEX = /0x([0-9a-fA-F]{1,8})/g
/** GUID 的十六进制形状是 locale 无关的段边界。 */
const GUID_SHAPE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/i

/**
 * 解析一段 `powercfg /query` 输出里某个别名对应的 AC / DC 值。
 *
 * 锚点只有三个 locale 无关的东西：ASCII 别名本身（英文是 `Alias: STANDBYIDLE`，中文是
 * `GUID 别名: STANDBYIDLE`，两边这个词都不一样，但别名 token 一样）、GUID 形状、以及
 * `0x` 值的**位置**（别名行之后、下一段之前的最后两个就是 AC、DC）。
 * @param text - 整段输出（中文或英文系统都可以）。
 * @param alias - ASCII 别名，如 `STANDBYIDLE`。
 */
export function parsePowercfgSetting(text: string, alias: string): IdleSetting {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((line) => new RegExp(`\\b${alias}\\b`).test(line))
  if (at === -1) return { acSeconds: null, dcSeconds: null, known: false }
  const hexes: number[] = []
  for (const line of lines.slice(at + 1)) {
    if (GUID_SHAPE.test(line)) break
    for (const match of line.matchAll(HEX)) {
      const parsed = Number.parseInt(match[1] ?? '0', 16)
      hexes.push(Number.isNaN(parsed) ? 0 : parsed)
    }
  }
  if (hexes.length < 2) return { acSeconds: null, dcSeconds: null, known: false }
  const toSeconds = (value: number): number | null => (value === 0 || value === 0xffffffff ? null : value)
  return { acSeconds: toSeconds(hexes[hexes.length - 2] as number), dcSeconds: toSeconds(hexes[hexes.length - 1] as number), known: true }
}

/** `reg query ... /v HibernateEnabled` 的 DWORD。 */
export function parseHibernateEnabled(text: string): boolean | null {
  const match = /HibernateEnabled\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i.exec(text)
  if (match === null) return null
  return (Number.parseInt(match[1] ?? '0', 16) & 1) === 1
}

/** macOS `pmset -g custom` 的一个电源段。 */
export interface MacPowerSection {
  /** `sleep` 的秒数；null = Never。 */
  systemSleepSeconds: number | null
  /** `displaysleep` 的秒数；null = Never。 */
  displaySleepSeconds: number | null
  /** `hibernatemode` 原值。 */
  hibernateMode: number | null
}

/**
 * 解析 `pmset -g custom`。
 * @param text - 命令输出。
 * @returns 按段名（`Battery Power` / `AC Power`）给出的设置。
 */
export function parseMacCustom(text: string): Record<string, MacPowerSection> {
  interface Draft {
    sleep?: number | null
    display?: number | null
    hibernate?: number | null
  }
  const drafts = new Map<string, Draft>()
  let current: Draft | undefined
  for (const line of text.split(/\r?\n/)) {
    const header = /^(\S.*?)\s*:\s*$/.exec(line)
    if (header !== null) {
      current = {}
      drafts.set(header[1] as string, current)
      continue
    }
    if (current === undefined) continue
    const entry = /^\s*(\w+)\s+(\S+)\s*$/.exec(line)
    if (entry === null) continue
    const key = entry[1] as string
    const raw = Number.parseInt(entry[2] ?? '', 10)
    const value = Number.isNaN(raw) ? null : raw
    if (key === 'sleep') current.sleep = value
    else if (key === 'displaysleep') current.display = value
    else if (key === 'hibernatemode') current.hibernate = value
  }
  const sections: Record<string, MacPowerSection> = {}
  for (const [name, draft] of drafts) {
    // pmset 的 sleep / displaysleep 单位是分钟；0 是 Never。
    sections[name] = {
      systemSleepSeconds: draft.sleep === null || draft.sleep === undefined || draft.sleep === 0 ? null : draft.sleep * 60,
      displaySleepSeconds: draft.display === null || draft.display === undefined || draft.display === 0 ? null : draft.display * 60,
      hibernateMode: draft.hibernate ?? null,
    }
  }
  return sections
}

/** 一条系统级断言持有者。 */
export interface AssertionHolder {
  pid: number
  /** 进程名，`pid 1984(Vorssaint)` 里括号中的那个。 */
  process: string
  /** 断言类型，如 `PreventUserIdleSystemSleep`。 */
  kind: string
  /** `named:` 后面那个名字，可能没有。 */
  name: string | null
}

/**
 * 解析 `pmset -g assertions`。
 *
 * 只看系统级计数会得出"没人拦"的错误结论——计数是所有持有者的 OR，谁在拦必须看列表。
 * @param text - 命令输出。
 */
export function parseMacAssertions(text: string): { counters: Record<string, number>; holders: AssertionHolder[] } {
  const counters: Record<string, number> = {}
  const holders: AssertionHolder[] = []
  for (const line of text.split(/\r?\n/)) {
    const counter = /^\s{2,}(\w+)\s+(\d+)\s*$/.exec(line)
    if (counter !== null) {
      counters[counter[1] as string] = Number.parseInt(counter[2] ?? '0', 10)
      continue
    }
    const holder = /\bpid\s+(\d+)\(([^)]+)\):.*?\b(Prevent\w+|UserIsActive|NetworkClientActive|ExternalMedia|BackgroundTask)\b(?:\s+named:\s*"([^"]*)")?/.exec(line)
    if (holder !== null) {
      holders.push({
        pid: Number.parseInt(holder[1] ?? '0', 10),
        process: holder[2] ?? '',
        kind: holder[3] ?? '',
        name: holder[4] ?? null,
      })
    }
  }
  return { counters, holders }
}
