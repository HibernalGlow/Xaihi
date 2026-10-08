/**
 * 一个**真的会起进程**的 `SubprocessSeam`（`src/exec.ts:49` 那个结构类型），只给测试用。
 *
 * 为什么要有它：`src/exec.ts` 把上游 `platform.ts:626-638` 那份模块级 `runRaw()` 换成了
 * DSH 的 `ctx.subprocess`，于是产物里**不许**出现 `node:child_process`（`docs/service-mapping.md`
 * 「子进程 / 命令执行 ⇒ 不搬基础件」）。但这条缝的三处映射（退出码、起不来、缓冲区）只有在
 * 真进程上才量得到——内存替身会正好绕过它们。所以把 `node:child_process` 放在**测试半边**：
 * 产物不含它（`node scripts/check-node-bundle.mjs --dir plugins/smartzip` 仍在管这条），
 * 而被测的 `src/exec.ts` + `src/platform.ts` 走的是真进程。
 *
 * 形状照 `plugins/findz/tests/fixtures/local-subprocess.ts`，两处按本包的类型改：
 * - 本包不依赖 `@deepseek-ai/dsh-subprocess`（加依赖要跑 `pnpm install`，本任务不许碰锁文件），
 *   所以实现的是 `src/exec.ts` 自己声明的那一小块，不是 DSH 那份 Service Definition；
 * - `exec.ts` 读的是 `collected.stdout.readFrom(0).text`（收完再读），不是裸流，
 *   所以这里把两段输出攒成 Buffer 再按字节偏移交回去。
 *
 * `spawn` 失败（可执行文件不存在）在 Node 里是异步 `error` 事件，这里把它接到 `done` 的拒绝上，
 * 于是 `exec.ts` 的 `catch` 读到的是那句原因——与上游 `execFile` 的 `error.code = "ENOENT"`
 * 同档（`src/exec.ts` 文件头对齐点 2）。
 *
 * @module xaihi-smartzip/tests/fixtures/local-subprocess
 */

import { spawn } from 'node:child_process'
import type { SubprocessSeam } from '../../src/exec.ts'

/** 一次 `spawn` 攒出来的输出字节数；超过 spec 给的上限就截，行为照 DSH 的缝。 */
export function localSubprocess (options: { cwd?: string } = {}): SubprocessSeam {
  return {
    spawn (spec) {
      const [program, ...args] = spec.argv
      const child = spawn(program as string, args, {
        cwd: spec.cwd ?? options.cwd ?? process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      const maxOut = spec.stdio.stdout.maxBytes
      const maxErr = spec.stdio.stderr.maxBytes
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let outBytes = 0
      let errBytes = 0
      child.stdout.on('data', (chunk: Buffer) => {
        if (outBytes >= maxOut) return
        const kept = chunk.subarray(0, maxOut - outBytes)
        stdout.push(kept)
        outBytes += kept.length
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (errBytes >= maxErr) return
        const kept = chunk.subarray(0, maxErr - errBytes)
        stderr.push(kept)
        errBytes += kept.length
      })

      const done = new Promise<{ exitCode: number | null }>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (exitCode) => { resolve({ exitCode }) })
      })

      return {
        done,
        collected: {
          stdout: { readFrom: (fromByte) => ({ text: Buffer.concat(stdout).subarray(fromByte).toString('utf8') }) },
          stderr: { readFrom: (fromByte) => ({ text: Buffer.concat(stderr).subarray(fromByte).toString('utf8') }) },
        },
      }
    },
  }
}
