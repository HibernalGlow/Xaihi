/**
 * `runHostRoundTrip` 的复算：**桥的两半都用生产代码**，只有最底下的设置面是假的。
 *
 * 为什么不许拿一个手搓的 bridge 测：这条读数的全部意义是"界面能问到的东西与对面给的一致"，
 * 而替身会按我自己的期待造应答——那种绿证的是替身（本仓在同一条桥上为这件事栽过一次：
 * 假件只回 `{revision}`，真的那次 200 KiB 写"落盘成功却回 too-large"在测里根本看不见）。
 * 这里文档半边是 `createDocumentBridge`、外壳半边是 `createShellBridge`，中间一条内存线，
 * 唯一假的是 DSH 的设置服务。
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
import { createDocumentHost, createPersistedState } from '../src/client/document-host.ts'
import { runHostRoundTrip } from '../src/document/host-probe.ts'

const ORIGIN = 'dsh-app://app'
const NODE = 'xaihi-linedup'

/** 一条内存线：两侧各自在微任务里喂给对方，模拟 postMessage 的异步性。 */
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

/** 假的 DSH 设置服务：值与 revision 分开记，才能看出"写到底下去了没有"。 */
function fakeSettings (): SettingsFace & { rows: Record<string, Record<string, unknown>> } {
  const rows: Record<string, Record<string, unknown>> = {
    [STATE_SETTINGS_NS]: { [STATE_SETTINGS_FIELD]: {} as Record<string, string> },
    'xaihi-linedup': { panel: 'wide' },
  }
  let revision = 4
  return {
    rows,
    describe: () => ({
      namespaces: Object.entries(rows).map(([ns, value]) => ({ ns, revision, value })),
    }),
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

/** 握手：文档半边发 hello，外壳半边答 ready；两侧都跑生产代码。 */
async function handshake (docBridge: ReturnType<typeof createDocumentBridge>): Promise<void> {
  docBridge.hello(NODE)
  for (let i = 0; i < 200 && docBridge.ready() === null; i++) {
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
  expect(docBridge.ready()).not.toBeNull()
}

/** 一组装配：把两侧与三份面接起来，返回界面能拿到的 `host` 与持久状态。 */
function assembled (caps: Parameters<typeof createShellBridge>[0]) {
  const { docBridge } = wired(caps)
  const state = createPersistedState({ bridge: docBridge, node: NODE })
  const host = createDocumentHost({
    bridge: docBridge,
    state,
    workspace: { listComponents: () => [], updateComponent: () => {} },
  })
  return { docBridge, host, state }
}

describe('runHostRoundTrip', () => {
  it('对面给得出设置与状态时，读数里三条都是走过对面回来的', async () => {
    const settings = fakeSettings()
    const { docBridge, host, state } = assembled({ settings, settingsNs: STATE_SETTINGS_NS })
    await handshake(docBridge)
    const readout = await runHostRoundTrip({ host, bridge: docBridge, state, node: NODE, marker: 'probe-A' })

    expect(readout.version).toBe(BRIDGE_CONTRACT_VERSION)
    expect(readout.capabilities).toEqual(expect.arrayContaining(['config', 'state']))
    expect(readout.ui).toEqual({ ns: STATE_SETTINGS_NS, revision: 4 })
    // 写这条断言时不许拿 readout 自己反推期望值：对面那份 rows 是独立可查的。
    expect(readout.state.crossed).toBe(true)
    expect(readout.state.readBack).toContain('probe-A')
    expect(readout.state.syncError).toBeNull()
    expect(readout.state.readError).toBeNull()
    expect(JSON.stringify(settings.rows[STATE_SETTINGS_NS])).toContain('probe-A')
    // 没给的那几组必须带一句人话，且 env 不在场就是"没带快照"。
    expect(readout.refused.map((row) => row.capability)).toEqual(expect.arrayContaining(['env', 'runner']))
    for (const row of readout.refused) expect(row.reason.length).toBeGreaterThan(3)
    // downloads 在这一套里同样**没被授予**（假外壳只给 contract/state/config），但动作在文档自己那一侧成立
    // ——真顶层窗里量到过：`hasCapability('downloads')=false` 而 `downloads.text()` 调用成功。
    // 所以它必须被单列出来，而不是和 clipboard/env/runner 混成同一句"没给"。
    expect(readout.documentFulfilled).toContain('downloads')
    expect(readout.documentFulfilled).not.toContain('clipboard')
  })

  it('阳性对照：外壳没挂设置面时，读数报的是 refused/no-provider 而不是一片绿', async () => {
    const { docBridge, host, state } = assembled({})
    await handshake(docBridge)
    const readout = await runHostRoundTrip({ host, bridge: docBridge, state, node: NODE, marker: 'probe-B' })

    expect(readout.capabilities).toEqual(['contract'])
    expect('error' in readout.ui).toBe(true)
    expect(readout.state.crossed).toBe(false)
    // 写与读两边的失败各自留一份：合并成一格就再也分不出该查哪一边。
    expect(readout.state.syncError).toContain('refused')
    expect(readout.state.readError).toContain('refused')
    expect(readout.refused.map((row) => row.capability)).toEqual(expect.arrayContaining(['config', 'state']))
  })

  it('还没握手时不抛，报一条"没握手过"的读数', async () => {
    const { docBridge, host, state } = assembled({ settings: fakeSettings(), settingsNs: STATE_SETTINGS_NS })
    const readout = await runHostRoundTrip({ host, bridge: docBridge, state, node: NODE, marker: 'probe-C' })
    expect(readout.capabilities).toEqual([])
    expect(readout.version).toBeNull()
    expect(readout.ui).toMatchObject({ error: 'not-ready' })
    expect(readout.refused.at(0)?.reason).toContain('没握手')
    expect(readout.state.crossed).toBe(false)
  })

  it('对面回的读数是形状不合的那种：报 bad-shape，不猜一个 ns', async () => {
    const broken = fakeSettings()
    broken.describe = () => ({ namespaces: [{ revision: 1 }] })
    const { docBridge, host, state } = assembled({ settings: broken, settingsNs: STATE_SETTINGS_NS })
    await handshake(docBridge)
    const readout = await runHostRoundTrip({ host, bridge: docBridge, state, node: NODE, marker: 'probe-D' })
    expect(readout.ui).toMatchObject({ error: 'config-namespace-missing' })
  })
})
