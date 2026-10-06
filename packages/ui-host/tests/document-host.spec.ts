/**
 * 文档侧 host 代理的测试：形状合上游、失败读得回、本地的事不过桥。
 *
 * 这一层唯一的价值主张是"节点 UI 一行不改"，所以测试判的是三件事：
 * 方法名与九组对得上；跨界调用带上本该带的归属（哪个节点、第几版）；
 * 不该过桥的事（组件状态、本地下载）确实一条消息都没发出去。
 * @module xaihi-ui/tests/document-host
 */

import { describe, expect, it } from 'vitest'
import { NODE_CAPABILITY_IDS, type BridgeMessage } from '@hibernalglow/xaihi-sdk'
import { createShellBridge, type SettingsFace } from '../src/client/bridge-shell.ts'
import { createDocumentBridge, BridgeError, type DocumentBridge } from '../src/client/bridge-document.ts'
import { createDocumentHost } from '../src/client/document-host.ts'

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
      return { namespaces: ['xaihi'] }
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
    },
    toDocument,
    ORIGIN,
  )
  doc = createDocumentBridge(toShell, ORIGIN, [...NODE_CAPABILITY_IDS])
  if (options.handshake !== false) doc.hello(options.node ?? 'sleept')

  const state = { mode: 'block' as string, hits: 0 }
  const host = createDocumentHost({
    bridge: doc,
    node: options.node ?? 'sleept',
    state: {
      getData: () => {
        state.hits += 1
        return { ...state }
      },
      patchData: (patch) => Object.assign(state, patch),
    },
    workspace: {
      listComponents: () => [{ id: 'c1' }],
      updateComponent: () => undefined,
    },
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
    expect(host.contract.supportedCapabilities).toEqual(expect.arrayContaining(['config', 'contract', 'env']))
  })

  it('握手前问 contract 版本得到 not-ready，而不是一个空串', () => {
    const { host } = build({ handshake: false })
    expect(() => host.contract.version).toThrowError(/还没拿到宿主握手应答/)
  })
})

describe('本地的事不过桥', () => {
  it('state 与 workspace 读本地，一条消息都不发（把它们过桥就是把同一份状态放两个 realm）', () => {
    const { host, sent } = build()
    const before = sent.length
    expect(host.state.getData()).toMatchObject({ mode: 'block' })
    host.state.patchData({ mode: 'prevent' })
    expect(host.state.getData()).toMatchObject({ mode: 'prevent' })
    expect(host.workspace.listComponents()).toEqual([{ id: 'c1' }])
    expect(sent).toHaveLength(before)
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

  it('localFiles.getUrl 指本仓同源路由，不是去问外壳', () => {
    const { host, sent } = build()
    const before = sent.length
    expect(host.localFiles.getUrl('/tmp/啊.png')).toBe(`/xaihi/files/${encodeURIComponent('/tmp/啊.png')}`)
    expect(sent).toHaveLength(before)
  })
})

describe('跨界调用带的归属', () => {
  it('config.get 把"这是哪个节点的配置"带到外壳（不带就等于交一份没有归属的读请求）', async () => {
    const { host, sent } = build()
    await host.config.get()
    const request = sent.find((message): message is Extract<BridgeMessage, { kind: 'request' }> =>
      message.kind === 'request' && message.method === 'config.get')
    expect(request?.args).toEqual(['sleept'])
  })

  it('config.save 把节点、补丁、expectedRevision 三段都送到', async () => {
    const { host, shellCalls } = build()
    await host.config.save({ blockSleep: true }, 7)
    expect(shellCalls).toEqual(['update:sleept:{"blockSleep":true}:7'])
  })

  it('config.saveUi 走的是同一个 (node, patch, revision) 形状', async () => {
    const { host, shellCalls } = build()
    await host.config.saveUi({ panel: 'wide' }, 2)
    expect(shellCalls).toEqual(['update:sleept:{"panel":"wide"}:2'])
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
