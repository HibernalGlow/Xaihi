/**
 * 执行层的验收：平台分派与 macOS 那几种结局。
 *
 * 这把尺在加 macOS 这条腿之前不存在——`tests/` 里只有内核（`core.spec.ts`）与终端面
 * （`cli.spec.ts`、`tui.spec.tsx`），所以"这台机器上到底发哪条命令"从来没被钉过。
 * 下面每条期望值都是手抄的字面量，不是拿被测函数的输出比出来的
 * （AGENTS.md：期望值不许通过再调一次被测函数得到）。
 *
 * 两条最要紧的阳性对照，各自写在用例里：
 * - 把 `planRecycleuEmptyFor` 的 darwin 分支删掉（当成"其他平台"回 null），第 2 条立刻红；
 * - 让 darwin 复用 `mapEmptyFailure`，第 5 条里那句含 `empty` 的失败会被判成**成功**。
 *
 * @module xaihi-recycleu/tests/exec
 */

import { describe, expect, it } from 'vitest'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import {
  MAC_TRASH_SCRIPT,
  createSubprocessRecycleuRuntime,
  mapMacEmptyFailure,
  planMacRecycleuEmpty,
  planRecycleuEmptyFor,
} from '../src/exec.ts'

interface FakeOutcome {
  exitCode?: number | null
  stdout?: string
  stderr?: string
}

/**
 * 按 `@deepseek-ai/dsh-subprocess/lib/types/types.d.ts` 的真实形状造假：
 * `done` 给 `SubprocessOutcome`（exitCode + signal），`collected.*.readFrom(0)` 给
 * `SubprocessOutputRead`（text + nextOffset + lossy）。缺一个字段就是一条假缝。
 */
function fakeRuntime (outcome: FakeOutcome): { runtime: SubprocessRuntime; specs: Array<{ argv: readonly string[] }> } {
  const specs: Array<{ argv: readonly string[] }> = []
  const reader = (text: string) => ({
    readFrom: (fromByte: number) => ({
      text: fromByte === 0 ? text : '',
      nextOffset: text.length,
      lossy: false,
    }),
  })
  const runtime = {
    spawn (spec: { argv: readonly string[] }) {
      specs.push({ argv: spec.argv })
      return {
        collected: { stdout: reader(outcome.stdout ?? ''), stderr: reader(outcome.stderr ?? '') },
        done: Promise.resolve({ exitCode: outcome.exitCode ?? 0, signal: null }),
      }
    },
  }
  return { runtime: runtime as unknown as SubprocessRuntime, specs }
}

const runtimeFor = (platform: NodeJS.Platform, outcome: FakeOutcome) => {
  const fake = fakeRuntime(outcome)
  return { ...fake, empty: (driveLetter?: string) => createSubprocessRecycleuRuntime(fake.runtime, '/tmp', platform).emptyRecycleBin(driveLetter) }
}

/** 本文件自己重打一遍 macOS argv：期望值不来自被测函数，两者不同时这里就红。 */
const MAC_ARGV = [
  'osascript',
  '-e',
  'tell application "Finder"\nset n to count (items of trash)\nif n is 0 then\nreturn "empty"\nend if\nempty the trash\nreturn "cleaned"\nend tell',
]

describe('recycleu 执行层的平台分派', () => {
  it('win32 那条腿的 argv 与上游逐元素相同（阳性对照：动一个 flag 就红）', () => {
    expect(planRecycleuEmptyFor('win32', 'c:')?.argv).toEqual([
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "$ProgressPreference = 'SilentlyContinue'; Clear-RecycleBin -DriveLetter C -Force -ErrorAction Stop",
    ])
  })

  it('darwin 留空盘符就是 osascript 那条腿（阳性对照：删掉 darwin 分支这条红）', () => {
    const planned = planRecycleuEmptyFor('darwin')
    expect(planned?.argv).toEqual(['osascript', '-e', MAC_TRASH_SCRIPT])
    expect(planned?.argv).toEqual(MAC_ARGV)
    expect(MAC_TRASH_SCRIPT).toContain('empty the trash')
  })

  it('darwin 给了盘符不发命令；linux 无论怎样都不发（各管一件事，不许混）', () => {
    expect(planRecycleuEmptyFor('darwin', 'C')).toBeNull()
    expect(planRecycleuEmptyFor('darwin', '   ')).not.toBeNull()
    expect(planRecycleuEmptyFor('linux')).toBeNull()
    expect(planRecycleuEmptyFor('linux', 'C')).toBeNull()
  })

  it('MAC_TRASH_SCRIPT 是 8 行且不经 shell：argv 里没有 -c / sh（阳性对照：把脚本改成走 sh -c 这条红）', () => {
    expect(MAC_TRASH_SCRIPT.split('\n')).toHaveLength(8)
    const argv = planMacRecycleuEmpty().argv
    expect(argv[0]).toBe('osascript')
    expect(argv[1]).toBe('-e')
    expect(argv).not.toContain('sh')
    expect(argv).not.toContain('-c')
    expect(planMacRecycleuEmpty().graceMs).toBe(5_000)
  })
})

