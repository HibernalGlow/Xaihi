/**
 * 文档侧 host 代理的测试：形状合上游、失败读得回、本地的事不过桥。
 *
 * 这一层唯一的价值主张是"节点 UI 一行不改"，所以测试判的是三件事：
 * 方法名与九组对得上；跨界调用带上本该带的归属（哪个节点、第几版）；
 * 不该过桥的事（组件状态、本地下载）确实一条消息都没发出去。
 * @module xaihi-ui/tests/document-host
 */

import { describe, expect, it } from 'vitest'
import {
  BridgeError,
  NODE_CAPABILITY_IDS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type DocumentBridge,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { DOCUMENT_FULFILLED_GROUPS, createDocumentHost, isDocumentFulfilled } from '../src/client/document-host.ts'

const ORIGIN = 'http://127.0.0.1:3199'

interface Harness {
  host: ReturnType<typeof createDocumentHost>
  bridge: DocumentBridge
  shellCalls: string[]
  sent: BridgeMessage[]
}

const build = (options: {
  settings?: SettingsFace
  env?: { theme: 'light' | 'dark'; platform: string }
  handshake?: boolean
  node?: string
  settingsNs?: string
  /** 不注入工作台那一格（顶层单节点文档的真实形状：没有组件清单可问）。 */
  noWorkspace?: boolean
} = {}): Harness => {
  const shellCalls: string[] = []
  const sent: BridgeMessage[] = []
  let shell: ReturnType<typeof createShellBridge> | undefined
  let doc: DocumentBridge | undefined

  const toShell = (message: BridgeMessage) => {
    sent.push(message)
    void shell?.receive(message, ORIGIN)
  }
  const toDocument = (message: BridgeMessage) => {
    sent.push(message)
    void doc?.receive(message, ORIGIN)
  }

  const settings: SettingsFace = options.settings ?? {
    describe: () => {
      shellCalls.push('describe')
      // 行形状按 2026-10-06 从真设置面读回来的那份写（`namespaces[]` 带 `ns`/`value`/`revision`），
      // 不是字符串数组——`config.getUi` 的投影只认前者，用后者的话这条用例就只是在测自己。
      return { namespaces: [{ ns: options.settingsNs ?? options.node ?? 'sleept', value: { panel: 'wide' }, revision: 5 }] }
    },
    update: async (ns, patch, revision) => {
      shellCalls.push(`update:${ns}:${JSON.stringify(patch)}:${revision ?? ''}`)
      return { revision: 4 }
    },
  }

  shell = createShellBridge(
    {
      settings: options.settings === undefined ? settings : options.settings,
      // exactOptionalPropertyTypes：没给 env 时**不写这个键**，而不是写一个 undefined。
      ...(options.env === undefined ? {} : { env: options.env }),
      // 命名空间和 env 同一条路：文档猜不出 DSH 的 loader 行 id，只能由外壳随握手带过来。
      ...(options.settingsNs === undefined ? {} : { settingsNs: options.settingsNs }),
    },
    toDocument,
    ORIGIN,
  )
  doc = createDocumentBridge(toShell, ORIGIN, [...NODE_CAPABILITY_IDS])
  if (options.handshake !== false) doc.hello(options.node ?? 'sleept')

  const state = { mode: 'block' as string, hits: 0 }
  const host = createDocumentHost({
    bridge: doc,
    state: {
      getData: () => {
        state.hits += 1
        return { ...state }
      },
      patchData: (patch) => Object.assign(state, patch),
    },
    // 工作台那一格按**接线**判：`noWorkspace` 那份就是顶层单节点文档的形状（没有组件清单可问）。
    ...(options.noWorkspace === undefined
      ? { workspace: { listComponents: () => [{ id: 'c1' }], updateComponent: () => undefined } }
      : {}),
  })
  return { host, bridge: doc, shellCalls, sent }
}

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  const value = await promise.catch((error: unknown) => error)
  expect(value).toBeInstanceOf(BridgeError)
  return (value as BridgeError).reason
}

