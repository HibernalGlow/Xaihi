/**
 * 装配点这一段的判据：握手 → `host.config` → 那一格之间的线接没接对。
 *
 * 这三条都是"接错会静默"的形状：
 * 1. 握手没落地时**必须什么都不装**——装了就会让界面读出一条"没有设置面"以外的假状态；
 * 2. 命名空间没带时必须不装，而不是拿节点短名或 `xaihi-core` 兜一份（2026-10-06 量过：
 *    DSH 只认 loader 行的 id，兜底等于把"没接线"伪装成一次合法写入）；
 * 3. 写出去的那条桥上，第一个参数是命名空间、第三个是版本号，且整份里别人的字段一个不能少。
 *
 * 假桥的包法照真那侧抄：`config.getUi` 回 `{ ns, value, revision }`，
 * `config.saveUi` 只回 `{ revision }`（`packages/node-sdk/src/bridge-shell.ts` 的
 * `readNamespace` 与 `projectWriteAck`）。
 *
 * @module xaihi-ui/tests/settings-face
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { attachSettingsFace } from '../src/backend/settings-face.ts'
import {
  getNodeMemoryProtection,
  setNodeMemoryProtection,
  setNodeMemoryProtectionFace,
  type NodeMemoryProtectionSettingsDTO,
} from '../src/backend/localBackendControl.ts'

const VALUE: NodeMemoryProtectionSettingsDTO = {
  defaultPolicy: { maxRssGrowthMiB: 8192, maxHeapGrowthMiB: 4096, maxRetainedEvents: 1000, sampleIntervalMs: 250 },
  nodePolicies: {},
}

const OTHERS = { verbose: true, uiBundleDir: '/tmp/ui', nodeState: { linedup: 'a' }, nodeUi: { linedup: 'b' } }

/** 一条只认 `config.getUi`/`config.saveUi` 的假桥；别的动词一律点名报错，防这里偷偷多用面。 */
function fakeBridge(options: { ready: unknown, config: unknown, revision?: number }) {
  const sent: Array<{ method: string, args: readonly unknown[] }> = []
  let stored = options.config
  let revision = options.revision ?? 0
  const bridge = {
    ready: () => options.ready,
    call: async (method: string, ...args: readonly unknown[]) => {
      sent.push({ method, args })
      if (method === 'config.getUi') return { ns: args[0], value: stored, revision }
      if (method === 'config.saveUi') {
        const [ns, whole, expectedRevision] = args as [string, Record<string, unknown>, number | undefined]
        if (ns !== (options.ready as { settingsNs?: string }).settingsNs) throw new Error(`命名空间不对：${ns}`)
        if (expectedRevision === undefined) throw new Error('写没带版本号')
        stored = whole
        revision += 1
        // 真那侧特意只回这一份（整份回包会撞上桥自己的大小上界）。
        return { revision }
      }
      throw new Error(`假桥不认识的方法：${method}`)
    },
    hello: () => {},
    receive: () => false,
    abortAll: () => {},
  } as unknown as DocumentBridge
  return { bridge, sent, readStored: () => stored }
}

afterEach(() => setNodeMemoryProtectionFace(undefined))

describe('设置面装配点', () => {
  it('握手还没落地：什么都不装，读回来是"没有设置面"那一档', async () => {
    const { bridge } = fakeBridge({ ready: null, config: { ...OTHERS, nodeMemoryProtection: VALUE } })
    expect(attachSettingsFace(bridge, 'workbench'), '没握手就装面 = 让界面读到一条假的可写状态').toBe(false)
    const state = await getNodeMemoryProtection()
    expect(state.supported).toBe(false)
    expect(state.reason).toContain('装配')
  })

  it('握手没带命名空间：也不装（不拿短名或 xaihi-core 兜一份）', async () => {
    const { bridge } = fakeBridge({ ready: { settingsNs: '', granted: ['config'], contractVersion: '1' }, config: { ...OTHERS, nodeMemoryProtection: VALUE } })
    expect(attachSettingsFace(bridge, 'workbench')).toBe(false)
    expect((await getNodeMemoryProtection()).supported).toBe(false)
  })

  it('握手带了命名空间：读得到值，写走 config.saveUi 并带着版本号', async () => {
    const { bridge, sent, readStored } = fakeBridge({
      ready: { settingsNs: 'xaihi-core', granted: ['config'], contractVersion: '1' },
      config: { ...OTHERS, nodeMemoryProtection: VALUE },
      revision: 5,
    })
    expect(attachSettingsFace(bridge, 'workbench')).toBe(true)

    const read = await getNodeMemoryProtection()
    expect(read.supported).toBe(true)
    expect(read.revision).toBe(5)

    const written = await setNodeMemoryProtection({ ...VALUE, defaultPolicy: { ...VALUE.defaultPolicy, sampleIntervalMs: 900 } })
    expect(written.settings?.defaultPolicy.sampleIntervalMs).toBe(900)
    expect(written.revision, '版本号要从写应答里读回来').toBe(6)

    const save = sent.find((row) => row.method === 'config.saveUi')
    expect(save, '写没过 config.saveUi = 这一格根本没打到设置面').toBeDefined()
    expect(save?.args[0]).toBe('xaihi-core')
    expect(save?.args[2]).toBe(5)
    const whole = readStored() as Record<string, unknown>
    for (const key of Object.keys(OTHERS)) expect(whole[key], `桥上丢了的字段：${key}`).toEqual(OTHERS[key as keyof typeof OTHERS])
  })
})
