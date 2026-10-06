/**
 * smartzip 的 `SmartZipRuntime` 里**外部程序那一半**：上游 `platform.ts:626-638` 那份
 * 模块级 `runRaw()`（`execFile`）在本仓的对应物，全部走 DSH 的 `ctx.subprocess`。
 *
 * 为什么不是 `node:child_process`：`docs/service-mapping.md`「子进程 / 命令执行 ⇒ **不搬**
 * 基础件」那一行的判据是 `subprocess.md` 的 `ctx.subprocess`，原话"节点要外部程序就走
 * `ctx.subprocess`，权限与审批由 DSH 缝负责"。上游那份 `execFile(command, args, {...})`
 * 因此在 Xaihi 没有对应物——把它搬进来就是给 DSH 已经提供的能力再造一条腿。
 * 落地形状与 `plugins/bandia/src/exec.ts`、`plugins/sleept/src/exec.ts`、
 * `plugins/recycleu/src/exec.ts` 同源（`spawn(spec)` → `handle.done` →
 * `handle.collected.*.readFrom(0).text`）。
 *
 * `SubprocessSeam` 是本包**自己声明的结构类型**，不是 DSH 那份 Service Definition 的副本：
 * 真源是 `@deepseek-ai/dsh-subprocess@0.2.0-rc.2` 的 `SubprocessRuntime` /
 * `SubprocessSpawnSpec` / `SubprocessHandle` / `SubprocessOutcome`（bandia 现读过那份
 * `.d.ts`：`spawn` 的 spec 要 `argv` / `cwd` / `graceMs` / `stdio`，`done` 带
 * `{ exitCode: number | null }`，`collected` 两侧各一个 `readFrom(fromByte).text`）。
 * 这里只写本包用到的那一小块。**依赖请求**与 bandia 同一条：把
 * `@deepseek-ai/dsh-subprocess` 加进 devDependencies/peerDependencies 之后这个结构类型
 * 就该删掉、直接 `import type`——加依赖要跑 `pnpm install`，本任务不许碰锁文件。
 *
 * 与上游 `runRaw` 的四处语义对齐（每处都只可能往"更诚实"的方向偏）：
 * 1. **退出码**：上游 `code = typeof error.code === "number" ? error.code : error ? 1 : 0`
 *    （`:629-630`）。这里是 `outcome.exitCode ?? 1`：正常退出用真码，被信号杀死
 *    （`exitCode` 为 `null`）折成 1，与上游"error 且没有数字码 ⇒ 1"同档。
 * 2. **起不来（ENOENT）**：上游 `execFile` 把它折成 `{code: 1, stderr: <error.message>}`
 *    （`code` 是字符串 `'ENOENT'` ⇒ 走 `error ? 1 : 0`，`stderr` 走那句三元）。
 *    `ctx.subprocess` 对 spawn 失败是**拒绝**，这里同样折成 `{code: 1, stderr: 原因}`，
 *    于是内核 `archiveTestFailureMessage` / `conciseArchiveError` 读到的仍是那句原因。
 *    把它折成 0 才是伪造（同一条判断见 `plugins/bandia/src/exec.ts:24-28`）。
 * 3. **`detached`（只有 `open` 经 7zFM 那一支用）**：上游 `child.once("spawn", …)` +
 *    `unref()`（`:633-636`）——即"进程起来了就算成功，不等它退出"。`ctx.subprocess`
 *    不暴露 `spawn` 事件，所以这里是"`spawn` 同步返回即算起来"，随后**不等 `done`**、
 *    但必须挂一个 `catch`，否则没人接的拒绝会变成 unhandled rejection。落差是
 *    "GUI 秒退"在上游可能被读成非 0、在这里一律读成 0；这一支的产物是"打开文件管理器"，
 *    没有可核对的后果，所以按上游那句 `code: 0` 走。
 * 4. **缓冲区**：上游 `maxBuffer: 1024 * 1024 * 32`（`:628`）原样搬成 `OUTPUT_BYTES`，
 *    不在这里另定一个数（`7z l -slt` 的清单靠它）。上游的 `windowsHide: true` 不需要对应物：
 *    `ctx.subprocess` 明文不经过 shell（`types.d.ts:70`，bandia 现读过），
 *    控制台窗口那件事由 DSH 的缝负责。
 *
 * @module xaihi-smartzip/exec
 */

import type { CommandResult } from "./core.ts"
import type { SmartZipRunCommand } from "./platform.ts"

/** `ctx.subprocess` 里本包用到的那一小块（真源见文件头点名的 `dsh-subprocess`）。 */
export interface SubprocessSeam {
  spawn (spec: {
    argv: readonly string[]
    cwd: string
    graceMs: number
    stdio: {
      stdin: 'ignore'
      stdout: { maxBytes: number }
      stderr: { maxBytes: number }
    }
  }): {
    readonly done: Promise<{ exitCode: number | null }>
    readonly collected: {
      readonly stdout?: { readFrom (fromByte: number): { text: string } }
      readonly stderr?: { readFrom (fromByte: number): { text: string } }
    }
  }
}

/** 上游 `execFile` 的 `maxBuffer: 1024 * 1024 * 32`（`platform.ts:628`）。 */
const OUTPUT_BYTES = 32 * 1024 * 1024

/** `ctx.subprocess` 的终止宽限；与 `plugins/bandia/src/exec.ts:91`、`plugins/recycleu/src/exec.ts:63` 同一档。 */
const GRACE_MS = 5_000

export interface SmartZipExecOptions {
  /** 子进程工作目录：`ctx.subprocess` 的 spec 要求显式给，不猜。 */
  cwd: string
}

/**
 * 把 `ctx.subprocess` 包成上游那份 `runRaw` 的形态（`platform.ts` 的 `SmartZipRunCommand`）。
 * @param subprocess - DSH 的 `ctx.subprocess`（取用方式见 `src/index.ts`）。
 * @param options - 见 `SmartZipExecOptions`。
 */
export function createSmartZipRunCommand (subprocess: SubprocessSeam, options: SmartZipExecOptions): SmartZipRunCommand {
  const spawn = (command: string, args: readonly string[]) => subprocess.spawn({
    // `argv[0]` 是程序本体；`ctx.subprocess` 明文"Never shell-interpreted here"，
    // 与上游 `execFile` 同一纪律。
    argv: [command, ...args],
    cwd: options.cwd,
    graceMs: GRACE_MS,
    stdio: { stdin: 'ignore', stdout: { maxBytes: OUTPUT_BYTES }, stderr: { maxBytes: OUTPUT_BYTES } },
  })

  return async (command, args, detached = false): Promise<CommandResult> => {
    if (detached) {
      try {
        const handle = spawn(command, args)
        // 发射后不管，但拒绝必须有人接：否则"打开了 7zFM"这件事会变成一次未处理拒绝。
        handle.done.catch(() => {})
        return { code: 0, stdout: '', stderr: '' }
      } catch (error) {
        return { code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
      }
    }
    try {
      const handle = spawn(command, args)
      const outcome = await handle.done
      return {
        code: outcome.exitCode ?? 1,
        stdout: handle.collected.stdout?.readFrom(0).text ?? '',
        stderr: handle.collected.stderr?.readFrom(0).text ?? (outcome.exitCode === null ? `${command} was terminated by a signal` : ''),
      }
    } catch (error) {
      // spawn 失败（可执行文件不存在 / 权限）在上游是 `error.code = "ENOENT"` 那一条，
      // 这里同档折成 code 1 + 那句原因，内核的错误分类才读得到它。
      return { code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
    }
  }
}
