/**
 * "同步在文档、持久在壳"那一层的测试。
 *
 * 判的三件事：① 上游的同步形状没被破坏（`getData()` 直接返回值，组件一行不改）；
 * ② 写真的落到外壳那一条 volatile 字段里（走的是**真两半桥**，不是替身）；
 * ③ 失败读得回、并且**有界**——冲突只补读一次版本号，不许反复撞同一堵墙。
 * @module xaihi-ui/tests/persisted-state
 */

import { describe, expect, it } from 'vitest'
import {
  BridgeError,
  NODE_CAPABILITY_IDS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { createPersistedState, type PersistedState } from '../src/client/document-host.ts'

const ORIGIN = 'http://127.0.0.1:3199'

interface Rig {
  /** 文档那一侧的桥（`createPersistedState` 用的就是它）。 */
  calls: string[]
  /** 外壳那边设置面收到的写载荷，按顺序。 */
  writes: Record<string, unknown>[]
  state: PersistedState
  flushMicrotasks: () => Promise<void>
}

/** 起一对真桥（文档半 + 外壳半），外壳接一条可控的设置面。 */
const rig = (options: {
  node?: string
  stored?: Record<string, string>
  revision?: number
  failWritesWith?: { reason: string; detail: string }
  /** 模拟"同一个命名空间里有别人也在写"：第一发写被按冲突挡掉，版本号往前走一格。 */
  conflictOnce?: boolean
} = {}): Rig => {
  const calls: string[] = []
  const writes: Record<string, unknown>[] = []
  const node = options.node ?? 'sleept'
  let revision = options.revision ?? 4
  let conflicted = false
  const stored: Record<string, string> = { 'other-node': '{"keep":1}', ...(options.stored ?? {}) }

  // 冲突要么一直有（`failWritesWith`），要么只有第一发（`conflictOnce`）：
  // 后者是 2026-10-07 在真宿主上量到的那种形状——`nodeState` 整份共用一个命名空间版本号，
  // 同一份文档里另一处写也会把它顶上去，所以第一发撞、重读版本号那一发就该落。
  const rejectIfNeeded = (): void => {
    if (options.failWritesWith !== undefined) throw Object.assign(new Error('conflict'), options.failWritesWith)
    if (options.conflictOnce === true && !conflicted) {
      conflicted = true
      revision += 1
      throw Object.assign(new Error('conflict'), { reason: 'SETTINGS_CONFLICT', detail: `settings namespace "xaihi-core" changed since it was read` })
    }
  }

  const settings: SettingsFace = {
    describe: () => {
      calls.push('describe')
      return { namespaces: [{ ns: 'xaihi-core', revision, value: { verbose: false, nodeState: { ...stored } } }] }
    },
    update: async (ns, patch) => {
      calls.push(`update:${ns}`)
      writes.push(patch)
      rejectIfNeeded()
      revision += 1
      return { revision }
    },
    mutate: async (_ns, ops) => {
      calls.push('mutate')
      writes.push({ ops: ops.map((op) => ({ op: op.op, path: op.path as readonly string[], value: op.value })) })
      rejectIfNeeded()
      revision += 1
      return { revision }
    },
  }

  const sent: BridgeMessage[] = []
  let docBridge: ReturnType<typeof createDocumentBridge> | undefined
  const shell = createShellBridge({ settings }, (message) => {
    sent.push(message)
    void docBridge?.receive(message, ORIGIN)
  }, ORIGIN)
  docBridge = createDocumentBridge((message) => {
    sent.push(message)
    void shell.receive(message, ORIGIN)
  }, ORIGIN, [...NODE_CAPABILITY_IDS])

  // 握手必须走完：外壳那一半在没协商前一条都不答应。
  docBridge.hello(node)
  const state = createPersistedState({ bridge: docBridge, node })
  return {
    calls,
    writes,
    state,
    flushMicrotasks: async () => {
      // 两半桥是消息驱动的，一条请求要等对面回；轮转几轮把在飞的消息排干。
      for (let round = 0; round < 8; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}

describe('createPersistedState', () => {
  it('hydrate 之后同步就有的读；没 hydrate 时是 undefined（不许猜一份默认值）', async () => {
    const r = rig({ stored: { sleept: '{"mode":"block","hits":3}' } })
    expect(r.state.getData()).toBeUndefined()
    await r.state.hydrate()
    await r.flushMicrotasks()
    expect(r.state.getData()).toEqual({ mode: 'block', hits: 3 })
  })

  it('没存过这个节点时 hydrate 报 false，本地仍是 undefined 而不是空对象', async () => {
    const r = rig({ stored: {} })
    expect(await (async () => { const got = await r.state.hydrate(); await r.flushMicrotasks(); return got })()).toBe(false)
    expect(r.state.getData()).toBeUndefined()
  })

  it('patchData 同步生效，写往后刷：走路径级 mutate 且带着刚读到的版本号', async () => {
    const r = rig({ stored: { sleept: '{"mode":"block"}' } })
    await r.state.hydrate()
    await r.flushMicrotasks()
    r.state.patchData({ mode: 'grid' })
    // 同步那一份立刻就是新的——这是"组件一行不改"的关键，不能被异步写拖住。
    expect(r.state.getData()).toEqual({ mode: 'grid' })
    await r.state.flush()
    await r.flushMicrotasks()
    expect(r.writes[0]?.ops).toEqual([{ op: 'set', path: ['nodeState', 'sleept'], value: '{"mode":"grid"}' }])
    expect(r.state.syncError()).toBeNull()
  })

  it('连着两次 patch 只写最后一次那份整份 JSON（不叠成两笔）', async () => {
    const r = rig({ stored: { sleept: '{"a":1}' } })
    await r.state.hydrate()
    await r.flushMicrotasks()
    r.state.patchData({ a: 2 })
    r.state.patchData({ b: 3 })
    await r.state.flush()
    await r.flushMicrotasks()
    const values = r.writes.flatMap((w) => ((w as { ops?: { value?: unknown }[] }).ops ?? []).map((op) => op.value))
    expect(values.filter((v) => v === '{"a":2,"b":3}')).toHaveLength(1)
    expect(values.some((v) => v === '{"a":2}')).toBe(false)
  })

  it('写失败时 syncError 读得回原因，并且只补读一次版本号（有界，不无界重试）', async () => {
    const r = rig({ stored: { sleept: '{"a":1}' }, failWritesWith: { reason: 'SETTINGS_CONFLICT', detail: 'revision 4 已经不是最新' } })
    await r.state.hydrate()
    await r.flushMicrotasks()
    const describesBefore = r.calls.filter((c) => c === 'describe').length
    r.state.patchData({ a: 2 })
    await r.state.flush()
    await r.flushMicrotasks()
    expect(r.state.syncError()).toContain('SETTINGS_CONFLICT')
    // 本地那份不能因为写失败就回滚：使用者看到的界面就是他自己改成的样子。
    expect(r.state.getData()).toEqual({ a: 2 })
    expect(r.calls.filter((c) => c === 'describe').length - describesBefore).toBe(1)
    // 有界的另一面：补一发就到顶，两发都失败就停在 syncError() 里，不再往下撞。
    expect(r.writes).toHaveLength(2)
  })

  it('冲突之后带着重读到的版本号补那一发，本地那一笔真的落下去（不等使用者的下一笔）', async () => {
    // 真宿主上量到的形状：nodeState 整份共用一个命名空间版本号，同一份文档里另一处写会把它顶上去。
    // 只重读版本号而不重试，等于把落盘寄托在"还有下一笔写"上——一次单独的保存就会静默留在窗里。
    const r = rig({ stored: { sleept: '{"a":1}' }, conflictOnce: true })
    await r.state.hydrate()
    await r.flushMicrotasks()
    r.state.patchData({ a: 2 })
    await r.state.flush()
    await r.flushMicrotasks()
    expect(r.state.syncError()).toBeNull()
    expect(r.writes).toHaveLength(2)
    const values = r.writes.flatMap((w) => ((w as { ops?: { value?: unknown }[] }).ops ?? []).map((op) => op.value))
    expect(values[values.length - 1]).toBe('{"a":2}')
  })

  it('工作台自己（没有节点 id）不写、也不抛，只把"没处可写"这条念出来', async () => {
    const r = rig({ node: '' })
    r.state.patchData({ a: 1 })
    await r.state.flush()
    await r.flushMicrotasks()
    expect(r.writes).toHaveLength(0)
    expect(r.state.syncError()).toContain('没处可写')
    expect(await r.state.hydrate()).toBe(false)
  })

  it('hydrate 时桥那头失败要抛（不是静默回 undefined 让界面按空态画一遍）', async () => {
    // 外壳那半会把注入的面抛出的错转成一条错误应答（那是同一次实测里补的行为），
    // 文档这半必须原样抛给调用方——否则界面拿到的是"没有数据"，而真因是"设置面炸了"。
    const boom = rigWithBrokenDescribe()
    await expect(boom.state.hydrate()).rejects.toBeInstanceOf(BridgeError)
  })
})

/** 设置面连 describe 都抛的那台桥——用来证"hydrate 的失败会传到调用方"。 */function rigWithBrokenDescribe(): Rig {
  const calls: string[] = []
  const settings: SettingsFace = {
    describe: () => {
      calls.push('describe')
      throw Object.assign(new Error('host blew up'), { reason: 'remote-failure', detail: '设置面读不到' })
    },
    update: async () => ({ revision: 1 }),
  }
  let docBridge: ReturnType<typeof createDocumentBridge> | undefined
  const shell = createShellBridge({ settings }, (message) => void docBridge?.receive(message, ORIGIN), ORIGIN)
  docBridge = createDocumentBridge((message) => void shell.receive(message, ORIGIN), ORIGIN, [...NODE_CAPABILITY_IDS])
  docBridge.hello('sleept')
  return {
    calls,
    writes: [],
    state: createPersistedState({ bridge: docBridge, node: 'sleept' }),
    flushMicrotasks: async () => {
      for (let round = 0; round < 8; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
    },
  }
}
