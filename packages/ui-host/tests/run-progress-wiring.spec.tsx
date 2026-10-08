// @vitest-environment happy-dom
/**
 * 运行进度回显的判据：运行账本（`/xaihi/operations/stream`）→ `document-host` 的
 * `runner.run` 的 `onEvent` → 面板的进度条与日志。
 *
 * 为什么这条判据必须单独存在：桥是**请求／应答**的，"这次调用跑到哪儿了"过不了桥
 * （`bridge-shell.ts` 的 `createShellBridge` 只认 hello / request，HTTP 载体是一次 POST 换一条
 * JSON），所以过程事件只能由 `@/lib/nodeRunProgress` 跟着账本走。这条接线断掉时**不报错** ——
 * 症状只是进度条停在 0，而那与"这个节点本来就没有中间态"（`linedup` 就是后者）长得一模一样。
 * 所以这里把"帧到了必须发生什么"逐条钉住，也包括三条**不许**转的：别的节点的帧、收尾那一格
 * （`finished`，它由这次调用自己的应答写）、以及账本只给 `done` 没给 `total` 时那根假精确的进度条。
 *
 * 这份装配里**没有 xaihi-core**（`defineNode` 拿不到 `OPERATIONS_SERVICE`，落到 `NULL_RUN`），
 * 所以账本由判据自己喂帧；量的是**映射与订阅**，不是宿主那半边的记账。
 * 台账（三条互补，谁量什么写在各自文件头）：宿主那半边在
 * `packages/core/tests/local-runner-integration.spec.ts`，结果视图上屏在
 * `tests/local-runner-e2e.spec.tsx`，这一份补的是两者之间的**过程**那一段。
 *
 * 假的只有两处，都在判据的边界之外：DSH 的设置面（跨桥的 `config.*` 要它，而它不是这份判据
 * 的对象），以及 `EventSource` 本身 —— 真连一条 SSE 量的是网络与 happy-dom 的 URL 解析（它会把
 * 相对路径解到 `http://localhost:3000`，于是单元判据变成一次真网络请求），不是这条映射。
 *
 * @module xaihi-ui/tests/run-progress-wiring
 */

import { createElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { OPERATIONS_SCHEMA, type OperationsSnapshot } from '@hibernalglow/xaihi-sdk/operations'
import {
  STATE_SETTINGS_FIELD,
  STATE_SETTINGS_NS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { createLocalRunner, nodeRegistry } from '@hibernalglow/xaihi-sdk'
import type { NodeComponentProps, NodeRunEvent } from '@xiranite/contract'
import i18n, { initI18n } from '@/i18n'
import { DocumentBridgeProvider } from '@/document/bridge-context'
import { createDocumentHost } from '../src/client/document-host.ts'
import { documentRunProgressFeed, resetDocumentRunProgressFeed } from '../src/lib/nodeRunProgress.ts'
import { useNodeHostApi } from '@/components/modules/hostApi'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Component as SleeptComponent } from '@/nodes/sleept/Component'
import type { SleeptCardState } from '@/nodes/sleept/types'
import { apply as applySleept } from '../../../plugins/sleept/src/index.ts'

await initI18n('zh')
await i18n.changeLanguage('zh')

const ORIGIN = 'dsh-app://app'

/**
 * 面板的版面档位在 happy-dom 里量不出容器尺寸（`ResizeObserver` 不给值 ⇒ 一律判成 `collapsed`），
 * 而 `collapsed` 那档不渲染完整的工具条。按 `Component.host.test.tsx` 同一条做法把尺寸注入进去，
 * 量的是"进度有没有落到卡片上"，不是"容器量得准不准"。
 */
const surfaceState = vi.hoisted(() => ({ height: 420, width: 720 }))

vi.mock('@/nodes/shared/useNodeSurface', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/nodes/shared/useNodeSurface')>()
  return {
    ...actual,
    useNodeSurface: () => {
      const mode = actual.resolveNodeSurfaceMode(surfaceState)
      return {
        ref: { current: null },
        width: surfaceState.width,
        height: surfaceState.height,
        mode,
        density: actual.resolveNodeSurfaceDensity(mode),
      }
    },
  }
})

