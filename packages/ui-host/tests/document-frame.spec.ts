/**
 * 槽里那一格的判据测试：显示哪一面、为什么、桥接没接错对象。
 *
 * 只测纯的那几片（planSurface / fetchSurface / wireShellToFrame）。
 * 真实 iframe 的装载不在这里——那条只有实机能证，本文件不冒充它。
 * @module xaihi-ui/tests/document-frame
 */

import { describe, expect, it } from 'vitest'
import { BRIDGE_CONTRACT_VERSION, BRIDGE_SCHEMA, NODE_CAPABILITY_IDS, type BridgeMessage } from '@hibernalglow/xaihi-sdk'
import { fetchSurface, planSurface, wireShellToFrame, type FrameLike } from '../src/client/document-frame.tsx'

const ORIGIN = 'http://127.0.0.1:3199'

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response

describe('planSurface：显示哪一面由事实决定，不由开关名决定', () => {
  it('documentUrl 有值就走文档', () => {
    const plan = planSurface({ documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' })
    expect(plan.kind).toBe('document')
    expect(plan.documentUrl).toContain('/xaihi/ui/')
  })

  it('产物没配时回落到现 realm，并把**那句原因**带出来（不许静默）', () => {
    const plan = planSurface({ documentUrl: '', rev: 'missing', problems: ['xaihi ui bundle is not configured (config core.uiBundleDir is empty)'] })
    expect(plan.kind).toBe('in-realm')
    expect(plan.reason).toContain('core.uiBundleDir')
  })

  it('清单里根本没有 ui 这一格时，原因点名的是这一格，不是"产物没配"', () => {
    expect(planSurface(undefined).reason).toContain('ui 这一格')
  })

  it('有 documentUrl 但同时报了 problems ⇒ 不走文档（宁可在外壳里显示原因，不开一个装不出东西的框）', () => {
    const plan = planSurface({ documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab', problems: ['产物目录读不了'] })
    expect(plan.kind).toBe('in-realm')
    expect(plan.reason).toContain('产物目录读不了')
  })
})

describe('fetchSurface：读到什么算成功要说清', () => {
  it('正常清单里的 ui 被原样取出', async () => {
    const result = await fetchSurface(async () => jsonResponse({ schema: 'xaihi.workspace/1', ui: { documentUrl: '/xaihi/ui/abc/index.html', rev: 'abc' } }))
    expect(result).toEqual({ ok: true, ui: { documentUrl: '/xaihi/ui/abc/index.html', rev: 'abc' } })
  })

  it('缺 ui 这一格算"读到但没有"，不算读失败（两种退化文案不同）', async () => {
    const result = await fetchSurface(async () => jsonResponse({ schema: 'xaihi.workspace/1' }))
    expect(result).toEqual({ ok: true, ui: undefined })
  })

  it('HTTP 非 2xx / 不是 JSON / fetch 抛错，三种分别报不同原因', async () => {
    expect(await fetchSurface(async () => jsonResponse({}, false, 503))).toEqual({ ok: false, reason: '清单返回 503' })
    const bad = await fetchSurface(async () => ({ ok: true, status: 200, json: async () => { throw new Error('Unexpected token') } }) as unknown as Response)
    expect(bad.ok).toBe(false)
    if (bad.ok === false) expect(bad.reason).toContain('不是 JSON')
    const thrown = await fetchSurface(async () => { throw new Error('connection refused') })
    expect(thrown.ok).toBe(false)
    if (thrown.ok === false) expect(thrown.reason).toContain('connection refused')
  })

  it('ui 形状不对（缺 rev）时不猜，报形状错', async () => {
    const result = await fetchSurface(async () => jsonResponse({ ui: { documentUrl: '/x' } }))
    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.reason).toContain('形状不对')
  })

  it('请求带 no-store：清单每次现读，装了新节点不该等缓存过期', async () => {
    const seen: Array<[string, RequestInit | undefined]> = []
    await fetchSurface(async (input, init) => {
      seen.push([String(input), init])
      return jsonResponse({ ui: { documentUrl: '', rev: 'missing' } })
    })
    expect(seen[0]?.[0]).toBe('/xaihi/manifest.json')
    expect(seen[0]?.[1]?.cache).toBe('no-store')
  })
})

describe('wireShellToFrame：桥只跟"自己那个框"说话', () => {
  const frameWith = () => {
    const posted: BridgeMessage[] = []
    const contentWindow = { postMessage: (message: BridgeMessage) => { posted.push(message) } }
    const frame: FrameLike = { contentWindow }
    return { frame, posted }
  }

  it('来自别的窗口/别的 frame 的消息不理（同源之外还要同 frame）', () => {
    const { frame } = frameWith()
    const wired = wireShellToFrame({ env: { theme: 'dark', platform: 'linux' } }, ORIGIN, () => frame)
    expect(wired.fromThisFrame({ data: {}, origin: ORIGIN, source: frame.contentWindow })).toBe(true)
    expect(wired.fromThisFrame({ data: {}, origin: ORIGIN, source: { other: true } })).toBe(false)
    expect(wired.fromThisFrame({ data: {}, origin: ORIGIN, source: null })).toBe(false)
  })

  it('frame 还没挂上时判据不误认（source 为 null 不算自己人）', () => {
    const wired = wireShellToFrame({}, ORIGIN, () => null)
    expect(wired.fromThisFrame({ data: {}, origin: ORIGIN, source: null })).toBe(false)
  })

  it('文档的握手经这座桥回到**同一个** frame，且带上了环境快照', async () => {
    const { frame, posted } = frameWith()
    const wired = wireShellToFrame({ env: { theme: 'dark', platform: 'linux' } }, ORIGIN, () => frame)
    await wired.bridge.receive({ schema: BRIDGE_SCHEMA, kind: 'hello', contractVersion: BRIDGE_CONTRACT_VERSION, node: 'sleept', requested: [...NODE_CAPABILITY_IDS] }, ORIGIN)
    const ready = posted.find((message) => message.kind === 'ready')
    expect(ready?.kind).toBe('ready')
    if (ready?.kind !== 'ready') throw new Error('unreachable')
    expect(ready.env).toEqual({ theme: 'dark', platform: 'linux' })
    expect(ready.granted).toEqual(expect.arrayContaining(['contract', 'env']))
  })

  it('来源不对的握手不应答（信任边界在这一层也守着）', async () => {
    const { frame, posted } = frameWith()
    const wired = wireShellToFrame({ env: { theme: 'light', platform: 'web' } }, ORIGIN, () => frame)
    await wired.bridge.receive({ schema: BRIDGE_SCHEMA, kind: 'hello', contractVersion: BRIDGE_CONTRACT_VERSION, node: '', requested: ['env'] }, 'http://evil.invalid')
    expect(posted).toEqual([])
  })
})
