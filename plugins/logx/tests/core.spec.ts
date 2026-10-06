/**
 * logx 内核的保真测试：断的是"从 noxide 搬来那份的行为"，不是"我以为它做什么"。
 *
 * 期望值逐条手抄自 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/logx/src/core.test.ts`（那 3 条用例里的每一个数字与数组），
 * **不由被测函数现算**。夹具与上游不同一处：上游用 `@xiranite/logging` 的
 * `createLogEnvelope` / `createLogSession` 造事件（本包不引那个包，见 `src/logging.ts` 顶部），
 * 所以这里写字面量信封——字段值照上游那两行调用逐条搬（`one` / `two`、
 * `2026-07-23T00:00:0X.000Z`、`info` / `error`、`app` / `neoview.reader`、
 * `frontend` / `backend`、error 那条带 `{name:'DecodeError', message:'decode failed'}`）。
 *
 * 上游那 3 条没覆盖 `limit` / `order`，所以 `limit 与 order 的内核缺省` 那条的每个数字
 * 直接抄自上游 `core.ts` 的原文：`normalizeLogxInput` 的 `500` / `1..5_000` / `desc`（`:69-83`）、
 * `createLogxQuery` 的 `includeLimit = true`（`:85`）与 `runLogx` 的
 * `createLogxQuery(normalized, false)` + `allMatches.slice(0, normalized.limit)`（`:139-140`）。
 *
 * 阳性对照在两条地方：`runLogx` 的"有解析问题就不算成功"，以及
 * `queryLogs` 的"minimumSeverity 真的在筛"（把阈值放到 trace 时两条都要回来）。
 *
 * @module xaihi-logx/tests/core
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateNodeDefinition } from '@hibernalglow/xaihi-sdk'
import type { LogEnvelope } from '../src/logging.ts'
import {
  createLogxQuery,
  createLogxTelemetry,
  normalizeLogxInput,
  runLogx,
  summarizeLogxSessions,
  type LogxRuntime,
} from '../src/core.ts'

/** 上游 `core.test.ts:5-9` 那两个信封（`session.id` 上游是随机 uuid，这里给个定值即可——
 *  没有任何一条断言读它，那本身也是上游用例的事实：`sessions[0]` 只 matchObject 三个字段）。 */
const session = { id: 'session-fixed', startedAt: '2026-07-23T00:00:00.000Z' }
const infoEvent: LogEnvelope = {
  schemaVersion: 1,
  id: 'one',
  timestamp: '2026-07-23T00:00:01.000Z',
  observedTimestamp: '2026-07-23T00:00:01.000Z',
  severityText: 'info',
  severityNumber: 9,
  eventName: 'app.started',
  attributes: {},
  resource: { serviceName: 'xaihi', processType: 'frontend' },
  scope: { name: 'app' },
  session,
}
const errorEvent: LogEnvelope = {
  schemaVersion: 1,
  id: 'two',
  timestamp: '2026-07-23T00:00:02.000Z',
  observedTimestamp: '2026-07-23T00:00:02.000Z',
  severityText: 'error',
  severityNumber: 17,
  eventName: 'reader.failed',
  body: 'decode failed',
  attributes: {},
  resource: { serviceName: 'xaihi', processType: 'backend' },
  scope: { name: 'neoview.reader' },
  session,
  error: { name: 'DecodeError', message: 'decode failed' },
}
const events = [infoEvent, errorEvent]

/** 上游的 `runtime` 夹具（`core.test.ts:10`）：目录、文件、事件、零问题。 */
const runtime: LogxRuntime = {
  read: async () => ({ directory: 'D:/logs', files: ['D:/logs/current.jsonl'], events, issues: [] }),
}