/**
 * 一条假的 `EventSource`。
 *
 * 只实现这份回显真会用到的那三条（`addEventListener` / `close` / `onerror`），另留一个
 * `frame()` 给判据自己喂帧 —— 判决点是"这条帧到了会发生什么"，把帧的**来源**换成
 * 一条真连接只会把量错东西的风险加进来。
 */
function fakeStream(): {
  source: { addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void; close: () => void; onerror: (() => void) | null }
  frame: (kind: string, data: unknown) => void
  connect: () => void
} {
  const listeners = new Map<string, Array<(event: { data?: unknown }) => void>>()
  const frame = (kind: string, data: unknown): void => {
    for (const listener of listeners.get(kind) ?? []) listener({ data: JSON.stringify(data) })
  }
  const snapshot: OperationsSnapshot = {
    schema: OPERATIONS_SCHEMA,
    seq: 0,
    oldestSeq: 0,
    truncated: false,
    kinds: [],
    runs: [],
  }
  return {
    source: {
      addEventListener: (type, listener) => {
        const bucket = listeners.get(type) ?? []
        bucket.push(listener)
        listeners.set(type, bucket)
      },
      close: () => {},
      onerror: null,
    },
    frame,
    connect: () => { frame('hello', snapshot) },
  }
}

type Stream = ReturnType<typeof fakeStream>

/** 一条账本事件的线形状（字段逐字对 `OperationEvent`；`seq` 这份判据不读，给个常量即可）。 */
const event = (nodeId: string, runId: string, kind: string, extra: Record<string, unknown> = {}) => ({
  seq: 1,
  runId,
  nodeId,
  actionId: runId.slice(nodeId.length + 1).split('#')[0] ?? '',
  at: 0,
  kind,
  ...extra,
})

/** 账本那三种这份判据要用的帧；参数顺序刻意跟"谁在跑 → 跑到哪"一致。 */
const ledger = (stream: Stream) => ({
  /** `defineNode` 每次调用自动补的那条。 */
  started: (nodeId: string, runId: string) => { stream.frame('started', event(nodeId, runId, 'started')) },
  /** 节点自己报的进度。`total` 省略就是"只有绝对量"（`recycleu` 那种形状）。 */
  progress: (nodeId: string, runId: string, done: number, total?: number) => {
    stream.frame('progress', event(nodeId, runId, 'progress', { progress: total === undefined ? { done } : { done, total } }))
  },
  /** `run.preview({ message })`。 */
  preview: (nodeId: string, runId: string, message: string) => {
    stream.frame('preview', event(nodeId, runId, 'preview', { payload: { message } }))
  },
  finished: (nodeId: string, runId: string) => { stream.frame('finished', event(nodeId, runId, 'finished')) },
})

let runnerCalls: Array<{ nodeId: string; input: unknown }> = []
let stream: Stream

beforeEach(() => {
  runnerCalls = []
  // 真插件先进注册表：两组用例都靠真 Runner 跑 `sleept`，没注册的话 `NodeRegistry.run`
  // 会回一条 `not registered` 的失败（而进度那条断言照样是绿的 —— 那种假绿正是这里要防的）。
  registerSleept()
  /*
   * 回显是**共享单例**，选项只在**第一次**建它时生效，所以这里先建出来并接上假流；
   * 生产代码随后那句 `documentRunProgressFeed()`（不带选项）拿到的就是这一条。
   * `fetchImpl` 也一并堵掉：万一有哪条路退到轮询兜底，它也不该去碰真网络。
   */
  resetDocumentRunProgressFeed()
  stream = fakeStream()
  documentRunProgressFeed({
    createSource: () => stream.source,
    fetchImpl: () => Promise.reject(new Error('这份判据里不该走到轮询兜底')),
    pollMs: 10_000,
  })
})

afterEach(() => {
  cleanup()
  resetDocumentRunProgressFeed()
})

