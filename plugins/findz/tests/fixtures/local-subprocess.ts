/**
 * 一个**真的会起进程**的 `SubprocessRuntime`：用 `node:child_process` 拉起目标程序，
 * 把三根流原样交出去，`done` 由 `close` 事件结算。
 *
 * 为什么不手写内存替身：`gateway.ts` 依赖真实管道的行为（半行到达、粘包、对端先关
 * stdout 再退出）。假 `Readable` 会把那部分正好绕过，而进程边界要钉的就是那些。
 *
 * 这个替身只替代 DSH 的 provider 实现，不替代管道语义 —— 所以才值得给两个 spec
 * 共用：一个喂假宿主（失败面），一个喂真内核（`kernel.integration.spec.ts`）。
 */

import { spawn } from 'node:child_process'
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'

/**
 * @param argv - 完整 argv；`argv[0]` 是要跑的程序，不经过 shell。
 * @param cwd - 子进程工作目录。
 */
export function localSubprocess(argv: readonly string[], cwd: string): SubprocessRuntime {
  return {
    spawn(spec: { argv: readonly string[]; cwd: string }): SubprocessHandle {
      const [program, ...args] = spec.argv
      const child = spawn(program as string, [...args, ...argv.slice(1)], { cwd: spec.cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      return {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        collected: {},
        done: new Promise((resolve, reject) => {
          child.on('error', reject)
          child.on('close', (code, signal) => { resolve({ exitCode: code, signal: signal ?? null }) })
        }),
        terminate: () => { child.kill('SIGKILL') },
        waitForExit: async () => true,
      } as unknown as SubprocessHandle
    },
  } as unknown as SubprocessRuntime
}