describe('形状', () => {
  it('九组都在，且组内的方法名逐字对得上上游那份接口', () => {
    const { host } = build()
    expect(Object.keys(host).sort()).toEqual(['clipboard', 'config', 'contract', 'downloads', 'env', 'localFiles', 'runner', 'state', 'workspace'])
    expect(Object.keys(host.config).length).toBe(18)
    expect(Object.keys(host.localFiles).length).toBe(7)
    expect(Object.keys(host.clipboard).length).toBe(7)
    expect(Object.keys(host.runner).sort()).toEqual(['cancelCurrent', 'getInfo', 'run'])
    expect(host.contract.name).toBe('xaihi.node-host')
  })

  it('contract.hasCapability 就是握手里 granted 的那份，不是本地另算的表', () => {
    const { host } = build()
    expect(host.contract.hasCapability('config')).toBe(true)
    expect(host.contract.hasCapability('runner')).toBe(false)
    expect(host.contract.supportedCapabilities).toEqual(expect.arrayContaining(['config', 'contract']))
    // 外壳没带环境快照时 env 不在 granted 里——这条不是"表变了"，而是"表不再替壳说谎"
    // （2026-10-06 实测：granted 里有 env 而 ready.env 不存在，界面读 host.env 就抛）。
    expect(host.contract.hasCapability('env')).toBe(false)
    const withEnv = build({ env: { theme: 'dark', platform: 'web' } })
    expect(withEnv.host.contract.hasCapability('env')).toBe(true)
    expect(withEnv.host.env).toEqual({ theme: 'dark', platform: 'web' })
  })

  it('握手前问 contract 版本得到 not-ready，而不是一个空串', () => {
    const { host } = build({ handshake: false })
    expect(() => host.contract.version).toThrowError(/还没拿到宿主握手应答/)
  })
})

describe('本地的事不过桥', () => {
  it('state 读本地，一条消息都不发（把它过桥就是把同一份状态放两个 realm）', () => {
    const { host, sent } = build()
    const before = sent.length
    expect(host.state.getData()).toMatchObject({ mode: 'block' })
    host.state.patchData({ mode: 'prevent' })
    expect(host.state.getData()).toMatchObject({ mode: 'prevent' })
    expect(sent).toHaveLength(before)
  })

  it('workspace 按接线判：没注入时抛有名字的 refused，注入了才读到那一份，两者都不发桥消息', () => {
    // 2026-10-07 早先那一刀是按协商闸的（granted 里有没有 workspace），错在 `workspace` 归文档自己
    // （`host-bridge.ts:163` 的 `DOCUMENT_OWNED_GROUPS`）——外壳永远不会 grant 它，
    // 那条闸会把工作台里真实的组件清单一起闸没。想防的静默错答案不变，但防的是"塞空壳假装接了线"。
    const unwired = build({ noWorkspace: true })
    const beforeUnwired = unwired.sent.length
    expect(() => unwired.host.workspace.listComponents()).toThrowError(/没有工作台可问/)
    expect(unwired.sent).toHaveLength(beforeUnwired)

    const wired = build()
    const beforeWired = wired.sent.length
    expect(wired.host.workspace.listComponents()).toEqual([{ id: 'c1' }])
    expect(wired.sent).toHaveLength(beforeWired)
  })

  it('downloads.text 在文档里造 Blob 就完事，不占一次往返', () => {
    const { host, sent } = build()
    const before = sent.length
    let clicked = 0
    const realCreate = document.createElement.bind(document)
    document.createElement = ((tag: string) => {
      const el = realCreate(tag) as HTMLElement
      if (tag === 'a') {
        clicked += 1
        el.click = () => undefined
      }
      return el
    }) as typeof document.createElement
    host.downloads.text('a.txt', 'hello')
    document.createElement = realCreate
    expect(clicked).toBe(1)
    expect(sent).toHaveLength(before)
  })

  it('本地那一组被单列成"文档自己兑现"，其余不过桥的事不算在内（界面靠这个分句）', () => {
    expect(isDocumentFulfilled('downloads')).toBe(true)
    expect(isDocumentFulfilled('clipboard')).toBe(false)
    expect(isDocumentFulfilled('localFiles')).toBe(false)
    expect(DOCUMENT_FULFILLED_GROUPS).toEqual(['downloads'])
  })

  it('localFiles.getUrl 指本仓同源路由，不是去问外壳', () => {
    const { host, sent } = build()
    const before = sent.length
    expect(host.localFiles.getUrl('/tmp/啊.png')).toBe(`/xaihi/files/${encodeURIComponent('/tmp/啊.png')}`)
    expect(sent).toHaveLength(before)
  })
})

