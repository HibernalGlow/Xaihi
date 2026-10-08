/**
 * 装配点（`useNodeHostApi`）的**行为判据**：哪几片真的走桥、哪几片真的留在文档里。
 *
 * 与 `node-host-bridge.spec.ts` 的分工：那份量的是**折叠形状**（`toNodeHostApi` 把分组面
 * 折成扁名对不对），这一份量的是**接线**（装配点有没有把桥接上、有没有把文档本地那几片
 * 误接到桥上）。两件事都会红成"节点读不到值"，但原因完全不同 —— 拆开才查得动。
 *
 * 桥的两边都是生产代码（`createDocumentBridge` + `createShellBridge`），只有最底下的
 * DSH 设置面是假的 —— 与 `node-host-bridge.spec.ts` 同一套装配，因为替身桥会按我的期待
 * 造应答，那种绿证的是替身。
 *
 * @module xaihi-ui/tests/node-host-wiring
 */

import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  NODE_CAPABILITY_IDS,
  STATE_SETTINGS_FIELD,
  STATE_SETTINGS_NS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { DocumentBridgeProvider } from '@/document/bridge-context'
import { useNodeHostApi } from '@/components/modules/hostApi'
import { useWorkspaceStore } from '@/store/workspaceStore'

const ORIGIN = 'dsh-app://app'
const NODE = 'xaihi-sleept'

/** 一次探测的读数：模块级数组，`Probe` 往里追加，断言按前缀挑行。 */
let lines: string[] = []
beforeEach(() => { lines = [] })

/** 记录文档侧发出去的每一条桥动词 —— "这一片走没走桥"就是照着它量。 */
let verbs: string[] = []
beforeEach(() => { verbs = [] })

/** 一条内存线：两侧各自在微任务里喂给对方（照 `node-host-bridge.spec.ts` 的同一段做法）。 */
function wired (caps: Parameters<typeof createShellBridge>[0]) {
  const docBridge = createDocumentBridge(
    (message) => { queueMicrotask(() => { void shellBridge.receive(message, ORIGIN) }) },
    ORIGIN,
    [...NODE_CAPABILITY_IDS],
  )
  const shellBridge = createShellBridge(caps, (message: BridgeMessage) => {
    queueMicrotask(() => { void docBridge.receive(message, ORIGIN) })
  }, ORIGIN)
  const call = docBridge.call.bind(docBridge)
  docBridge.call = (method, ...args) => {
    verbs.push(method)
    return call(method, ...args)
  }
  return { docBridge, shellBridge }
}

