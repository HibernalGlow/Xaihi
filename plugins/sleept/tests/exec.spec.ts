/**
 * 持有者生命周期的测试：拦截状态必须只说真话。
 *
 * 三条最容易被糊过去的地方：子进程启动失败时不许显示"已阻止"、到期自己退出时状态要自己
 * 落回未持有、stop 之后到真死之间那段必须说成"正在终止"而不是"已解除"。
 *
 * @module xaihi-sleept/tests/exec
 */

import { describe, expect, it } from 'vitest'
import type { SubprocessHandle, SubprocessOutcome } from '@deepseek-ai/dsh-subprocess'
import { createInhibitor, createRunner, type Runner } from '../src/exec.ts'
import type { PlannedCommand } from '../src/platform.ts'

const command: PlannedCommand = { argv: ['caffeinate', '-di'], graceMs: 2000, collect: false }

/** 一台可控的子进程：由测试决定它什么时候退、以什么码退。 */
function fakeRuntime(): {
  runtime: { spawn: (spec: unknown) => SubprocessHandle }
  spawned: unknown[]
  terminateCount: () => number
  settle: (outcome: SubprocessOutcome) => void
  fail: (error: Error) => void
} {
  const spawned: unknown[] = []
  let resolveDone: ((value: SubprocessOutcome) => void) | undefined
  let rejectDone: ((error: unknown) => void) | undefined
  let terminated = 0
  const handle = {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    control: undefined,
    collected: {},
    done: new Promise<SubprocessOutcome>((resolve, reject) => {
      resolveDone = resolve
      rejectDone = reject
    }),
    terminate: () => {
      terminated += 1
    },
    waitForExit: async () => true,
  } as unknown as SubprocessHandle
  return {
    spawned,
    runtime: {
      spawn: (spec) => {
        spawned.push(spec)
        return handle
      },
    },
    settle: (outcome) => resolveDone?.(outcome),
    fail: (error) => rejectDone?.(error),
    terminateCount: () => terminated,
  }
}

const runnerOf = (runtime: ReturnType<typeof fakeRuntime>['runtime']): Runner =>
  createRunner(runtime as never, '/tmp')

describe('createInhibitor', () => {
  it('未启动时 held=false 且没有到期时间', () => {
    const fake = fakeRuntime()
    const inhibitor = createInhibitor(runnerOf(fake.runtime), () => command)
    expect(inhibitor.state()).toEqual({ held: false, holdId: null, expiresAt: null, lastExit: null })
  })

  it('start 真的起了子进程，带时限就有到期时间', () => {
    const fake = fakeRuntime()
    const inhibitor = createInhibitor(runnerOf(fake.runtime), () => command, () => 1_000)
    const state = inhibitor.start({ minutes: 2 })
    expect(fake.spawned).toHaveLength(1)
    expect(state).toMatchObject({ held: true, holdId: 1, startedAt: 1_000, expiresAt: 121_000 })
    expect(inhibitor.start({ minutes: 5 })).toMatchObject({ held: true, holdId: 1, expiresAt: 121_000 })
    expect(fake.spawned).toHaveLength(1)
  })

  it('无时限的持有到期时间是 null，不是 0', () => {
    const fake = fakeRuntime()
    const inhibitor = createInhibitor(runnerOf(fake.runtime), () => command, () => 5)
    expect(inhibitor.start({}).expiresAt).toBeNull()
  })

  it('子进程自己退出（计时到期）后，状态必须落回未持有并留下结局', async () => {
    const fake = fakeRuntime()
    const inhibitor = createInhibitor(runnerOf(fake.runtime), () => command)
    inhibitor.start({ minutes: 1 })
    fake.settle({ exitCode: 0, signal: null })
    await Promise.resolve()
    await Promise.resolve()
    expect(inhibitor.state()).toMatchObject({ held: false, holdId: null, lastExit: { holdId: 1, exitCode: 0 } })
  })

  it('阳性对照：子进程起不来时绝不报告"已阻止休眠"', async () => {
    const warnings: string[] = []
    const original = console.warn
    console.warn = (message?: unknown) => { warnings.push(String(message)) }
    try {
      const fake = fakeRuntime()
      const inhibitor = createInhibitor(runnerOf(fake.runtime), () => command)
      inhibitor.start({ minutes: 1 })
      fake.fail(new Error('ENOENT caffeinate'))
      await Promise.resolve()
      await Promise.resolve()
      expect(inhibitor.state().held).toBe(false)
      expect(warnings.join('\n')).toContain('inhibitor child failed')
    } finally {
      console.warn = original
    }
  })

  it('stop 只发一次 terminate，且在子进程真死之前不谎称已解除', async () => {
    const fake = fakeRuntime()
    const inhibitor = createInhibitor(runnerOf(fake.runtime), () => command)
    expect(inhibitor.stop().held).toBe(false)
    expect(fake.terminateCount()).toBe(0)
    inhibitor.start({ minutes: 1 })
    inhibitor.stop()
    expect(inhibitor.state().held).toBe(true)
    fake.settle({ exitCode: null, signal: 'SIGTERM' })
    await Promise.resolve()
    await Promise.resolve()
    expect(fake.terminateCount()).toBe(1)
    expect(inhibitor.state()).toMatchObject({ held: false, holdId: null, lastExit: { holdId: 1, exitCode: null } })
  })
})
