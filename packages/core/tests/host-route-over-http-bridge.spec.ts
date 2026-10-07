/**
 * 跨边界的一条：文档侧的 HTTP 载体 ↔ `/xaihi/host` ↔ 命名空间闸 ↔ 设置面。
 *
 * 为什么要这条而不是两边的单测：`createHttpDocumentBridge` 的替身测的是"我按自己的期待发了什么"，
 * `host-routes.spec.ts` 测的是"处理器收到东西怎么答"，两条各自都绿时，中间仍然可能
 * 差一个字节（比如 sid 参数、应答的 `id` 回填、或握手之后才成立的授权集）。
 * 这一条走真套接字，两侧都是生产代码，只把最底下的设置面包成假的。
 *
 * 界面那一层（`createDocumentHost` 的九个组）另有 `packages/ui-host/tests/document-host.spec.ts`，
 * 它吃的是 `DocumentBridge` 这个形状——本条证的是这个形状在 HTTP 载体上成立。
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BRIDGE_CONTRACT_VERSION,
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_NS,
  createHttpDocumentBridge,
} from '@hibernalglow/xaihi-sdk/bridge'
import { hostBridgeHandler, type SettingsServiceLike } from '../src/host-routes.ts'

const ALLOWED = new Set([STATE_SETTINGS_NS, 'xaihi-linedup'])
const SID = 'a1'.repeat(16)

/** 内存里的设置面：只实现桥真正会问的三片，值与 revision 分开记，方便看"有没有真的落到底下"。 */
function fakeService (): SettingsServiceLike & { rows: Record<string, Record<string, unknown>>, revision: () => number } {
  const rows: Record<string, Record<string, unknown>> = {
    [STATE_SETTINGS_NS]: { nodeState: {} as Record<string, string> },
    'xaihi-linedup': { panel: 'wide' },
    'dsh-core': { apiKey: 'sk-REAL-LOOKING' },
  }
  let revision = 1
  const describe = (options?: { redactSecrets?: boolean }) => Object.entries(rows).map(([ns, value]) => ({
    ns,
    revision,
    value: options?.redactSecrets === true && ns === 'dsh-core' ? { apiKey: 'REDACTED' } : value,
  }))
  return {
    rows,
    revision: () => revision,
    describe,
    update (ns, values) {
      rows[ns] = { ...(rows[ns] ?? {}), ...values }
      revision += 1
      return { ns, revision }
    },
    mutate (ns, ops) {
      const target = rows[ns] ?? {}
      const nodeState = (target[STATE_SETTINGS_FIELD_NAME] ?? {}) as Record<string, string>
      for (const op of ops) {
        if (op.op === 'set' && op.path.length === 2) nodeState[op.path[1] as string] = String(op.value)
      }
      rows[ns] = { ...target, [STATE_SETTINGS_FIELD_NAME]: nodeState }
      revision += 1
      return { ns, revision }
    },
  }
}

/** `state.*` 落点的那个字段名，与 SDK 里那份逐字一致；写死一次，漂了就红。 */
const STATE_SETTINGS_FIELD_NAME = 'nodeState'

let server = null as ReturnType<typeof createServer> | null
let base = ''
const service = fakeService()

function bridge (): ReturnType<typeof createHttpDocumentBridge> {
  return createHttpDocumentBridge({
    endpoint: `${base}/xaihi/host`,
    sid: SID,
    requested: [...NODE_CAPABILITY_IDS],
    selfOrigin: 'dsh-app://app',
  })
}

/** 一条会话：握手 + 同一个 bridge 回来（HTTP 载体没有"半路换对面"这一说）。 */
async function negotiated (): Promise<ReturnType<typeof createHttpDocumentBridge>> {
  const session = bridge()
  session.hello('xaihi-linedup')
  for (let i = 0; i < 60 && session.ready() === null; i++) {
    await new Promise((resolve) => { setTimeout(resolve, 20) })
  }
  expect(session.ready()).not.toBeNull()
  return session
}

