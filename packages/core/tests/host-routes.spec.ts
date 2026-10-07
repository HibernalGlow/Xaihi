/**
 * `/xaihi/host` 的用例表：握手给了什么、命名空间闸挡不挡、写落到哪一段、以及每种失败回什么。
 *
 * 每条防御都配一条"拆掉防御就必须变绿"的对照（尤其越界写那条）——
 * 否则一个无条件拒绝的判据也能长得一模一样，而它守的不是边界。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BRIDGE_CONTRACT_VERSION,
  BRIDGE_MAX_MESSAGE_BYTES,
  BRIDGE_SCHEMA,
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_NS,
  type BridgeMethod,
} from '@hibernalglow/xaihi-sdk/bridge'
import {
  HOST_MOUNT_ENTRY,
  HOST_MOUNT_MARKERS,
  HOST_PATH,
  detectHostMount,
  hostBridgeHandler,
  xaihiNamespaces,
  type SettingsServiceLike,
} from '../src/host-routes.ts'

const SID = 'ab'.repeat(16)

/** 三行设置：Xaihi 的状态行、一个 Xaihi 节点行、一行别人家的（用来证明闸真的在挡）。 */
const ROWS: readonly Record<string, unknown>[] = [
  { ns: STATE_SETTINGS_NS, revision: 7, value: { nodeState: { 'xaihi-linedup': '{"marks":["a"]}', 'other-node': '{"secret":1}' } } },
  { ns: 'xaihi-linedup', revision: 2, value: { panel: 'wide' } },
  { ns: 'dsh-core', revision: 5, value: { apiKey: 'sk-LEAK' } },
]

/** 被允许的命名空间集：Xaihi 自己的两行 + 状态行。`dsh-core` 不在里面。 */
const ALLOWED = new Set([STATE_SETTINGS_NS, 'xaihi-linedup'])

interface FakeSettings extends SettingsServiceLike {
  updates: Array<{ ns: string, values: Record<string, unknown>, expectedRevision: number | undefined }>
  mutates: Array<{ ns: string, ops: readonly unknown[], expectedRevision: number | undefined }>
  describes: Array<boolean | undefined>
}

/** 一个记账用的假设置面：谁被叫到、带的是什么参数，全部留得下来。 */
function fakeSettings (rows: readonly Record<string, unknown>[] = ROWS): FakeSettings {
  return {
    updates: [],
    mutates: [],
    describes: [],
    describe (options?: { redactSecrets?: boolean }) {
      this.describes.push(options?.redactSecrets)
      return rows.map((row) => ({ ...row }))
    },
    update (ns, values, expectedRevision) {
      this.updates.push({ ns, values, expectedRevision })
      return { ns, revision: 8 }
    },
    mutate (ns, ops, expectedRevision) {
      this.mutates.push({ ns, ops, expectedRevision })
      return { ns, revision: 9 }
    },
  }
}

interface Captured { status?: number, headers?: Record<string, string>, body?: any }

const fakeRequest = (body: string, method = 'POST', url = `${HOST_PATH}?sid=${SID}`): IncomingMessage =>
  Object.assign(Readable.from([Buffer.from(body, 'utf8')]), { method, url }) as unknown as IncomingMessage

const hello = (node = 'xaihi-linedup') => JSON.stringify({
  schema: BRIDGE_SCHEMA,
  kind: 'hello',
  contractVersion: BRIDGE_CONTRACT_VERSION,
  node,
  requested: [...NODE_CAPABILITY_IDS],
})

const request = (method: BridgeMethod, args: readonly unknown[], id = `r-${Math.random().toString(16).slice(2, 8)}`) => ({
  body: JSON.stringify({ schema: BRIDGE_SCHEMA, kind: 'request', id, method, args }),
  id,
})

/** 走一次处理器并把状态码、头、JSON 体都收下来。 */
async function ask (handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, body: string, method = 'POST', url = `${HOST_PATH}?sid=${SID}`) {
  const seen: Captured = {}
  const res = {
    writeHead (status: number, headers: Record<string, string>) { seen.status = status; seen.headers = headers },
    end (chunk?: unknown) { seen.body = chunk === undefined ? undefined : JSON.parse(String(chunk)) },
  } as unknown as ServerResponse
  await handler(fakeRequest(body, method, url), res)
  return seen
}

/** 握手 + 一次调用，返回那一次调用的应答体（外壳那半边的授权判据要求先握手）。 */
async function negotiatedCall (settings: SettingsServiceLike | undefined, method: BridgeMethod, args: readonly unknown[], allowed: ReadonlySet<string> = ALLOWED) {
  const handler = hostBridgeHandler({ settings: () => settings, allowedNamespaces: () => allowed })
  const handshake = await ask(handler, hello())
  expect(handshake.status).toBe(200)
  const call = request(method, args)
  const reply = await ask(handler, call.body)
  return { handshake, reply: reply.body, handler }
}