describe('跨界调用带的归属', () => {
  it('config.get 带的是**设置命名空间**（loader 行的 id），不是节点短名', async () => {
    const { host, sent } = build({ settingsNs: 'xaihi-sleept' })
    await host.config.get()
    const request = sent.find((message): message is Extract<BridgeMessage, { kind: 'request' }> =>
      message.kind === 'request' && message.method === 'config.get')
    expect(request?.args).toEqual(['xaihi-sleept'])
  })

  it('config.save 把命名空间、补丁、expectedRevision 三段都送到', async () => {
    const { host, shellCalls } = build({ settingsNs: 'xaihi-sleept' })
    await host.config.save({ blockSleep: true }, 7)
    expect(shellCalls).toEqual(['update:xaihi-sleept:{"blockSleep":true}:7'])
  })

  it('config.getUi/saveUi 走同一个命名空间（一窗一节点，所以一个串就够）', async () => {
    const { host, shellCalls, sent } = build({ settingsNs: 'xaihi-sleept' })
    const view = await host.config.getUi()
    expect(view).toEqual({ ns: 'xaihi-sleept', value: { panel: 'wide' }, revision: 5 })
    await host.config.saveUi({ panel: 'wide' }, 2)
    expect(shellCalls).toEqual(['describe', 'update:xaihi-sleept:{"panel":"wide"}:2'])
    const saved = sent.filter((message): message is Extract<BridgeMessage, { kind: 'request' }> =>
      message.kind === 'request' && message.method === 'config.saveUi')
    expect(saved[0]?.args).toEqual(['xaihi-sleept', { panel: 'wide' }, 2])
  })

  it('没带命名空间时四条一律 no-provider，且一条消息都不发（不拿节点短名顶一次）', async () => {
    const { host, sent } = build()
    const before = sent.length
    expect(await reasonOf(host.config.get())).toBe('no-provider')
    expect(await reasonOf(host.config.save({ blockSleep: true }))).toBe('no-provider')
    expect(await reasonOf(host.config.getUi())).toBe('no-provider')
    expect(await reasonOf(host.config.saveUi({ panel: 'wide' }))).toBe('no-provider')
    expect(sent).toHaveLength(before)
  })
})

describe('失败读得回', () => {
  it('没被授予的组 ⇒ refused；界面上据此显示退化，而不是拿到 undefined 继续画', async () => {
    const { host } = build()
    expect(await reasonOf(host.runner.run('sleept', {}))).toBe('refused')
    expect(await reasonOf(host.clipboard.readText())).toBe('refused')
  })

  it('被授予的组里那条没提供者的动词 ⇒ no-provider', async () => {
    const { host } = build()
    expect(await reasonOf(host.config.getVersions())).toBe('no-provider')
  })

  it('外壳没带环境快照时 host.env 抛 refused，不自作主张挑一个亮色', () => {
    const noEnv = build()
    expect(() => noEnv.host.env).toThrowError(/没随握手带环境快照/)
    const withEnv = build({ env: { theme: 'dark', platform: 'linux' } })
    expect(withEnv.host.env).toEqual({ theme: 'dark', platform: 'linux' })
  })
})
