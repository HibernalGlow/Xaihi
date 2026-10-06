/**
 * sleept 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值来源（**一条都没有跑过我们自己的代码再抄回来**）：
 * - 八条用例与全部期望值逐条抄自 `<Xiranite>` tag `noxide` 的
 *   `packages/nodes/sleept/src/core.test.ts`（114 行，同名用例同序）：
 *   `"01:01:01"`（第 7 行）、`3723`（第 11 行，1×3600 + 2×60 + 3 手算）、
 *   `maxWaitSeconds` 的 0 与 −10 都落回 0（第 19-20 行）、
 *   `"[dryrun] Countdown completed; simulated hibernate."`（第 59 行）、
 *   `"Countdown cancelled."`（第 82 行）、`"completed"` / `false` / `true` 那几枚都是上游原文。
 * - 假运行时（`now` 随 `sleep` 推进、`isCancelled` 由 `sleep` 翻转）也是上游手写的形状，
 *   连起始时间 `"2026-01-01T00:00:00"` 一起搬。
 *
 * 与上游唯一的不同是**说明符**：`./core.js` → `../src/core.ts`（本仓的形状），
 * 以及 `describe` 的标题换成本仓的中文命名口径。断言一条没删、一条没放宽，
 * 也没有 `it.skip`。
 *
 * 这里**不**测 `createSleeptInteractionSchema`：那条工厂要先有 i18next 的翻译器，
 * 而它在本网是响亮拒绝的未接面（理由见 `src/cli-i18n.ts` 的头注释）——
 * 给它写一条"断言它抛"的用例等于把未接当成契约来测，那是另一格账。
 *
 * @module xaihi-sleept/tests/core
 */

import { describe, expect, it } from 'vitest'
import type { SleeptRuntime } from '../src/core.ts'
import { countdownSeconds, formatDuration, normalizeInput, parseTargetDatetime, runSleept } from '../src/core.ts'

describe('sleept core（上游 core.test.ts 逐条搬来）', () => {
  it('把秒数折成 HH:MM:SS', () => {
    // 上游第 6-8 行：3661 秒 ⇒ 01:01:01。
    expect(formatDuration(3661)).toBe('01:01:01')
  })

  it('把 hours/minutes/seconds 折成总秒数', () => {
    // 上游第 10-12 行：1 时 2 分 3 秒 ⇒ 3723（3600 + 120 + 3，手算）。
    expect(countdownSeconds({ hours: 1, minutes: 2, seconds: 3 })).toBe(3723)
  })

  it('拒绝已经过去的目标时间', () => {
    // 上游第 14-16 行：将来判据在 `parseTargetDatetime` 的第二道门上。
    expect(() => parseTargetDatetime('2020-01-01 00:00:00', new Date('2021-01-01T00:00:00'))).toThrow()
  })

  it('零上限不当成零秒，而是"无限等待"', () => {
    // 上游第 18-21 行：`Math.max(0, Math.trunc(…))` 让 −10 落到 0，而 0 本身必须原样留着
    // （`runNetSpeedMonitor` / `runCpuMonitor` 的循环条件靠 `=== 0` 认它）。
    // 阳性对照：把那句改成 `Math.max(1, …)` 这条就红。
    expect(normalizeInput({ maxWaitSeconds: 0 }).maxWaitSeconds).toBe(0)
    expect(normalizeInput({ maxWaitSeconds: -10 }).maxWaitSeconds).toBe(0)
  })

  it('演练倒计时走注入的运行时，并在到点时动电源', async () => {
    let powerCalled = false
    let now = new Date('2026-01-01T00:00:00')
    const runtime: SleeptRuntime = {
      now: () => now,
      sleep: async (milliseconds) => {
        now = new Date(now.getTime() + milliseconds)
      },
      getCpuPercent: () => 0,
      getNetCounters: () => ({ bytesSent: 0, bytesReceived: 0 }),
      executePowerAction: () => {
        powerCalled = true
      },
    }

    const result = await runSleept({ action: 'countdown', seconds: 2, dryrun: true }, runtime)

    expect(result.success).toBe(true)
    expect(powerCalled).toBe(true)
    expect(result.data?.timerStatus).toBe('completed')
  })

  it('hibernate 走的是那条共享的电源动作契约', async () => {
    let executedMode: string | undefined
    const runtime: SleeptRuntime = {
      now: () => new Date('2026-01-01T00:00:00'),
      sleep: async () => undefined,
      getCpuPercent: () => 0,
      getNetCounters: () => ({ bytesSent: 0, bytesReceived: 0 }),
      executePowerAction: (mode) => {
        executedMode = mode
      },
    }

    const result = await runSleept({ action: 'countdown', seconds: 1, powerMode: 'hibernate', dryrun: true }, runtime)

    // 上游第 59-60 行：文案与模式两样都要对上。`powerMode` 是**透传**给运行时的，
    // 内核自己不许把它翻译成 sleep（`executePowerAction` 的第二个参数才是演练位）。
    expect(result.message).toBe('[dryrun] Countdown completed; simulated hibernate.')
    expect(executedMode).toBe('hibernate')
  })

  it('取消发生在电源动作之前，被取消的倒计时什么都不执行', async () => {
    let cancelled = false
    let powerCalled = false
    const runtime: SleeptRuntime = {
      now: () => new Date('2026-01-01T00:00:00'),
      sleep: async () => {
        cancelled = true
      },
      getCpuPercent: () => 0,
      getNetCounters: () => ({ bytesSent: 0, bytesReceived: 0 }),
      executePowerAction: () => {
        powerCalled = true
      },
      isCancelled: () => cancelled,
    }

    const result = await runSleept({ action: 'countdown', seconds: 5, dryrun: true }, runtime)

    expect(result.success).toBe(false)
    expect(result.message).toBe('Countdown cancelled.')
    expect(result.data?.timerStatus).toBe('cancelled')
    // 这条是"撤不回去的动作没被撤"的唯一防线：`tickCountdown` 里那道 `isCancelled` 一漏，
    // 前四条还全绿，只有 `powerCalled` 会诚实起来。
    expect(powerCalled).toBe(false)
  })

  it('maxWaitSeconds 为 0 的 CPU 监控一直跑到触发为止', async () => {
    let now = new Date('2026-01-01T00:00:00')
    let powerCalled = false
    const runtime: SleeptRuntime = {
      now: () => now,
      sleep: async (milliseconds) => {
        now = new Date(now.getTime() + milliseconds)
      },
      getCpuPercent: () => 0,
      getNetCounters: () => ({ bytesSent: 0, bytesReceived: 0 }),
      executePowerAction: () => {
        powerCalled = true
      },
    }

    const result = await runSleept({
      action: 'cpu',
      cpuThreshold: 10,
      cpuDuration: 1 / 60,
      maxWaitSeconds: 0,
      dryrun: true,
    }, runtime)

    // `cpuDuration: 1 / 60` 分钟 = 1 秒（内核里是 `Math.max(1, input.cpuDuration * 60)`），
    // 所以这条既钉"0 当无限"，也钉"分钟→秒"那一乘。
    expect(result.success).toBe(true)
    expect(powerCalled).toBe(true)
    expect(result.data?.timerStatus).toBe('completed')
  })
})