describe('被允许的命名空间怎么算', () => {
  const row = (id: string, name: string, disabled = false) => ({ options: { id, name, disabled } })

  it('收我们自己 scope 下的行；别人的行与停掉的行都不收', () => {
    const got = xaihiNamespaces([
      row('xaihi-core', '@hibernalglow/xaihi-core'),
      row('xaihi-ui', '@hibernalglow/xaihi-ui'),
      // 第二个实例：行 id 是实例名而不是包名，仍然要收（2026-10-06 实测过这种行）。
      row('8f3ca9e1', '@hibernalglow/xaihi-sleept'),
      row('settings', '@deepseek-ai/dsh-settings'),
      row('xaihi-marku', '@hibernalglow/xaihi-marku', true),
    ])
    expect([...got].sort()).toEqual(['8f3ca9e1', 'xaihi-core', 'xaihi-ui'])
  })

  it('阳性对照：整张表只有别人家的行时，集合里就只剩状态行本身', () => {
    // 这条测的是"过滤真的在做事"：判据若被拆成无条件收行，这里就会多出 settings。
    const got = xaihiNamespaces([row('settings', '@deepseek-ai/dsh-settings'), row('gateway', '@deepseek-ai/dsh-api-gateway')])
    expect([...got]).toEqual([STATE_SETTINGS_NS])
    expect(got.has('settings')).toBe(false)
  })
})

describe('/xaihi/host 的协商', () => {
  it('只授予被命名空间闸允许得起的那两组，其余逐条给原因', async () => {
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    const ready = (await ask(handler, hello())).body
    expect(ready.schema).toBe(BRIDGE_SCHEMA)
    expect(ready.kind).toBe('ready')
    expect(ready.contractVersion).toBe(BRIDGE_CONTRACT_VERSION)
    expect(ready.granted).toEqual(expect.arrayContaining(['config', 'state', 'contract']))
    expect(ready.refused).toEqual(expect.arrayContaining(['env', 'runner', 'clipboard', 'downloads', 'localFiles']))
    expect(ready.settingsNs).toBe(STATE_SETTINGS_NS)
    // 主题只有客户端那侧知道；服务端编一个亮/暗就是决定 4 禁止的伪造，所以这一格必须缺席。
    expect(ready.env).toBeUndefined()
    for (const row of ready.degraded) expect(typeof row.reason).toBe('string')
  })

  it('runner 那句要说的是量出来的拦路（上游 P1），不是"还没来得及接"', async () => {
    // 这条钉的是措辞背后的**事实**：宿主的执行面是 `commands.execute(agent, line, attachments, signal)`，
    // 程序化那侧只有 `agents.create(...)`，而其 `CreateAgentOptions.meta` 自己写着是 durable session data
    // ⇒ 每按一次钮就在使用者的会话库里留一条真会话。谁把这行改回"今天没接到这条路由上"，
    // 就等于把上游的缺口记成我们的进度，所以这里连旧措辞一起挡掉。
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    const ready = (await ask(handler, hello())).body
    const reason = String(ready.degraded.find((row: { capability: string }) => row.capability === 'runner').reason)
    expect(reason).toContain('P1')
    expect(reason).toContain('会话')
    expect(reason).not.toContain('没接到这条路由上')
  })

  it('设置面缺席时 granted 不含 config/state，并说清是没挂载', async () => {
    const handler = hostBridgeHandler({ settings: () => undefined, allowedNamespaces: () => ALLOWED })
    const ready = (await ask(handler, hello())).body
    expect(ready.granted).toEqual(['contract'])
    expect(ready.degraded.find((row: { capability: string }) => row.capability === 'config').reason).toContain('settings')
    const call = request('config.get', [])
    const reply = (await ask(handler, call.body)).body
    // 组在协商时就被拒 ⇒ 桥的授权判据先答 `capability-refused`，根本走不到 no-provider。
    // 这条不是宽松：真正要钉的是"界面读得到原因说没挂 settings"，上面那条 degraded 已经钉了。
    expect(reply.ok).toBe(false)
    expect(reply.error.reason).toBe('capability-refused')
  })

  it('没握手就来的请求被 not-negotiated 拒（授权集还没定）', async () => {
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    const call = request('config.get', [])
    const reply = (await ask(handler, call.body)).body
    expect(reply.ok).toBe(false)
    expect(reply.error.reason).toBe('not-negotiated')
  })
})

