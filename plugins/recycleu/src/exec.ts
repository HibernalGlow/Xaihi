/**
 * 执行层：把"清空回收站"这条外部命令交给 DSH 的子进程缝，并原样保住上游那四种结局。
 *
 * 这里不自己 `child_process.execFile`：上游 `platform.ts:74-81` 用的就是 `execFile`，
 * 而 Xaihi 侧执行外部程序的缝是 `ctx.subprocess`（`docs/service-mapping.md`「子进程 / 命令执行」
 * 那一行，判据是"DSH 已有 ⇒ 不搬基础件"）。`ctx.subprocess` 管的是执行环境
 * （scrubbed env、可执行文件解析、**整棵进程树**的终止），正是"powershell 被杀但子树还在清盘"
 * 这种事故唯一收得住的地方。形状与理由同 `plugins/sleept/src/exec.ts`。
 *
 * **可恢复删除的语义（上游原样，不美化）**：回收站本身是"删了还能捡回来"的那一层，
 * `Clear-RecycleBin` 是它的终点 —— 定义里 `dangerPrompt.body` 说得直接
 * （`node-definitions/recycleu.json`："这会永久清空选定回收站，之后无法再从 Windows 恢复其中的文件"）。
 * 所以这一层不许把结局压成一个布尔：四种 `status` 各有含义，
 * `empty`（本来就是空的）算成功但**不**计入 `cleanCount`，那是 `core.ts` 的 `cleanOnce`
 * 里 `if (result.status === "cleaned")` 那一行在做的事，本文件只负责如实报状态。
 *
 * **macOS 那条腿是本仓自己加的，不是搬运**（上游 `platform.ts` 只有 win32；使用者拍板要
 * 本机可用的废纸篓，决定与实测数字见 `docs/adr/0022-*.md`）。它发的是 `osascript` 驱动
 * Finder，一条脚本同时答出 `cleaned` / `empty`，因为 macOS 这边没有一个"本来就是空的"
 * 专用报错可抄（Windows 那条靠 `platform.ts:83-88` 的正则，而 AppleScript 的失败文字
 * **是本地化的**：本机实测 `… execution error: 变量“bogusPropertyZzz”没有定义。 (-2753)`，
 * 所以 darwin 侧只认括号里的错误码，一个字面的句子都不认——与 `plugins/sleept/src/platform.ts:8-14`
 * 那条"只信码值不信本地化标签"的纪律同源）。正因为失败文字里也可能出现 `empty` 这个词，
 * darwin 侧**不复用** `mapEmptyFailure`：走错一步就是把"清不掉"报成"本来就是空的"（成功）。
 *
 * @module xaihi-recycleu/exec
 */

import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { EmptyRecycleBinResult, RecycleuRuntime } from './core.ts'

/** 一条待执行的命令（argv 原样，graceMs 交给 `ctx.subprocess` 的树级终止）。 */
export interface PlannedCommand {
  argv: string[]
  graceMs: number
}

/** 上游 `platform.ts:64` 那个盘符正则：单个字母，可选冒号。 */
const DRIVE_LETTER = /^([a-zA-Z])(?::)?$/

/**
 * 生成"清空回收站"的 argv。
 *
 * 返回 `null` 表示这条命令不该发出去：盘符给了但不是单个字母——上游此时不抛异常，
 * 而是回 `{ status: "failed", message: 'Invalid recycle bin drive letter: …' }`
 * （`platform.ts:65-67`），把判断留给调用方，所以这里也只报"发不出去"。
 *
 * @param driveLetter - 定义字段 `driveLetter`，空串表示"全部回收站"（上游 `platform.ts:70-72`）。
 */
