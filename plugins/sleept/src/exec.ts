/**
 * 执行层：把 `platform.ts` 的计划交给 DSH 的子进程缝跑掉，并管住那个"阻止休眠"的子进程。
 *
 * 这里不自己 `child_process.spawn`：DSH 的 `ctx.subprocess` 负责执行环境（scrubbed env、
 * 可执行文件解析、**整棵进程树**的终止），而 `SetThreadExecutionState` / `caffeinate` 这种
 * 长驻子进程最容易出的事故就是"宿主退了、辅助进程还活着继续拦睡眠"，树级 terminate 正是
 * 要的那件事。出处：`docs/subsystems/subprocess.md` 的 SubprocessSpawnSpec / SubprocessHandle。
 *
 * @module xaihi-sleept/exec
 */

import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { PlannedCommand } from './platform.ts'

/** 一次短命令的结果。 */
export interface RunResult {
  /** stdout 全文（collect 模式下按字节上限截断）。 */
  text: string
  /** stderr 全文，用于把"需要管理员权限"这类原因说清楚。 */
  errorText: string
  /** 退出码；被信号杀掉时为 null。 */
  exitCode: number | null
}

/** 跑一条收集输出的命令。 */
export interface Runner {
  run(command: PlannedCommand): Promise<RunResult>
  /** 长驻：返回句柄，由调用方持有。 */
  hold(command: PlannedCommand): SubprocessHandle
}

const OUT_CAP = 64 * 1024
const ERR_CAP = 8 * 1024

/**
 * @param runtime - DSH 的 `ctx.subprocess`。
 * @param cwd - 子进程工作目录；电源命令与之无关，但 spec 要求显式给出。
 */
export function createRunner(runtime: SubprocessRuntime, cwd: string): Runner {
  return {
    run(command) {
      const handle = runtime.spawn({
        argv: command.argv,
        cwd,
        graceMs: command.graceMs,
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: OUT_CAP },
          stderr: { maxBytes: ERR_CAP },
        },
      })
      return handle.done.then((outcome) => ({
        text: handle.collected.stdout?.readFrom(0).text ?? '',
        errorText: handle.collected.stderr?.readFrom(0).text ?? '',
        exitCode: outcome.exitCode,
      }))
    },
    hold(command) {
      return runtime.spawn({
        argv: command.argv,
        cwd,
        graceMs: command.graceMs,
        stdio: { stdin: 'ignore', stdout: 'inherit', stderr: { maxBytes: ERR_CAP } },
      })
    },
  }
}

/**
 * 持有者状态；`expiresAt` 为 null 表示"直到解除或宿主退出"。
 *
 * 这里刻意没有 pid：0.2.0-rc.2 实际发布的 `SubprocessHandle` 不暴露 pid（`docs/subsystems/subprocess.md`
 * 那份写了 pid，是版本漂移，以 `@deepseek-ai/dsh-subprocess/lib/types/types.d.ts` 为准）。
 * 要知道"谁在拦"去读 `pmset -g assertions`，那是操作系统说的话，比我们记的一个数更硬。
 */
export interface InhibitorState {
  held: boolean
  /** 本插件自己的第几次持有，用来把两次 block 分开。 */
  holdId: number | null
  startedAt?: number
  expiresAt: number | null
  /** 上一次持有者自己退出的结局（计时到期或被杀）。 */
  lastExit: { holdId: number; exitCode: number | null } | null
}

/** 阻止休眠的长驻子进程。 */
export interface Inhibitor {
  start(options: { minutes?: number | undefined }): InhibitorState
  stop(): InhibitorState
  state(): InhibitorState
}

/**
 * @param runner - 执行层。
 * @param plan - 生成本平台 `block` 计划的那个函数（把平台分支留在 platform.ts）。
 * @param now - 时间源，测试用。
 */
export function createInhibitor(
  runner: Runner,
  plan: (minutes: number | undefined) => PlannedCommand,
  now: () => number = () => Date.now(),
): Inhibitor {
  let handle: SubprocessHandle | null = null
  let holdId: number | null = null
  let startedAt = 0
  let expiresAt: number | null = null
  let lastExit: InhibitorState['lastExit'] = null

  const snapshot = (): InhibitorState => (handle === null
    ? { held: false, holdId: null, expiresAt: null, lastExit }
    : { held: true, holdId, startedAt, expiresAt, lastExit })

  return {
    start(options) {
      const minutes = options.minutes
      if (handle !== null) return snapshot()
      const command = plan(minutes)
      handle = runner.hold(command)
      holdId = (holdId ?? 0) + 1
      startedAt = now()
      expiresAt = minutes !== undefined && minutes > 0 ? startedAt + minutes * 60_000 : null
      const thisHold = holdId
      handle.done.then(
        (outcome) => {
          lastExit = { holdId: thisHold, exitCode: outcome.exitCode }
          handle = null
          holdId = null
          startedAt = 0
          expiresAt = null
        },
        (error: unknown) => {
          lastExit = { holdId: thisHold, exitCode: null }
          handle = null
          holdId = null
          expiresAt = null
          // 子进程启动失败必须冒出来：否则界面会显示"已阻止休眠"而实际上什么都没持有。
          console.warn(`sleept: inhibitor child failed: ${String(error instanceof Error ? error.message : error)}`)
        },
      )
      return snapshot()
    },
    stop() {
      const current = handle
      if (current === null) return { ...snapshot(), held: false, holdId: null, expiresAt: null }
      // terminate 是这条缝唯一的终止动词，且是树级的。
      current.terminate()
      return snapshot()
    },
    state: snapshot,
  }
}