describe('/xaihi/host 的命名空间闸', () => {
  it('读一律按 redactSecrets 问，且只回被允许的那一格', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'config.getUi', ['xaihi-linedup'])
    expect(reply.ok).toBe(true)
    expect(reply.value.ns).toBe('xaihi-linedup')
    expect(settings.describes.length).toBeGreaterThan(0)
    expect(settings.describes.every((flag) => flag === true)).toBe(true)
  })

  it('越界命名空间的读回 config-namespace-missing（别人的行不发出去）', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'config.getUi', ['dsh-core'])
    expect(reply.ok).toBe(false)
    expect(reply.error.reason).toBe('config-namespace-missing')
    // 而且 config.get 那份整表读数里也不能出现别人家的值。
    const whole = (await (async () => {
      const handler = hostBridgeHandler({ settings: () => settings, allowedNamespaces: () => ALLOWED })
      await ask(handler, hello())
      return await ask(handler, request('config.get', []).body)
    })()).body
    expect(JSON.stringify(whole.value)).not.toContain('sk-LEAK')
    expect(JSON.stringify(whole.value)).toContain('xaihi-linedup')
  })

  it('越界命名空间的写整条拒，并且服务面一次都没被叫到', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'config.save', ['dsh-core', { apiKey: 'sk-PWNED' }])
    expect(reply.ok).toBe(false)
    expect(reply.error.reason).toBe('namespace-not-allowed')
    expect(settings.updates).toHaveLength(0)
    expect(settings.mutates).toHaveLength(0)
  })

  it('减法对照：把闸拆成什么都允许，同一条写就真的落到服务面上', async () => {
    const settings = fakeSettings()
    // 同一条消息、同一个处理器，只把 allowed 换成全集 ⇒ 必须放行。
    // 这条证明上一条的红来自闸本身，而不是"这条路由见谁写都拒"。
    const { reply } = await negotiatedCall(settings, 'config.save', ['dsh-core', { apiKey: 'sk-PWNED' }],
      new Set(ROWS.map((row) => String(row.ns))))
    expect(reply.ok).toBe(true)
    expect(settings.updates).toHaveLength(1)
    expect(settings.updates.at(-1)?.ns).toBe('dsh-core')
  })

  it('被允许的写正常落地，应答只留 revision', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'config.save', ['xaihi-linedup', { panel: 'narrow' }, 2])
    expect(reply.ok).toBe(true)
    expect(reply.value).toEqual({ revision: 8 })
    expect(settings.updates.at(-1)).toEqual({ ns: 'xaihi-linedup', values: { panel: 'narrow' }, expectedRevision: 2 })
  })
})

describe('/xaihi/host 的节点状态半边', () => {
  it('state.patchData 走路径级写：只碰自己那一段', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'state.patchData', ['xaihi-linedup', '{"marks":["b"]}', 7])
    expect(reply.ok).toBe(true)
    expect(settings.mutates).toHaveLength(1)
    expect(settings.mutates.at(-1)?.ns).toBe(STATE_SETTINGS_NS)
    expect(settings.mutates.at(-1)?.ops).toEqual([{ op: 'set', path: ['nodeState', 'xaihi-linedup'], value: '{"marks":["b"]}' }])
    expect(settings.updates).toHaveLength(0)
  })

  it('state.getData 只回这个节点那一条，别人的节点不旁听', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'state.getData', ['xaihi-linedup'])
    expect(reply.ok).toBe(true)
    expect(reply.value.json).toBe('{"marks":["a"]}')
    expect(reply.value.revision).toBe(7)
    expect(JSON.stringify(reply.value)).not.toContain('other-node')
  })

  it('节点 id 形状越界按 bad-args 拒，且不打到设置面', async () => {
    const settings = fakeSettings()
    const { reply } = await negotiatedCall(settings, 'state.patchData', ['../etc', '{}'])
    expect(reply.ok).toBe(false)
    expect(reply.error.reason).toBe('bad-args')
    expect(settings.mutates).toHaveLength(0)
    expect(settings.updates).toHaveLength(0)
  })
})

