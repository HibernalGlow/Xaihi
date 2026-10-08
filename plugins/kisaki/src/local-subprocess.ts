/**
 * 一个够窄的子进程提供方：给**不在 DSH 装配里**的那两条腿用（CLI，以及本包那条真起进程的判据）。
 *
 * 为什么不直接 `require('@deepseek-ai/dsh-subprocess')`：那条 provider 属于宿主装配，
 * CLI 与判据里都没有 `ctx`。这里按 DSH 的 handle 形状实现同一套动词
 * （`spawn` / `done` / `terminate`），让 `engine-gateway.ts` 那一份客户端代码
 * 在宿主里与在终端里走**同一条协议**，不养第二套帧。
 *
 * `terminate()` 走**进程组**：入口本身可能再派生（rayon 的线程不算进程，但将来
 * `--install` 那种旁路会），按 PID 单杀会留下孤儿。POSIX 下 spawn 时 `detached: true`
 * 让它自成一个组，杀 `-pid`；Windows 用 `taskkill /T`。做不到时如实说出来，不假装收干净了。
 *
 * @module xaihi-kisaki/local-subprocess
 */
import { spawn as nodeSpawn } from 'node:child_process'
import process from 'node:process'

import type { KisakiSubprocessHandle, KisakiSubprocessRuntime } from './engine-gateway.js'

export function createLocalSubprocessRuntime(): KisakiSubprocessRuntime {
  return {
    spawn (spec) {
      const detached = process.platform !== 'win32'
      const child = nodeSpawn(spec.argv[0] as string, spec.argv.slice(1), {
        cwd: spec.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached,
        env: process.env,
      })
      const done = new Promise<{ exitCode: number | null, signal?: string | null }>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => resolve({ exitCode: code, signal }))
      })
      let terminated = false
      return {
        stdin: child.stdin ?? undefined,
        stdout: child.stdout ?? undefined,
        stderr: child.stderr ?? undefined,
        done,
        terminate () {
          if (terminated || child.exitCode !== null) return
          terminated = true
          try {
            const pid = child.pid
            if (pid === undefined) return // 没起成：没有可终止的组，交给 done 那条 reject 说原因
            if (process.platform === 'win32') {
              nodeSpawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
            } else {
              process.kill(-pid, 'SIGTERM')
            }
          } catch {
            child.kill('SIGTERM')
          }
        },
      } satisfies KisakiSubprocessHandle
    },
  }
}