beforeAll(async () => {
  const handler = hostBridgeHandler({ settings: () => service, allowedNamespaces: () => ALLOWED })
  server = createServer((req: IncomingMessage, res: ServerResponse) => { void handler(req, res) })
  await new Promise<void>((resolve) => { server?.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterAll(() => { server?.close() })

describe('HTTP 载体 ↔ /xaihi/host ↔ 设置面', () => {
  it('握手答出的组与命名空间，两侧读到的是一致的', async () => {
    const session = await negotiated()
    const ready = session.ready()
    expect(ready?.contractVersion).toBe(BRIDGE_CONTRACT_VERSION)
    expect(ready?.granted).toEqual(expect.arrayContaining(['config', 'state', 'contract']))
    expect(ready?.settingsNs).toBe(STATE_SETTINGS_NS)
    // 主题由客户端那一侧知道，服务端编不出来：这一格缺席就是两侧一致的"没给"。
    expect(ready?.env).toBeUndefined()
  })

  it('config.save 穿过载体与闸，真的落到设置面并回一个 revision', async () => {
    const session = await negotiated()
    const ack = await session.call('config.save', 'xaihi-linedup', { panel: 'narrow' }, undefined) as { revision?: number }
    expect(typeof ack.revision).toBe('number')
    expect(service.rows['xaihi-linedup']).toEqual({ panel: 'narrow' })
  })

  it('一条会话写进去的状态，另一条独立会话读得回来（证的是落到底下，不是会话缓存）', async () => {
    const writer = await negotiated()
    await writer.call('state.patchData', 'xaihi-linedup', '{"marks":["across-sessions"]}')
    const reader = bridge()
    reader.hello('xaihi-linedup')
    for (let i = 0; i < 60 && reader.ready() === null; i++) {
      await new Promise((resolve) => { setTimeout(resolve, 20) })
    }
    const value = await reader.call('state.getData', 'xaihi-linedup') as { json?: string }
    expect(value.json).toContain('across-sessions')
    // 只把这个节点那一段发回去：别人的段落不出门。
    expect(JSON.stringify(value)).not.toContain('dsh-core')
  })

  it('越界命名空间的写在对面被拒，设置面没有被动过', async () => {
    const before = service.revision()
    const session = await negotiated()
    await expect(session.call('config.save', 'dsh-core', { apiKey: 'sk-PWNED' }))
      .rejects.toMatchObject({ reason: 'namespace-not-allowed' })
    expect(service.rows['dsh-core']).toEqual({ apiKey: 'sk-REAL-LOOKING' })
    expect(service.revision()).toBe(before)
  })

  it('没被授予的组（env / runner）在对面就被拒，原因读得回', async () => {
    const session = await negotiated()
    await expect(session.call('runner.run', 'xaihi-linedup', {})).rejects.toMatchObject({ reason: 'refused' })
  })

  it('对面整个不在时，握手回"什么都没给"、调用以可读回的原因失败而不是等满上界', async () => {
    // 拿一个刚关掉的端口：连上去就被拒，走的正是"路由没挂上"那一格（装配缺 xaihi-core 的 host 路由就是这个形状）。
    const probe = createServer((_req, res) => { res.writeHead(200).end('{}') })
    await new Promise<void>((resolve) => { probe.listen(0, '127.0.0.1', resolve) })
    const port = (probe.address() as AddressInfo).port
    await new Promise<void>((resolve) => { probe.close(() => { resolve() }) })
    const session = createHttpDocumentBridge({
      endpoint: `http://127.0.0.1:${String(port)}/xaihi/host`,
      sid: SID,
      requested: [...NODE_CAPABILITY_IDS],
      selfOrigin: 'dsh-app://app',
    })
    session.hello('xaihi-linedup')
    for (let i = 0; i < 60 && session.ready() === null; i++) {
      await new Promise((resolve) => { setTimeout(resolve, 20) })
    }
    const ready = session.ready()
    expect(ready).not.toBeNull()
    expect(ready?.granted).toEqual([])
    expect(ready?.refused).toEqual(expect.arrayContaining(['config', 'state']))
    const row = ready?.degraded.find((item) => item.capability === 'config')
    expect(row?.reason).toContain('宿主路由不可达')
    // 已经判定"什么都没给"之后，调用在本地就被拒（refused），不会再往对面发一条去等 timeout。
    await expect(session.call('config.get')).rejects.toMatchObject({ reason: 'refused' })
  })
})