describe('/xaihi/host 的载体判据', () => {
  it('只收 POST', async () => {
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    const seen = await ask(handler, hello(), 'GET')
    expect(seen.status).toBe(405)
  })

  it('sid 不合形状整条拒', async () => {
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    expect((await ask(handler, hello(), 'POST', `${HOST_PATH}?sid=zz`)).status).toBe(400)
    expect((await ask(handler, hello(), 'POST', HOST_PATH)).status).toBe(400)
  })

  it('不是 JSON 与不是桥消息各回一种 400', async () => {
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    expect((await ask(handler, 'not json')).body.error).toBe('bad-json')
    const wrong = await ask(handler, JSON.stringify({ schema: BRIDGE_SCHEMA, kind: 'ready' }))
    expect(wrong.body.error).toBe('not-a-bridge-message')
  })

  it('请求体超过桥上界要**真的**把 413 送回对面（真 HTTP 套接字，不是假 res）', async () => {
    // 这条为什么必须是真服务器：假 res 收得到 writeHead，却收不到"连接被掐断"。
    // 实机 curl 上就踩过：超限分支里 `req.destroy()` 把响应一起毁了，对面读到 000。
    const settings = fakeSettings()
    const handler = hostBridgeHandler({ settings: () => settings, allowedNamespaces: () => ALLOWED })
    const server = createServer((req, res) => { void handler(req, res) })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as AddressInfo).port
    try {
      const big = JSON.stringify({
        schema: BRIDGE_SCHEMA,
        kind: 'request',
        id: 'big',
        method: 'config.saveUi',
        args: [STATE_SETTINGS_NS, { blob: 'x'.repeat(BRIDGE_MAX_MESSAGE_BYTES) }],
      })
      const response = await fetch(`http://127.0.0.1:${String(port)}${HOST_PATH}?sid=${SID}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: big,
      })
      expect(response.status).toBe(413)
      expect((await response.json() as { error?: string }).error).toBe('too-large')
      expect(settings.updates).toHaveLength(0)
      // 同一条连接上之后还能问得通：超限那次没有把服务器或会话弄坏。
      const ok = await fetch(`http://127.0.0.1:${String(port)}${HOST_PATH}?sid=${SID}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: hello(),
      })
      expect(ok.status).toBe(200)
      const ready = await ok.json() as { granted?: string[] }
      expect(ready.granted).toEqual(expect.arrayContaining(['config', 'state']))
    } finally {
      server.close()
    }
  })

  it('应答头说清 no-store 与 nosniff（这条发的是会变的设置读数）', async () => {
    const handler = hostBridgeHandler({ settings: () => fakeSettings(), allowedNamespaces: () => ALLOWED })
    const seen = await ask(handler, hello())
    expect(seen.headers?.['cache-control']).toBe('no-store')
    expect(seen.headers?.['x-content-type-options']).toBe('nosniff')
  })

  it('并发两条请求的应答按 id 各回各处（会话表按 id 分发，不是后到通吃）', async () => {
    const settings = fakeSettings()
    const handler = hostBridgeHandler({ settings: () => settings, allowedNamespaces: () => ALLOWED })
    await ask(handler, hello())
    const first = request('state.getData', ['xaihi-linedup'], 'id-first')
    const second = request('state.getData', ['other-node'], 'id-second')
    const [a, b] = await Promise.all([
      ask(handler, first.body),
      ask(handler, second.body),
    ])
    expect(a.body.id).toBe('id-first')
    expect(a.body.value.json).toBe('{"marks":["a"]}')
    expect(b.body.id).toBe('id-second')
    expect(b.body.value.json).toBe('{"secret":1}')
  })
})

describe('detectHostMount：这份产物里到底有没有问宿主的装载点', () => {
  // 夹具按用例建、按用例拆：`afterEach` 在**每个**用例之后跑，只在 describe 开头建一次的话，
  // 第一个用例就把目录删掉了，后面两条读到的是 ENOENT（实机红过一次）。
  let fixture = ''
  beforeEach(() => { fixture = mkdtempSync(join(tmpdir(), 'xaihi-hostmount-')) })
  afterEach(() => { rmSync(fixture, { recursive: true, force: true }) })

  it('判据用的字面串与桥契约是同一份，不是脚本里另抄的常量', () => {
    expect(HOST_MOUNT_MARKERS[0]).toBe(BRIDGE_SCHEMA)
    expect(HOST_MOUNT_MARKERS[1]).toBe('host-http')
  })

  it('入口产物里两个串都在 ⇒ present', () => {
    writeFileSync(join(fixture, HOST_MOUNT_ENTRY), `const a="${HOST_MOUNT_MARKERS[0]}";const b="${HOST_MOUNT_MARKERS[1]}";`)
    expect(detectHostMount(fixture)).toBe('present')
  })

  it('剥掉载体那一串 ⇒ absent（阳性对照：只剩契约号不算接上）', () => {
    writeFileSync(join(fixture, HOST_MOUNT_ENTRY), `const a="${HOST_MOUNT_MARKERS[0]}";const b="postMessage";`)
    expect(detectHostMount(fixture)).toBe('absent')
  })

  it('入口产物读不到 / 目录没配 ⇒ unreadable，不许与 absent 混成一句', () => {
    expect(detectHostMount(join(fixture, 'nope'))).toBe('unreadable')
    expect(detectHostMount('')).toBe('unreadable')
  })
})