/** 假的 DSH 设置服务：只实现桥真的会用到的三个动词。 */
function fakeSettings (): SettingsFace {
  const rows: Record<string, Record<string, unknown>> = {
    [STATE_SETTINGS_NS]: { [STATE_SETTINGS_FIELD]: {} as Record<string, string> },
    [NODE]: { panel: 'wide' },
  }
  let revision = 4
  return {
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

/** 每条跨界调用都记一行结果；成败都记，免得"没抛"被当成"成功"。 */
function Probe ({ compId }: { compId: string }): null {
  const host = useNodeHostApi(compId, NODE)
  useEffect(() => {
    const why = (error: unknown): string => {
      const failure = error as { reason?: unknown; detail?: unknown }
      return `reason=${String(failure.reason)} detail=${String(failure.detail)}`
    }
    void (async () => {
      // `config` 这一片在上游契约里是**可选**的（没接线就不该有），所以先判有没有，
      // 再判它通不通 —— 两件事在界面上要分开读（"缺这一片" ≠ "对面拒了"）。
      const configFace = host.config
      if (configFace === undefined) {
        lines.push('config.get failed reason=missing-face detail=节点 host 没接 config 这一片')
      } else {
        try {
          const value = await configFace.get()
          lines.push(`config.get ok ${JSON.stringify(value)}`)
        } catch (error) {
          lines.push(`config.get failed ${why(error)}`)
        }
      }
      host.patchData(compId, { wiringProbe: 1 })
      lines.push(`local getData ${JSON.stringify(host.getData(compId) ?? null)}`)
      lines.push(`localFiles.getUrl ${String(host.localFiles?.getUrl('/tmp/probe.png'))}`)
      try {
        await host.localFiles?.openPath?.('/tmp/probe.png')
        lines.push('openPath ok')
      } catch (error) {
        lines.push(`openPath failed ${why(error)}`)
      }
      try {
        await host.actions?.run?.(NODE, {})
        lines.push('runner ok')
      } catch (error) {
        lines.push(`runner failed ${why(error)}`)
      }
      lines.push('done')
    })()
  }, [host, compId])
  return null
}

/** 在 store 里真的部署一个组件，拿它自己的 id —— 不手搓 `ComponentInstance` 的形状。 */
function deployProbeComponent (): string {
  const store = useWorkspaceStore.getState()
  store.deployComponent(NODE)
  const created = useWorkspaceStore.getState().components.at(-1)
  if (created === undefined) throw new Error('store 没给出部署后的组件：这条判据的前置条件不成立')
  return created.id
}

describe('节点 host 面的装配：哪几片走桥，哪几片留在文档里', () => {
  it('config 走桥（落到设置面那一份读数上），state 留在文档里（同步可读、不过桥）', async () => {
    const { docBridge } = wired({ settings: fakeSettings(), settingsNs: STATE_SETTINGS_NS })
    await handshake(docBridge)
    const compId = deployProbeComponent()

    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Probe compId={compId} />
      </DocumentBridgeProvider>,
    )
    await waitFor(() => { expect(lines).toContain('done') })

    const configLine = lines.find((line) => line.startsWith('config.get ok'))
    expect(configLine, `config.get 没走通：${lines.join(' | ')}`).toBeDefined()
    // 值确实来自对面那份设置读数（而不是本地编的）：里面应当有我们那一格与节点那一格。
    expect(configLine).toContain(STATE_SETTINGS_NS)
    expect(configLine).toContain(NODE)

    expect(verbs, 'config.get 该过桥').toContain('config.get')
    expect(lines.find((line) => line.startsWith('local getData'))).toContain('wiringProbe')
    /*
     * 这一条是"同步那份永远在文档里"的判据：`patchData` 只改本地 store，
     * 桥上一次 `state.patchData` 都不该出现（节点状态那种"持久在壳、同步在文档"
     * 的分工由 `createPersistedState` 负责，不是这一层的 `state` 面）。
     */
    expect(verbs, 'state 的写不该过桥').not.toContain('state.patchData')
  })

  it('localFiles 一半留文档（getUrl）、一半如实拒绝（openPath 问到没有提供者的对面）', async () => {
    const { docBridge } = wired({ settings: fakeSettings(), settingsNs: STATE_SETTINGS_NS })
    await handshake(docBridge)
    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Probe compId={deployProbeComponent()} />
      </DocumentBridgeProvider>,
    )
    await waitFor(() => { expect(lines).toContain('done') })

    expect(lines.find((line) => line.startsWith('localFiles.getUrl'))).toContain('/xaihi/files/')
    // 本仓的同源文件路由是文档自己那一侧的事，不该过一次桥。
    expect(verbs).not.toContain('localFiles.getUrl')
    /*
     * 挑文件/开路径是宿主的动作，而**这一整套装配里外壳没有提供 localFiles 这一组**
     * （`createShellBridge` 只注入了 settings），所以读到的是组级拒 `refused`，
     * 而不是动词级的 `no-provider` —— 两者都算"如实拒绝"，但原因不是同一层，
     * 断言要钉在真的那一层上，否则这条尺会因为"拒得对但不是我以为的那句"而假红。
     */
    const openPathLine = lines.find((line) => line.startsWith('openPath failed'))
    expect(openPathLine).toMatch(/reason=refused/u)
    expect(openPathLine).toContain('外壳没有提供这一组')
  })

  it('runner 如实拒绝，并把对面那句原因原样带出来（不静默、不编一份实现）', async () => {
    const { docBridge } = wired({ settings: fakeSettings(), settingsNs: STATE_SETTINGS_NS })
    await handshake(docBridge)
    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Probe compId={deployProbeComponent()} />
      </DocumentBridgeProvider>,
    )
    await waitFor(() => { expect(lines).toContain('done') })

    const runnerLine = lines.find((line) => line.startsWith('runner failed'))
    expect(runnerLine, `runner 应该抛出点名原因而不是返回假结果：${lines.join(' | ')}`).toBeDefined()
    expect(runnerLine).toMatch(/reason=refused/u)
    // 原因原样来自对面（外壳没提供这一组），不是这里现编的一句话。
    expect(runnerLine).toContain('外壳没有提供这一组')
    expect(lines).not.toContain('runner ok')
  })

  it('没有桥时不静默：要问对面的调用都抛点名原因（带上"不在宿主里"那句），文档本地那几片照常可用', async () => {
    render(<Probe compId={deployProbeComponent()} />)
    await waitFor(() => { expect(lines).toContain('done') })

    // config 那一支会先撞上"没带设置命名空间"这道闸（同一条路上的第一道），仍是 no-provider。
    expect(lines.find((line) => line.startsWith('config.get failed'))).toMatch(/reason=no-provider/u)
    // 这里的每一条都带着那句"这份文档不在宿主里"——不是 not-ready（那会误导：没有宿主的文档等不到握手）。
    expect(lines.find((line) => line.startsWith('runner failed'))).toContain('不在宿主里')
    expect(lines.find((line) => line.startsWith('openPath failed'))).toContain('不在宿主里')
    // state 与 localFiles.getUrl 这类文档本地的能力不受影响：没有宿主不等于什么都做不了。
    expect(lines.find((line) => line.startsWith('local getData'))).toContain('wiringProbe')
    expect(lines.find((line) => line.startsWith('localFiles.getUrl'))).toContain('/xaihi/files/')
  })
})
