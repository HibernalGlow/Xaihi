/**
 * `duration.ts` 那两条纯函数的用例。
 *
 * 为什么单独一份：`countdownSeconds` / `formatDuration` 是从基线 `core.ts` 第 116-126 行
 * **搬出来**的（本包对基线的唯一非类型偏离，判据见 `src/duration.ts` 的头注释与
 * `docs/stages/sleept-core-close.md`）。搬完之后必须能证明两件事：
 * ① 函数体还是上游那一身（下面的期望值全是**手算**的，没有一条来自跑我们自己的代码）；
 * ② `core.ts` 的再导出指的是**同一份实现**，不是又抄了一遍的第二份。
 *
 * 期望值怎么来的，逐条写着（上游表达式：
 * `Math.max(0, Math.trunc(hours ?? 0) * 3600 + Math.trunc(minutes ?? 0) * 60 + Math.trunc(seconds ?? 0)`；
 * `HH:MM:SS` 各段 `padStart(2, "0")`）：
 * - `0 → "00:00:00"`、`59 → "00:00:59"`、`60 → "00:01:00"`、`3600 → "01:00:00"`、
 *   `86399 → "23:59:59"`：都是 60 / 3600 的整数倍边界，纸面除法。
 * - `-5 → "00:00:00"`：`Math.max(0, …)` 那一夹。
 * - `3661 → "01:01:01"`：上游 `core.test.ts:7` 的那一条，同一个期望值。
 * - `{1,30,45} → 5445`：1×3600 + 30×60 + 45 = 3600 + 1800 + 45。
 * - `{0,90,0} → 5400`：内核**不**把分钟进位成小时，90 分就是 5400 秒。
 * - `{}` 与 `{seconds: 59.9} → 0 / 59`：缺字段走 `?? 0`，小数走 `Math.trunc`。
 * - 负数小时 ⇒ 0：外层那个 `Math.max(0, …)`。
 *
 * @module xaihi-sleept/tests/duration
 */

import { describe, expect, it } from 'vitest'
import * as core from '../src/core.ts'
import { countdownSeconds, formatDuration } from '../src/duration.ts'

describe('sleept duration（从基线 core.ts 搬出来的那两条）', () => {
  it('formatDuration 折成 HH:MM:SS，各段补零', () => {
    expect(formatDuration(0)).toBe('00:00:00')
    expect(formatDuration(59)).toBe('00:00:59')
    expect(formatDuration(60)).toBe('00:01:00')
    expect(formatDuration(3600)).toBe('01:00:00')
    expect(formatDuration(86399)).toBe('23:59:59')
    expect(formatDuration(3661)).toBe('01:01:01')
  })

  it('负数与小数都夹回整数秒再格式化', () => {
    expect(formatDuration(-5)).toBe('00:00:00')
    expect(formatDuration(1.9)).toBe('00:00:01')
  })

  it('countdownSeconds 只相加，不做分钟→小时的进位', () => {
    expect(countdownSeconds({ hours: 1, minutes: 2, seconds: 3 })).toBe(3723)
    expect(countdownSeconds({ hours: 1, minutes: 30, seconds: 45 })).toBe(5445)
    expect(countdownSeconds({ hours: 0, minutes: 90, seconds: 0 })).toBe(5400)
  })

  it('缺字段按 0 算，负数被外层 max 夹成 0，小数走 trunc', () => {
    expect(countdownSeconds({})).toBe(0)
    expect(countdownSeconds({ hours: -1 })).toBe(0)
    expect(countdownSeconds({ seconds: 59.9 })).toBe(59)
  })

  it('两条函数摞起来就是上游那条：1:01:01', () => {
    expect(formatDuration(countdownSeconds({ hours: 1, minutes: 1, seconds: 1 }))).toBe('01:01:01')
  })

  it('core.ts 再导出的是同一份实现，不是第二份副本', () => {
    // 阳性对照：把 `src/core.ts` 那句 `export { countdownSeconds, formatDuration }` 删掉，
    // 这两个 `toBe` 立刻拿到 `undefined`；把 core 换成另写一份同逻辑的实现，
    // `toBe`（同一个函数对象）也一样红。
    expect(core.formatDuration).toBe(formatDuration)
    expect(core.countdownSeconds).toBe(countdownSeconds)
  })
})