describe('logx core', () => {
  it('共享的结构化查询与聚合模型：warn+ / scope 前缀 / 全文搜索三件一起用', async () => {
    const result = await runLogx({ minimumSeverity: 'warn', scope: 'neoview', search: 'decode' }, runtime)
    expect(result.success).toBe(true)
    expect(result.data?.events.map((event) => event.id)).toEqual(['two'])
    expect(result.data?.aggregate.bySeverity).toEqual({ error: 1 })
    expect(result.data?.sessions[0]).toMatchObject({ eventCount: 1, errorCount: 1, processTypes: ['backend'] })
    expect(result.data?.telemetry).toMatchObject({ eventsPerSecond: 1 })
  })

  it('阳性对照：阈值降到 trace 时两条都回来（筛子失效就该红）', async () => {
    const loose = await runLogx({ minimumSeverity: 'trace', scope: 'neoview', search: 'decode' }, runtime)
    expect(loose.data?.events.map((event) => event.id)).toEqual(['two'])
    const unscoped = await runLogx({ minimumSeverity: 'trace' }, runtime)
    expect(unscoped.data?.matchedCount).toBe(2)
    expect(unscoped.data?.events.map((event) => event.id)).toEqual(['two', 'one'])
    expect(unscoped.data?.aggregate.bySeverity).toEqual({ error: 1, info: 1 })
  })

  it('会话摘要不重复列同一个 resource / scope', () => {
    expect(summarizeLogxSessions(events)[0]).toMatchObject({
      eventCount: 2,
      errorCount: 1,
      processTypes: ['backend', 'frontend'],
      scopes: ['app', 'neoview.reader'],
    })
  })

  it('16 格异常热力：跨度、速率、末格强度', () => {
    const telemetry = createLogxTelemetry(events)
    expect(telemetry.durationMs).toBe(1_000)
    expect(telemetry.eventsPerSecond).toBe(2)
    expect(telemetry.anomalyCells).toHaveLength(16)
    expect(telemetry.anomalyCells[15]).toMatchObject({ eventCount: 1, intensity: 1 })
  })

  it('空事件集不能炸，也不能算出正的速率', () => {
    expect(createLogxTelemetry([])).toEqual({ durationMs: 0, eventsPerSecond: 0, stormIntensity: 0, anomalyCells: expect.any(Array) })
  })

  it('limit 与 order 的内核缺省：500 / desc，且 limit 只在取回时截', async () => {
    expect(normalizeLogxInput({})).toMatchObject({ action: 'query', minimumSeverity: 'trace', limit: 500, order: 'desc' })
    expect(normalizeLogxInput({ limit: 999_999 }).limit).toBe(5_000)
    expect(normalizeLogxInput({ limit: 0 }).limit).toBe(1)
    // 上游签名是 `createLogxQuery(input, includeLimit = true)`（`core.ts:85`，那份文件本包逐字节搬来）：
    // **缺省带 limit**，只有内核跑聚合前那一版显式关掉——`createLogxQuery(normalized, false)`（`core.ts:139`）。
    // 两个方向都钉住：有人把缺省翻成 false ⇒ 第一条红；有人删掉 includeLimit 那个开关 ⇒ 第三条红。
    expect(createLogxQuery({ limit: 7 })).toMatchObject({ limit: 7 })
    expect(createLogxQuery({ limit: 7 }, true)).toMatchObject({ limit: 7 })
    expect(createLogxQuery({ limit: 7 }, false)).not.toHaveProperty('limit')
    // "只在取回时截"的真身（上游 `core.ts:139-146`）：先按**不带 limit** 的查询取全量，再 `slice`。
    // 所以 matchedCount / aggregate 记全量，returnedCount / events 记截断后的那一条。
    // 把 limit 塞进查询（也就是把 `false` 改成缺省）会让 matchedCount 掉成 1，这条立刻红。
    const truncated = await runLogx({ limit: 1 }, runtime)
    expect(truncated.data?.matchedCount).toBe(2)
    expect(truncated.data?.returnedCount).toBe(1)
    expect(truncated.data?.events.map((event) => event.id)).toEqual(['two'])
    expect(truncated.data?.aggregate.bySeverity).toEqual({ error: 1, info: 1 })
  })

  it('有解析问题时 runLogx 报 success:false（阳性对照：没有问题时必须 true）', async () => {
    const withIssue: LogxRuntime = {
      read: async () => ({
        directory: 'D:/logs',
        files: ['D:/logs/current.jsonl'],
        events,
        issues: [{ file: 'D:/logs/current.jsonl', lineNumber: 3, code: 'invalid-json', message: 'Unexpected end of JSON input' }],
      }),
    }
    const broken = await runLogx({}, withIssue)
    expect(broken.success).toBe(false)
    expect(broken.message).toContain('1 parse issue')
    // 读盘炸了是另一条路：`success:false` 但没有 `data`，接线方要看得出一个有数据一个没数据。
    const failed: LogxRuntime = { read: async () => { throw new Error('EACCES: permission denied') } }
    const thrown = await runLogx({}, failed)
    expect(thrown.success).toBe(false)
    expect(thrown.data).toBeUndefined()
    expect(thrown.message).toContain('EACCES')
  })

  it('package.json#xaihi.node 是一份合法的 xaihi.node/v1 定义', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { xaihi?: { node?: unknown } }
    const result = validateNodeDefinition(pkg.xaihi?.node)
    expect(result.ok ? true : result.errors).toBe(true)
  })

  it('清单里的动作与字段 id 就是内核认的那几个（词表真源：node-definitions/logx.json）', () => {
    const path = fileURLToPath(new URL('../package.json', import.meta.url))
    const node = JSON.parse(readFileSync(path, 'utf8')).xaihi.node as {
      actions: Array<{ id: string }>
      fields: Array<{ id: string }>
    }
    expect(node.actions.map((action) => action.id)).toEqual(['query', 'sessions', 'stats', 'errors', 'doctor'])
    expect(node.fields.map((field) => field.id)).toEqual([
      'action', 'directory', 'minimumSeverity', 'scope', 'eventName', 'sessionId',
      'search', 'since', 'until', 'limit', 'order',
    ])
  })
})