describe('recycleu 的 macOS runtime', () => {
  it('rc=0 + "empty" 是 empty：本来就是空的算成功但不算清过一次', async () => {
    const probe = runtimeFor('darwin', { exitCode: 0, stdout: 'empty\n' })
    const result = await probe.empty()
    expect(result).toEqual({ status: 'empty', message: 'Recycle bin is already empty.' })
    expect(probe.specs).toHaveLength(1)
  })

  it('rc=0 + "cleaned" 才是清掉了；rc=0 但答案不是那两个词就如实报失败（不许替它挑一个结局）', async () => {
    const cleaned = runtimeFor('darwin', { exitCode: 0, stdout: 'cleaned' })
    expect((await cleaned.empty()).status).toBe('cleaned')

    const weird = runtimeFor('darwin', { exitCode: 0, stdout: '4' })
    const weirdResult = await weird.empty()
    expect(weirdResult.status).toBe('failed')
    expect(weirdResult.message).toContain('"4"')
  })

  it('失败文字里带 empty 这个词时**不许**被判成"本来就是空的"（阳性对照：复用 mapEmptyFailure 这条红）', async () => {
    // 本机实测到的 AppleScript 失败行形状（zh-CN 系统，prose 是本地化的，只有码值可靠）：
    //   44:60: execution error: 变量“bogusPropertyZzz”没有定义。 (-2753)
    const detail = '44:60: execution error: The Finder can’t empty the Trash because it is not running. (-600)'
    const result = mapMacEmptyFailure(detail)
    expect(result.status).toBe('failed')
    expect(result.message).toContain('-600')

    const probe = runtimeFor('darwin', { exitCode: 1, stderr: detail })
    expect((await probe.empty()).status).toBe('failed')
  })

  it('-1743 单独分出来并把解法说出口（码值是 Apple 文档的说法，本机造不出被拒的那次调用）', () => {
    const result = mapMacEmptyFailure('28:57: execution error: 文件处理程序“osascript”没有获得允许发送 Apple 事件给“Finder”。 (-1743)')
    expect(result.status).toBe('failed')
    expect(result.message).toContain('-1743')
    expect(result.message).toContain('Automation')
  })

  it('没有 stderr 的非零退出只说退出码；盘符在命令之前就拒，一次 spawn 都不发', async () => {
    const noStderr = runtimeFor('darwin', { exitCode: 1 })
    const failed = await noStderr.empty()
    expect(failed.status).toBe('failed')
    expect(failed.message).toContain('osascript exited 1')

    const withDrive = runtimeFor('darwin', { exitCode: 0, stdout: 'cleaned' })
    const refused = await withDrive.empty('C')
    expect(refused.status).toBe('failed')
    expect(refused.message).toContain('leave the drive letter empty')
    expect(withDrive.specs).toHaveLength(0)
  })

  it('其他平台仍然是"这台机器上没有这件事"，且明说支持哪两个平台', async () => {
    const probe = runtimeFor('linux', { exitCode: 0, stdout: 'cleaned' })
    const result = await probe.empty()
    expect(result.status).toBe('unsupported')
    expect(result.message).toBe('Recycle bin cleanup is supported on Windows and macOS only.')
    expect(probe.specs).toHaveLength(0)
  })
})