export function planRecycleuEmpty (driveLetter?: string): PlannedCommand | null {
  const requested = driveLetter?.trim() ?? ''
  // `noUncheckedIndexedAccess`：捕获组 1 在类型上是 `string | undefined`，所以先取出来再转大写
  // （上游 `platform.ts:64` 那句 `?.[1].toUpperCase()` 是同一个算法，只是那边没开这条严格度）。
  const letter = requested === '' ? undefined : requested.match(DRIVE_LETTER)?.[1]
  const match = letter === undefined ? undefined : letter.toUpperCase()
  if (requested !== '' && match === undefined) return null
  const clearCommand = match
    ? `Clear-RecycleBin -DriveLetter ${match} -Force -ErrorAction Stop`
    : 'Clear-RecycleBin -Force -ErrorAction Stop'
  // `$ProgressPreference` 那一行与四个 flag 都是上游原文（`platform.ts:73-80`）：
  // 少一条 `-NoProfile`，使用者的 PowerShell profile 就会掺进这次执行。
  return {
    argv: [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$ProgressPreference = 'SilentlyContinue'; ${clearCommand}`,
    ],
    graceMs: 5_000,
  }
}

/**
 * PowerShell 的失败文本 → 上游那四种结局之一。
 * 正则与两条消息逐条抄自 `platform.ts:83-88`（"already empty" 那类失败在 Windows 上是
 * 正常态，不是错误，所以必须分出来而不是咽掉）。
 */
export function mapEmptyFailure (message: string): EmptyRecycleBinResult {
  if (/empty|not contain|cannot find/i.test(message)) {
    return { status: 'empty', message: 'Recycle bin is already empty.' }
  }
  return { status: 'failed', message: `Failed to empty recycle bin: ${message}` }
}

/**
 * macOS 那条腿的 AppleScript 原文。
 *
 * 先 `count` 再决定要不要 `empty the trash`，是为了保住上游那四种结局里的 `empty`：
 * Finder 在空废纸篓上跑 `empty the trash` 不报错（rc=0 而什么都不说），若只看退出码，
 * "本来就是空的"会被记成"清掉了一次"，而 `cleanOnce` 会为此加一个 `cleanCount`。
 * 两个答案 token 是我们自己印的 ASCII，不随系统语言变。
 */
export const MAC_TRASH_SCRIPT = [
  'tell application "Finder"',
  'set n to count (items of trash)',
  'if n is 0 then',
  'return "empty"',
  'end if',
  'empty the trash',
  'return "cleaned"',
  'end tell',
].join('\n')

/** `osascript` 的 argv：`-e` 后面是整段脚本，不经 shell，所以没有引号注入面。 */
export function planMacRecycleuEmpty (): PlannedCommand {
  return { argv: ['osascript', '-e', MAC_TRASH_SCRIPT], graceMs: 5_000 }
}

/**
 * 按平台生成"这次要发的命令"，`null` 表示这台机器上这条命令发不出去。
 *
 * 三个平台的分派都只在这里，`planRecycleuEmpty` 保持 win32 原形（`cli.spec.ts` 那条
 * 逐元素钉住上游 argv 的尺照旧有效）。darwin 不认盘符：macOS 的废纸篓没有"每个盘一份"
 * 这一层，给了盘符就不是"格式不对"而是"这件事在这里不存在"，由调用方说清是哪一种。
 */
export function planRecycleuEmptyFor (platform: NodeJS.Platform, driveLetter?: string): PlannedCommand | null {
  if (platform === 'win32') return planRecycleuEmpty(driveLetter)
  if (platform === 'darwin') return (driveLetter?.trim() ?? '') === '' ? planMacRecycleuEmpty() : null
  return null
}

/**
 * AppleScript 的失败文本 → 结局。只认末尾括号里的错误码。
 *
 * `-1743` = 没有向目标 App 发 Apple 事件的自动化权限（TCC）。这一条单独分出来是因为
 * 它的解法不在本仓：使用者要在"系统设置 → 隐私与安全性 → 自动化"里放行，
 * 把它咽进通用 `failed` 就是把一个可修的权限问题说成了一次普通失败。
 * 码值本身是 Apple 文档的说法，**本机没有实测到** —— 这台机器上自动化权限早已放行，
 * 连 `Terminal` 都直接答了话，造不出被拒的那次调用（见 ADR-0022 的"没测到的"那一节）。
 */
export function mapMacEmptyFailure (message: string): EmptyRecycleBinResult {
  if (/\(-1743\)/.test(message)) {
    return {
      status: 'failed',
      message: 'Failed to empty recycle bin: not authorized to control Finder (-1743). '
        + 'Allow it under System Settings → Privacy & Security → Automation.',
    }
  }
  return { status: 'failed', message: `Failed to empty recycle bin: ${message}` }
}

/** 本机废纸篓没有盘符这一层；这句是说给使用者听的，不是"参数写错了"。 */
const MAC_DRIVE_MESSAGE = 'macOS has no per-drive recycle bin: leave the drive letter empty to empty the Trash.'

/**
 * 宿主侧的 `RecycleuRuntime`：`core.ts` 只认这个接口，所以内核不必知道执行走的是哪条缝。
 *
 * @param runtime - DSH 的 `ctx.subprocess`。
 * @param cwd - spec 要求显式给工作目录；电源/回收站命令与之无关。
 * @param platform - 时间源与平台判定，测试用（缺省取真实平台）。
 */
export function createSubprocessRecycleuRuntime (
  runtime: SubprocessRuntime,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
): RecycleuRuntime {
  /** 发一条命令并取回退出码与两条收集到的流；win32 与 darwin 两条腿共用同一档 stdio 上限。 */
  const run = async (command: PlannedCommand) => {
    const handle = runtime.spawn({
      argv: command.argv,
      cwd,
      graceMs: command.graceMs,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 8 * 1024 }, stderr: { maxBytes: 8 * 1024 } },
    })
    const outcome = await handle.done
    return {
      exitCode: outcome.exitCode,
      stdout: handle.collected.stdout?.readFrom(0).text ?? '',
      stderr: handle.collected.stderr?.readFrom(0).text ?? '',
    }
  }

  /** 非零退出时那句"为什么"：没有 stderr 就只能说退出码，不替它编。 */
  const failureDetail = (command: PlannedCommand, stderr: string, exitCode: number | null): string =>
    stderr.trim() === '' ? `${String(command.argv[0])} exited ${String(exitCode)}` : stderr.trim()

  return {
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    async emptyRecycleBin (driveLetter?: string): Promise<EmptyRecycleBinResult> {
      const requested = driveLetter?.trim() ?? ''

      if (platform === 'darwin') {
        if (requested !== '') return { status: 'failed', message: MAC_DRIVE_MESSAGE }
        const command = planMacRecycleuEmpty()
        const result = await run(command)
        if (result.exitCode === 0) {
          const answer = result.stdout.trim()
          if (answer === 'empty') return { status: 'empty', message: 'Recycle bin is already empty.' }
          if (answer === 'cleaned') return { status: 'cleaned', message: 'Recycle bin emptied.' }
          // rc=0 而答案不是本文件印的那两个 ASCII 词：脚本与预期已经不一致了，
          // 这里替它挑一个结局就是伪造，所以如实报失败。
          return { status: 'failed', message: `Failed to empty recycle bin: unexpected Trash answer ${JSON.stringify(answer)}` }
        }
        return mapMacEmptyFailure(failureDetail(command, result.stderr, result.exitCode))
      }

      // 上游 `platform.ts:57-62`：这台机器上没有这件事，不是"这台机器失败了"。
      if (platform !== 'win32') {
        return { status: 'unsupported', message: 'Recycle bin cleanup is supported on Windows and macOS only.' }
      }
      if (requested !== '' && planRecycleuEmpty(requested) === null) {
        return { status: 'failed', message: `Invalid recycle bin drive letter: ${driveLetter}` }
      }
      const command = planRecycleuEmpty(requested)
      if (command === null) return { status: 'failed', message: `Invalid recycle bin drive letter: ${driveLetter}` }
      const requestedLetter = requested === '' ? undefined : requested.match(DRIVE_LETTER)?.[1]
      const scopedDrive = requestedLetter === undefined ? undefined : requestedLetter.toUpperCase()
      const result = await run(command)
      if (result.exitCode === 0) {
        return {
          status: 'cleaned',
          message: scopedDrive ? `Recycle bin emptied for drive ${scopedDrive}:` : 'Recycle bin emptied.',
        }
      }
      return mapEmptyFailure(failureDetail(command, result.stderr, result.exitCode))
    },
  }
}

/**
 * 缺口（不是绕过）：`start` 这条自动清理循环的**取消与暂停**。
 *
 * 上游把 `isCancelled` / `waitWhilePaused` 从引导流接进来
 * （`<noxide>/packages/nodes/recycleu/src/cli.ts:108-124`），内核靠它们收尾。
 * Xaihi 侧现在两头都没有：
 * 1. 工具路径上 DSH 是有取消信号的（`docs/subsystems/tools.md:219-220` 的
 *    `ToolExecution.signal`，"Required caller-owned cancellation for this invocation"），
 *    但 `@hibernalglow/xaihi-sdk` 的 `defineNode` 没把 `exec.signal` 递进
 *    `NodeCall`（`packages/node-sdk/src/define-node.ts:50-54`），插件侧也不该自己去
 *    监听 `tools/pre-execute` 拼第二条取消通路；
 * 2. 长驻/定时那半边按 `docs/service-mapping.md`「长任务与提醒 ⇒ 不搬，也不自建队列」
 *    应落 `ctx.jobs` / `ctx.schedule`，本包没接。
 * 所以 `src/index.ts` 里 `start` 的 `isCancelled` 目前恒为未取消，界面上能停的唯一办法是
 * 等它跑完 `maxCycles`；`maxCycles = 0`（无限）那一条在接好之前**被拒绝**，见那里。
 */
export const CANCELLATION_GAP = 'NodeCall 不带 exec.signal（node-sdk），耐久定时属 ctx.jobs：两头都未接'
