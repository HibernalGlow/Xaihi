/**
 * 文档侧 HTTP 载体的用例：消息发到哪、应答怎么落、载体自己失败时说的是什么。
 *
 * 这条载体的全部意义是"顶层窗没有父帧时也问得到宿主"，所以判据盯三件：
 * 一次调用恰好一条 HTTP 请求；应答按请求 id 落回发起那一次；
 * 载体失败必须回**读得回的原因**，不许让界面只剩 30 秒 timeout。
 */
import { describe, expect, it } from 'vitest'
import {
  BRIDGE_CONTRACT_VERSION,
  BRIDGE_MAX_MESSAGE_BYTES,
  BRIDGE_SCHEMA,
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_NS,
  type BridgeMessage,
  type BridgeReady,
  type BridgeRequest,
  type NodeCapabilityId,
} from '../src/host-bridge.ts'
import { createHttpDocumentBridge } from '../src/bridge-document.ts'

interface Sent { url: string, method: string, body: string }

/** 一个能排队应答的假 fetch：测试自己决定每条请求回什么、什么时候回。 */
function fakeFetch (responder: (message: BridgeMessage, index: number) => unknown) {
  const sent: Sent[] = []
  let index = 0
  const fetchImpl = async (url: unknown, init?: { method?: string, body?: string }) => {
    const body = String(init?.body ?? '')
    sent.push({ url: String(url), method: String(init?.method ?? ''), body })
    const parsed = JSON.parse(body) as BridgeMessage
    const reply = responder(parsed, index++)
    return {
      ok: reply !== 'HTTP-FAIL' && (reply as { status?: number }).status !== 500,
      status: reply === 'HTTP-FAIL' ? 500 : Number((reply as { status?: number }).status ?? 200),
      json: async () => (reply === 'HTTP-FAIL' || (reply as { status?: number }).status === 500 ? 'boom' : reply),
    }
  }
  return { fetchImpl, sent }
}

const readyFor = (granted: readonly NodeCapabilityId[]): BridgeReady => ({
  schema: BRIDGE_SCHEMA,
  kind: 'ready',
  contractVersion: BRIDGE_CONTRACT_VERSION,
  granted,
  refused: [],
  degraded: [],
  settingsNs: STATE_SETTINGS_NS,
})

/** 先握手，再返回桥与计数器：绝大多数用例都要处在"已协商"的状态。 */
function connected (responder: (message: BridgeMessage, index: number) => unknown) {
  const transport = fakeFetch((message, index) => (index === 0 ? readyFor([...NODE_CAPABILITY_IDS]) : responder(message, index)))
  const bridge = createHttpDocumentBridge({
    endpoint: '/xaihi/host',
    sid: 'cd'.repeat(8),
    requested: [...NODE_CAPABILITY_IDS],
    selfOrigin: 'dsh-app://app',
    fetchImpl: transport.fetchImpl as unknown as typeof fetch,
  })
  bridge.hello('xaihi-linedup')
  return { bridge, transport }
}

const flush = async (): Promise<void> => { await new Promise((resolve) => { setTimeout(resolve, 0) }) }

describe('文档侧 HTTP 载体', () => {
  it('hello 恰好发一条 POST，URL 带着会话号，体就是那条握手消息', async () => {
    const { transport } = connected(() => null)
    await flush()
    expect(transport.sent).toHaveLength(1)
    const first = transport.sent[0]
    expect(first?.method).toBe('POST')
    expect(first?.url).toBe('/xaihi/host?sid=cdcdcdcdcdcdcdcd')
    const hello = JSON.parse(String(first?.body))
    expect(hello.kind).toBe('hello')
    expect(hello.node).toBe('xaihi-linedup')
    expect(hello.contractVersion).toBe(BRIDGE_CONTRACT_VERSION)
  })

  it('握手回来后 ready() 给得出被授予的组', async () => {
    const { bridge } = connected(() => null)
    await flush()
    expect(bridge.ready()?.granted).toEqual([...NODE_CAPABILITY_IDS])
    expect(bridge.ready()?.settingsNs).toBe(STATE_SETTINGS_NS)
  })

  it('一次 call 发一条请求，应答落回它自己', async () => {
    const { bridge, transport } = connected((message) => ({
      schema: BRIDGE_SCHEMA,
      kind: 'response',
      id: (message as BridgeRequest).id,
      ok: true,
      value: { ns: 'xaihi-linedup', revision: 2 },
    }))
    await flush()
    const value = await bridge.call('config.getUi', 'xaihi-linedup')
    expect(value).toEqual({ ns: 'xaihi-linedup', revision: 2 })
    expect(transport.sent).toHaveLength(2)
    expect(JSON.parse(String(transport.sent.at(-1)?.body)).method).toBe('config.getUi')
  })

  it('并发两条 call 的应答按 id 各回各处', async () => {
    const { bridge } = connected((message) => ({
      schema: BRIDGE_SCHEMA,
      kind: 'response',
      id: (message as BridgeRequest).id,
      ok: true,
      value: `echo:${(message as BridgeRequest).id}`,
    }))
    await flush()
    const [a, b] = await Promise.all([bridge.call('state.getData', 'xaihi-linedup'), bridge.call('state.getData', 'xaihi-sleept')])
    expect(a).not.toBe(b)
    expect(String(a).startsWith('echo:')).toBe(true)
    expect(String(b).startsWith('echo:')).toBe(true)
    expect(a).not.toBe(b)
  })

  it('HTTP 非 2xx 时以 transport 原因失败，不是等 timeout', async () => {
    const { bridge } = connected(() => 'HTTP-FAIL')
    await flush()
    await expect(bridge.call('config.get')).rejects.toMatchObject({ reason: 'transport', detail: 'HTTP 500' })
  })

  it('fetch 自己抛错时同样给得出原因', async () => {
    const bridge = createHttpDocumentBridge({
      endpoint: '/xaihi/host',
      sid: 'ef'.repeat(8),
      requested: [...NODE_CAPABILITY_IDS],
      selfOrigin: 'dsh-app://app',
      fetchImpl: (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch,
    })
    bridge.hello('')
    await flush()
    expect(bridge.ready()?.granted).toEqual([])
    expect(bridge.ready()?.refused).toEqual([...NODE_CAPABILITY_IDS])
    const row = bridge.ready()?.degraded.find((item) => item.capability === 'state')
    expect(row?.reason).toContain('宿主路由不可达')
    await expect(bridge.call('state.getData', 'xaihi-linedup')).rejects.toMatchObject({ reason: 'refused' })
  })

  it('减法对照：请求体超过桥上界时整条拒，一条 HTTP 都不发', async () => {
    const { bridge, transport } = connected(() => null)
    await flush()
    const before = transport.sent.length
    const blob = 'x'.repeat(BRIDGE_MAX_MESSAGE_BYTES)
    await expect(bridge.call('config.save', [STATE_SETTINGS_NS, { blob }])).rejects.toMatchObject({ reason: 'too-large' })
    expect(transport.sent).toHaveLength(before)
  })

  it('握手之前 call 走 not-ready（这条与 postMessage 载体同一个契约）', async () => {
    const transport = fakeFetch(() => null)
    const bridge = createHttpDocumentBridge({
      endpoint: '/xaihi/host',
      sid: '01'.repeat(8),
      requested: [...NODE_CAPABILITY_IDS],
      selfOrigin: 'dsh-app://app',
      fetchImpl: transport.fetchImpl as unknown as typeof fetch,
    })
    await expect(bridge.call('config.get')).rejects.toMatchObject({ reason: 'not-ready' })
  })
})