/** 真插件注册进 `nodeRegistry`（`ctx` 用真 `Context`，只替掉不在这份判据口径里的三片宿主服务）。 */
function registerSleept(): void {
  const ctx = new Context()
  ctx.tools = { register: () => undefined } as never
  ctx.subprocess = { spawn: () => { throw new Error('这份判据里 sleept 不该真起子进程') } } as never
  // `register` 回 undefined：cordis 的 `effect` 只认「返回 void 或返回一个可抛弃的东西」，
  // 随手回一个对象会被判成 `Invalid effect` 而把整条 apply 炸掉。
  ctx.commands = { register: () => undefined } as never
  applySleept(ctx, { blockDefaultMinutes: { get: () => 60 } } as never)
  expect(nodeRegistry.has('sleept'), 'sleept 没进 NodeRegistry').toBe(true)
}

/** DSH 设置面的替身：只实现桥真会用到的那三个动词。 */
function fakeSettings(): SettingsFace {
  const rows: Record<string, Record<string, unknown>> = {
    [STATE_SETTINGS_NS]: { [STATE_SETTINGS_FIELD]: {} as Record<string, string> },
  }
  let revision = 1
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

/**
 * 一条内存线：文档桥 × 外壳桥（同 `node-host-wiring.spec.tsx` 的做法）。
 *
 * `hold` 是这份判据的关键：它让外壳那半边的调用**停在半空**，好让判据有时间在"这次运行还没回来"
 * 的时候喂帧 —— 真实世界里长任务就是这个形状（`findz` 扫一整个库），而没被挡住的短调用会在
 * 同一批微任务里就结束，进度帧根本来不及到。
 *
 * shell 侧的 runner 收 `onEvent` 而**不传**（`real.run(nodeId, input)`）：这也是生产形状，
 * 桥上没有那条推送帧，外壳侧的回调本来就没人接。
 */
function wired(hold?: Promise<void>) {
  const real = createLocalRunner(nodeRegistry)
  const runner = {
    async run(nodeId: string, input: unknown) {
      runnerCalls.push({ nodeId, input })
      if (hold !== undefined) await hold
      return await real.run(nodeId, input)
    },
  }
  const docBridge = createDocumentBridge(
    (message) => { queueMicrotask(() => { void shellBridge.receive(message, ORIGIN) }) },
    ORIGIN,
    ['contract', 'state', 'config', 'env', 'runner'],
  )
  const shellBridge = createShellBridge(
    { settings: fakeSettings(), settingsNs: STATE_SETTINGS_NS, runner },
    (message: BridgeMessage) => { queueMicrotask(() => { void docBridge.receive(message, ORIGIN) }) },
    ORIGIN,
  )
  return { docBridge, shellBridge }
}

async function handshake(docBridge: ReturnType<typeof createDocumentBridge>): Promise<void> {
  docBridge.hello('sleept')
  for (let i = 0; i < 500 && docBridge.ready() === null; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
  expect(docBridge.ready(), '桥没握手成功').not.toBeNull()
}

/** 文档本地的组件状态面（`host.state` 归文档自己，不过桥）。 */
function localState() {
  let data: Record<string, unknown> | undefined
  return {
    getData: () => data,
    patchData: (patch: Record<string, unknown>) => { data = { ...(data ?? {}), ...patch } },
  }
}

/** 一份已握手的文档 host + 那一句会一直挂在半空的调用用到的挂点。 */
async function docHost(hold?: Promise<void>) {
  const { docBridge } = wired(hold)
  await handshake(docBridge)
  return { host: createDocumentHost({ bridge: docBridge, state: localState() }), docBridge }
}

const collect = () => {
  const events: NodeRunEvent[] = []
  return { events, onEvent: (event: NodeRunEvent) => { events.push(event) } }
}

describe('文档侧运行进度回显：账本 → onEvent', () => {
  it('把这一次运行的 preview / progress 翻成面板要的 log / progress（百分比由 done/total 算）', async () => {
    const { host } = await docHost()
    const { events, onEvent } = collect()
    const call = host.runner.run('sleept', { action: 'get_stats' }, onEvent)

    stream.connect()
    expect(documentRunProgressFeed().transport(), '假流没被认成连上了').toBe('live')

    const frame = ledger(stream)
    frame.started('sleept', 'sleept/get_stats#1')
    // 「刚开跑」那一格不发：面板在 execute 里已经写过 phase=running / progress=0。
    expect(events, '开跑那一格被转了一次 ⇒ 日志里会多出一行 `[0%] `').toEqual([])

    frame.preview('sleept', 'sleept/get_stats#1', '读取内存占用')
    frame.progress('sleept', 'sleept/get_stats#1', 1, 2)

    expect(events).toEqual([
      { type: 'log', message: '读取内存占用' },
      { type: 'progress', progress: 50, message: '读取内存占用' },
    ])
    expect((await call).success).toBe(true)
  })

  it('别的节点的帧不串过来；账本上先于这次调用的那一趟也不算这一趟', async () => {
    const { host } = await docHost()

    // 先有一次"上一趟"落在账本上（同一个节点）：它必须只成为基线。
    const frame = ledger(stream)
    frame.started('sleept', 'sleept/get_stats#0')
    frame.progress('sleept', 'sleept/get_stats#0', 90, 100)
    frame.finished('sleept', 'sleept/get_stats#0')

    const { events, onEvent } = collect()
    const call = host.runner.run('sleept', { action: 'get_stats' }, onEvent)
    expect(events, '挂上那一刻已有的读数属于调用之前那一趟，转出去就是别人的进度').toEqual([])

    // 另一个节点同刻在跑：它的帧不许落到这条回调上。
    frame.started('findz', 'findz/scan#1')
    frame.progress('findz', 'findz/scan#1', 50, 100)
    expect(events, '别的节点的进度串到这条回调上了').toEqual([])

    // 这一趟自己的帧才转。空文案照转：进度条要动，而"这一格显示什么字"是面板的事。
    frame.progress('sleept', 'sleept/get_stats#1', 3, 4)
    expect(events).toEqual([{ type: 'progress', progress: 75, message: '' }])
    expect((await call).success).toBe(true)
  })

  it('收尾那一格不从这里写：finished 不转（终态由这次调用自己的应答写）', async () => {
    const { host } = await docHost()
    const { events, onEvent } = collect()
    const call = host.runner.run('sleept', { action: 'get_stats' }, onEvent)

    const frame = ledger(stream)
    frame.started('sleept', 'sleept/get_stats#1')
    frame.progress('sleept', 'sleept/get_stats#1', 1, 2)
    const delivered = events.length
    frame.finished('sleept', 'sleept/get_stats#1')

    expect(events.length, 'finished 被转了一次 ⇒ 终态会在同一格上写两遍').toBe(delivered)
    expect((await call).success).toBe(true)
  })

  it('账本只给了 done 没给 total 时不动进度条（不把绝对量当百分数），文案照转', async () => {
    const { host } = await docHost()
    const { events, onEvent } = collect()
    const call = host.runner.run('sleept', { action: 'get_stats' }, onEvent)

    const frame = ledger(stream)
    frame.started('sleept', 'sleept/get_stats#1')
    // `recycleu` 那种形状：`run.progress({ done: event.progress })`，没有 total。
    frame.progress('sleept', 'sleept/get_stats#1', 300)
    frame.preview('sleept', 'sleept/get_stats#1', '已扫 300 个文件')

    expect(events, '把 done 当百分数画了一根假精确的进度条').toEqual([{ type: 'log', message: '已扫 300 个文件' }])
    expect((await call).success).toBe(true)
  })

  it('调用一结束就停掉跟读：之后的帧不再转', async () => {
    const { host } = await docHost()
    const { events, onEvent } = collect()
    const call = host.runner.run('sleept', { action: 'get_stats' }, onEvent)

    const frame = ledger(stream)
    frame.started('sleept', 'sleept/get_stats#1')
    frame.progress('sleept', 'sleept/get_stats#1', 1, 2)
    expect((await call).success).toBe(true)

    const delivered = events.length
    frame.progress('sleept', 'sleept/get_stats#1', 2, 2)
    expect(events.length, '调用结束之后还在转 ⇒ 订阅没退，面板会收到已经过去的那次运行').toBe(delivered)
  })

  it('那条流起不来时不编进度：调用照常返回结果，回调一次都不响', async () => {
    resetDocumentRunProgressFeed()
    documentRunProgressFeed({
      createSource: () => { throw new Error('这份判据里没有 EventSource') },
      fetchImpl: () => Promise.reject(new Error('也没有快照可读')),
      pollMs: 10_000,
    })
    const { host } = await docHost()
    const { events, onEvent } = collect()
    const result = await host.runner.run('sleept', { action: 'get_stats' }, onEvent)
    // 让那次失败的轮询落地（`startPolling` 是先打一发再挂定时器）。
    await new Promise((resolve) => { setTimeout(resolve, 0) })

    expect(events).toEqual([])
    expect(documentRunProgressFeed().transport()).toBe('offline')
    expect(result.success, '流起不来不该把调用一起带走').toBe(true)
    expect(result.message).toBeTruthy()
  })
})

describe('网页面板：进度真的上屏', () => {
  /** 在 store 里真部署一格，并把卡片数据写进去。 */
  function deploy(nodeId: string, data: Record<string, unknown>): string {
    const store = useWorkspaceStore.getState()
    store.deployComponent(nodeId)
    const created = useWorkspaceStore.getState().components.at(-1)
    if (created === undefined) throw new Error('store 没给出部署后的组件')
    useWorkspaceStore.getState().patchComponentData(created.id, data)
    return created.id
  }

  /** 卡片状态读回来（面板写的是 `host.patchData`，落在工作区快照里）。 */
  function cardOf<T>(compId: string): T {
    const component = useWorkspaceStore.getState().components.find((item) => item.id === compId)
    return (component?.data ?? {}) as T
  }

  /** 把真面板挂进树里，host 由生产装配点 `useNodeHostApi` 给。 */
  function Surface({ compId, nodeId, Panel }: { compId: string; nodeId: string; Panel: React.ComponentType<NodeComponentProps> }) {
    const host = useNodeHostApi(compId, nodeId)
    // `createElement` 而不是直接调函数：函数调用会把面板的 hooks 记到 Surface 身上。
    return createElement(Panel, { compId, host })
  }

  it('sleept 点「刷新状态」时，账本上的帧把卡片的 progress / progressText 与日志一路带起来', async () => {
    let release!: () => void
    const hold = new Promise<void>((resolve) => { release = resolve })
    const { docBridge } = wired(hold)
    await handshake(docBridge)
    const compId = deploy('sleept', {})

    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Surface compId={compId} nodeId="sleept" Panel={SleeptComponent} />
      </DocumentBridgeProvider>,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '刷新状态' }, { timeout: 3000 }))

    // 调用已经发出、还停在半空（外壳侧被 hold 挡住）：此刻喂进度帧，模拟一次长运行的中途。
    await waitFor(() => {
      expect(runnerCalls.length, `面板没把调用送到本地 Runner（卡片 phase=${String(cardOf<SleeptCardState>(compId).phase)}）`).toBe(1)
    })
    const frame = ledger(stream)
    frame.started('sleept', 'sleept/get_stats#1')
    frame.preview('sleept', 'sleept/get_stats#1', '读取内存占用')
    frame.progress('sleept', 'sleept/get_stats#1', 1, 2)

    await waitFor(() => {
      expect(cardOf<SleeptCardState>(compId).progress, '账本上的进度没走到卡片上').toBe(50)
    })
    expect(cardOf<SleeptCardState>(compId).progressText).toBe('读取内存占用')
    expect(cardOf<SleeptCardState>(compId).logs).toContain('读取内存占用')

    release()
    await waitFor(() => {
      expect(cardOf<SleeptCardState>(compId).phase, `卡片没走到 completed（logs=${JSON.stringify(cardOf<SleeptCardState>(compId).logs)}）`).toBe('completed')
    })
    // 终态那一格由应答自己写（`progress: 100`），不是账本那条 finished 写出来的。
    expect(cardOf<SleeptCardState>(compId).progress).toBe(100)
  })
})
