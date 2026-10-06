/**
 * recycleu 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值逐条手抄自 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/recycleu/src/core.test.ts`（4 条用例的全部数字：
 * `{action:'status', interval:10, maxCycles:360, driveLetter:''}`、
 * `interval:0 → 1`、`'c:' → 'C'`、`'C;Remove-Item' → ''`、
 * `lastCleanTime:'01:02:03'`、`cleanCalls:2`、`cleanCount:2`、`timerStatus:'cancelled'`），
 * **不由被测函数现算**。
 *
 * 阳性对照集中在"可恢复删除"那一层：回收站本来就是"删了还能捡回来"的最后一步，
 * 所以 `empty`（本来就是空的）算成功但**不许**计入 `cleanCount`，
 * `unsupported` / `failed` 都不许把状态刷成成功——每条都配一个反向用例，
 * 防被删掉时这条 spec 会红。
 *
 * @module xaihi-recycleu/tests/core
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import {
  DEFAULT_RECYCLEU_STATE,
  formatClock,
  normalizeDriveLetter,
  normalizeRecycleuInput,
  runRecycleu,
  type RecycleuRuntime,
} from '../src/core.ts'

/** 上游 `core.test.ts:13-17` 那个夹具：固定时钟 + 一次成功的清理。
 *  `calls` 挂在这个对象**自己**身上（上游用 `vi.fn()` 现调用计数，本仓这份不引 vitest 的 mock，
 *  所以计数器必须是被返回的那个对象——写成 `...state` 会把 0 复制一份出去，
 *  闭包里加的永远是另一个对象，`runtime.calls` 就恒为 0（正控失效，两条断言都白搭）。 */
function cleanedRuntime (): RecycleuRuntime & { calls: number } {
  const runtime: RecycleuRuntime & { calls: number } = {
    calls: 0,
    now: () => new Date('2026-07-06T01:02:03'),
    sleep: async () => {},
    emptyRecycleBin: async () => {
      runtime.calls += 1
      return { status: 'cleaned', message: 'cleaned' }
    },
  }
  return runtime
}

describe('recycleu core', () => {
  it('normalizes action and bounds', () => {
    expect(normalizeRecycleuInput({})).toEqual({ action: 'status', interval: 10, maxCycles: 360, driveLetter: '' })
    expect(normalizeRecycleuInput({ interval: 0, maxCycles: 0, driveLetter: 'c:' }))
      .toEqual({ action: 'status', interval: 1, maxCycles: 0, driveLetter: 'C' })
  })

  it('盘符只认单个字母，掺进 shell 元字符就当没给（阳性对照：干净的要认）', () => {
    expect(normalizeRecycleuInput({ driveLetter: 'C;Remove-Item' }).driveLetter).toBe('')
    expect(normalizeDriveLetter(' c:')).toBe('C')
    expect(normalizeDriveLetter('C;Remove-Item')).toBe('')
    expect(normalizeDriveLetter()).toBe('')
  })

  it('runs one clean and updates counters', async () => {
    const runtime = cleanedRuntime()
    const result = await runRecycleu({ action: 'clean_now' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.cleanCount).toBe(1)
    expect(result.data?.lastCleanTime).toBe('01:02:03')
  })

  it('rejects unsafe short auto interval', async () => {
    const result = await runRecycleu({ action: 'start', interval: 2 }, { ...cleanedRuntime(), now: () => new Date() })
    expect(result.success).toBe(false)
    expect(result.data?.timerStatus).toBe('error')
  })

  it('keeps zero cycles unlimited until runtime cancellation', async () => {
    let now = new Date('2026-07-06T01:02:03')
    let cleanCalls = 0
    const progressValues: number[] = []
    const runtime: RecycleuRuntime = {
      now: () => now,
      sleep: async (milliseconds) => {
        now = new Date(now.getTime() + milliseconds)
      },
      emptyRecycleBin: async () => {
        cleanCalls += 1
        return { status: 'cleaned', message: 'cleaned' }
      },
      isCancelled: () => cleanCalls >= 2,
    }

    const result = await runRecycleu(
      { action: 'start', interval: 5, maxCycles: 0 },
      runtime,
      (event) => {
        if (event.progress !== undefined) progressValues.push(event.progress)
      },
    )

    expect(cleanCalls).toBe(2)
    expect(result.success).toBe(false)
    expect(result.data?.timerStatus).toBe('cancelled')
    expect(result.data?.cleanCount).toBe(2)
    expect(progressValues.length).toBeGreaterThan(0)
    expect(progressValues.every(Number.isFinite)).toBe(true)
  })

  it('status 不碰回收站，也不改状态（阳性对照：clean_now 一定要碰）', async () => {
    const runtime = cleanedRuntime()
    const result = await runRecycleu({ action: 'status' }, runtime)
    expect(runtime.calls).toBe(0)
    expect(result.success).toBe(true)
    expect(result.message).toBe('Recycle cleaner is idle.')
    expect(result.data).toEqual({ ...DEFAULT_RECYCLEU_STATE, remainingSeconds: 0 })

    const clean = await runRecycleu({ action: 'clean_now' }, runtime)
    expect(runtime.calls).toBe(1)
    expect(clean.success).toBe(true)
  })

  it('empty 算成功但不计数；unsupported / failed 都不算成功（可恢复删除那一层的四种结局）', async () => {
    const statuses = ['empty', 'unsupported', 'failed'] as const
    for (const status of statuses) {
      const runtime: RecycleuRuntime = {
        now: () => new Date('2026-07-06T01:02:03'),
        sleep: async () => {},
        emptyRecycleBin: async () => ({ status, message: `bin says ${status}` }),
      }
      const result = await runRecycleu({ action: 'clean_now' }, runtime)
      expect(result.message).toBe(`bin says ${status}`)
      // 三种都不是"清掉了东西"，计数一律不许动。
      expect(result.data?.cleanCount).toBe(0)
      expect(result.success).toBe(status === 'empty')
      expect(result.data?.timerStatus).toBe(status === 'empty' ? 'idle' : 'error')
    }
    // 反向那一半：`cleaned` 才动计数（把 core.ts 那个 `if (result.status === "cleaned")`
    // 删掉，这一段里 `cleaned` 的 1 就变成 0）。
    const cleaned = await runRecycleu({ action: 'clean_now' }, {
      now: () => new Date('2026-07-06T01:02:03'),
      sleep: async () => {},
      emptyRecycleBin: async () => ({ status: 'cleaned', message: 'bin says cleaned' }),
    })
    expect(cleaned.success).toBe(true)
    expect(cleaned.data?.cleanCount).toBe(1)
    expect(cleaned.data?.lastCleanTime).toBe('01:02:03')
  })

  it('formatClock 是本地时分秒，补零', () => {
    expect(formatClock(new Date('2026-07-06T01:02:03'))).toBe('01:02:03')
  })

  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }
    const result = validateNodeDefinition(pkg.xaihi?.node)
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('清单的词表与危险闸门就是内核那三个动作（真源：node-definitions/recycleu.json）', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const node = JSON.parse(readFileSync(path, 'utf8')).xaihi.node as {
      actions: Array<{ id: string }>
      fields: Array<{ id: string }>
      danger: { type: string; actionField: string; dangerous: string[] }
    }
    expect(node.actions.map((action) => action.id)).toEqual(['status', 'clean_now', 'start'])
    expect(node.fields.map((field) => field.id)).toEqual(['action', 'driveLetter', 'interval', 'maxCycles'])
    expect(node.danger).toEqual({ type: 'actionIn', actionField: 'action', dangerous: ['clean_now', 'start'] })
  })
})
