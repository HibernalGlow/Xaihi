/**
 * 折叠那层（`toNodeHostApi`）的判据：扁名要落到桥的分组上，而**装配那一刻不许把退化引爆**。
 *
 * 第二条不是洁癖：`XaihiNodeHost.env` 与 `contract.version` 是取时才走 `requireReady` 的取值器，
 * 上一版写成 `{ ...host }` ⇒ 折叠本身就抛 `refused`，真浏览器里的症状是协商板一切正常而
 * `#xaihi-ui-root` 空着（2026-10-07 实测）。这一条钉的就是"展开会红"。
 *
 * 桥的两边都是生产代码（`createDocumentBridge` + `createShellBridge`），只有最底下的 DSH 设置面是假的
 * ——与 `tests/host-probe.spec.ts` 同一套装配，因为替身桥会按我的期待造应答，那种绿证的是替身。
 * @module xaihi-ui/tests/node-host-bridge
 */
import { describe, expect, it } from 'vitest'
import {
  BRIDGE_CONTRACT_VERSION,
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_FIELD,
  STATE_SETTINGS_NS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentHost, createPersistedState, type XaihiNodeHost } from '../src/client/document-host.ts'
import { toNodeHostApi } from '../src/client/node-host-bridge.ts'

const ORIGIN = 'dsh-app://app'
const NODE = 'xaihi-linedup'

/** 一条内存线：两侧各自在微任务里喂给对方（照 `host-probe.spec.ts` 的同一段做法）。 */
function wired (caps: Parameters<typeof createShellBridge>[0]) {
  const docBridge = createDocumentBridge(
    (message) => { queueMicrotask(() => { void shellBridge.receive(message, ORIGIN) }) },
    ORIGIN,
    [...NODE_CAPABILITY_IDS],
  )
  const shellBridge = createShellBridge(caps, (message: BridgeMessage) => {
    queueMicrotask(() => { void docBridge.receive(message, ORIGIN) })
  }, ORIGIN)
  return { docBridge, shellBridge }
}

/** 假的 DSH 设置服务：值与 revision 分开记，才看得出写到底下没有。 */
function fakeSettings (): SettingsFace & { rows: Record<string, Record<string, unknown>> } {
  const rows: Record<string, Record<string, unknown>> = {
    [STATE_SETTINGS_NS]: { [STATE_SETTINGS_FIELD]: {} as Record<string, string> },
    [NODE]: { panel: 'wide' },
  }
  let revision = 4
  return {
    rows,
    describe: () => ({ namespaces: Object.entries(rows).map(([ns, value]) => ({ ns, revision, value })) }),
    update: async (ns, patch) => {
      rows[ns] = { ...(rows[ns] ?? {}), ...patch }
      revision += 1
      return { revision }
    },
    mutate: async (ns, ops) => {
      const target = rows[ns] ?? {}
      const section = (target[STATE_SETTINGS_FIELD] ?? {}) as Record<string, string>
      for (const op of ops) {
        if (op.op === 'set' && op.path.length === 2) section[op.path[1] as string] = String(op.value)
      }
      rows[ns] = { ...target, [STATE_SETTINGS_FIELD]: section }
      revision += 1
      return { revision }
    },
  }
}

async function handshake (docBridge: ReturnType<typeof createDocumentBridge>): Promise<void> {
  docBridge.hello(NODE)
  for (let i = 0; i < 200 && docBridge.ready() === null; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
}

/** 界面那一层拿到的东西：一份桥背书的分组面，折成扁表面之前的形状。 */
function grouped (settings: ReturnType<typeof fakeSettings> | null): { docBridge: ReturnType<typeof createDocumentBridge>; host: XaihiNodeHost; state: ReturnType<typeof createPersistedState> } {
  const { docBridge } = wired(settings === null ? {} : { settings, settingsNs: STATE_SETTINGS_NS })
  const state = createPersistedState({ bridge: docBridge, node: NODE })
  return {
    docBridge,
    state,
    host: createDocumentHost({ bridge: docBridge, state, workspace: { listComponents: () => [], updateComponent: () => {} } }),
  }
}

describe('toNodeHostApi：把桥的分组面折成节点组件读的扁表面', () => {
  it('装配时不抛，哪怕 env 此刻还 refused（写成展开 host 就红在这一句）', async () => {
    const { docBridge, host } = grouped(fakeSettings())
    await handshake(docBridge)
    expect(() => toNodeHostApi(host)).not.toThrow()
    const flat = toNodeHostApi(host)
    // 分组那片是**转发**而不是复制：读到的还是同一份，改一边另一边跟着变。
    expect(flat.state).toBe(host.state)
    expect(flat.contract.name).toBe('xaihi.node-host')
    expect(flat.contract.version).toBe(BRIDGE_CONTRACT_VERSION)
    // 没给的 env 在"读它的那一刻"才抛，抛的是桥上那句 refused。
    expect(() => flat.env).toThrow(/refused|没随握手带环境快照/u)
  })

  it('扁名 getData / patchData 折到 state 那组，同步那份立刻可读，值最终落在对面', async () => {
    const settings = fakeSettings()
    const { docBridge, host, state } = grouped(settings)
    await handshake(docBridge)
    const flat = toNodeHostApi(host)
    flat.patchData(NODE, { nodefaceMarker: 'folded-through-bridge' })
    expect(flat.getData<Record<string, unknown>>(NODE)).toEqual({ nodefaceMarker: 'folded-through-bridge' })
    await state.flush()
    expect(state.syncError()).toBeNull()
    expect(JSON.stringify(settings.rows[STATE_SETTINGS_NS])).toContain('folded-through-bridge')
  })

  it('扁名 config 折到对面那一格：getUi 读得到 ns，saveUi 带版本号写下去', async () => {
    const settings = fakeSettings()
    const { docBridge, host } = grouped(settings)
    await handshake(docBridge)
    const flat = toNodeHostApi(host)
    const read = await flat.getNodeUiConfig?.<Record<string, unknown>>()
    expect(JSON.stringify(read)).toContain(STATE_SETTINGS_NS)
    await flat.saveNodeUiConfig?.({ caseSensitive: true })
    expect(JSON.stringify(settings.rows[STATE_SETTINGS_NS])).toContain('caseSensitive')
  })

  it('未握手时扁名不静默：要抛就抛在对面没应答这一句上（阳性对照：静默返回 undefined 就是假绿）', () => {
    const { host } = grouped(fakeSettings())
    const flat = toNodeHostApi(host)
    expect(() => flat.contract.version).toThrow(/not-ready|没拿到宿主握手/u)
    return expect(flat.getNodeConfig?.()).rejects.toThrow()
  })
})
