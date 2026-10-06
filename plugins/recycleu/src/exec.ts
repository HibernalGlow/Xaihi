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
  return {
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    async emptyRecycleBin (driveLetter?: string): Promise<EmptyRecycleBinResult> {
      // 上游 `platform.ts:57-62`：非 Windows 不是"失败"，是"这台机器上没有这件事"。
      if (platform !== 'win32') {
        return { status: 'unsupported', message: 'Recycle bin cleanup is only supported on Windows.' }
      }
      const requested = driveLetter?.trim() ?? ''
      if (requested !== '' && planRecycleuEmpty(requested) === null) {
        return { status: 'failed', message: `Invalid recycle bin drive letter: ${driveLetter}` }
      }
      const command = planRecycleuEmpty(requested)
      if (command === null) return { status: 'failed', message: `Invalid recycle bin drive letter: ${driveLetter}` }
      const requestedLetter = requested === '' ? undefined : requested.match(DRIVE_LETTER)?.[1]
      const scopedDrive = requestedLetter === undefined ? undefined : requestedLetter.toUpperCase()
      const handle = runtime.spawn({
        argv: command.argv,
        cwd,
        graceMs: command.graceMs,
        stdio: { stdin: 'ignore', stdout: { maxBytes: 8 * 1024 }, stderr: { maxBytes: 8 * 1024 } },
      })
      const outcome = await handle.done
      if (outcome.exitCode === 0) {
        return {
          status: 'cleaned',
          message: scopedDrive ? `Recycle bin emptied for drive ${scopedDrive}:` : 'Recycle bin emptied.',
        }
      }
      const errorText = handle.collected.stderr?.readFrom(0).text ?? ''
      const detail = errorText.trim() === ''
        ? `${command.argv[0]} exited ${String(outcome.exitCode)}`
        : errorText.trim()
      return mapEmptyFailure(detail)
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
