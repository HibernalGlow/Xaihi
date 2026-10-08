// @vitest-environment happy-dom
/**
 * 网页 GUI 面 → 本地 Runner（`NodeRegistry`）→ 结果视图渲染：**端到端**接线判据（ADR-0020）。
 *
 * 与仓里已有的两份判据的分工：
 * - `packages/core/tests/local-runner-integration.spec.ts` 量的是**宿主那半边**
 *   （插件 `apply` → `nodeRegistry` → `createLocalRunner`），面板一行都不参与。
 * - `tests/node-host-wiring.spec.tsx` 量的是**折叠与接线**（哪几片走桥），里面的 runner 是
 *   `refused` 的 —— 那正是 ADR-0020 废掉的状态。
 *
 * 这一份补的是中间那条**整链**：真面板组件（`src/nodes/<id>/Component.tsx`）→ 生产装配点
 * `useNodeHostApi` → 生产桥两侧（`createDocumentBridge` × `createShellBridge`）→
 * 真插件 `apply` 注册的 `nodeRegistry` → `createLocalRunner`。三段各自都绿而整链红，
 * 是本仓最常见的形状（"面板点了没反应"），所以判据必须落在整链上。
 *
 * 桥两侧与 Runner 都是**生产代码**，只有最底下那两片是假的：
 * - DSH 的设置面（`settings`）：跨桥的 `state.*` / `config.*` 需要它，而它不是本判据的对象；
 * - 工作区快照的落点：`host.state` 归文档自己，走真的 `useWorkspaceStore`，不是替身。
 *
 * 阳性对照在最后一条：把 shell 侧的 runner 抽掉，面板必须停在 `error` 且一行结果都不许出现
 * （ADR-0020 明令禁止回落成"浏览器里自己算一份"，同 ADR-0074 §5 那条）。
 *
 * @module xaihi-ui/tests/local-runner-e2e
 */

import { createElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  STATE_SETTINGS_FIELD,
  STATE_SETTINGS_NS,
  createDocumentBridge,
  createShellBridge,
  type BridgeMessage,
  type SettingsFace,
} from '@hibernalglow/xaihi-sdk/bridge'
import { createLocalRunner, nodeRegistry } from '@hibernalglow/xaihi-sdk'
import i18n, { initI18n } from '@/i18n'
import { DocumentBridgeProvider } from '@/document/bridge-context'
import { useNodeHostApi } from '@/components/modules/hostApi'
import { useWorkspaceStore } from '@/store/workspaceStore'
import type { NodeComponentProps } from '@xiranite/contract'
import { Component as LinedupComponent } from '@/nodes/linedup/Component'
import type { LinedupCardState } from '@/nodes/linedup/types'
import { Component as SleeptComponent } from '@/nodes/sleept/Component'
import type { SleeptCardState } from '@/nodes/sleept/types'
import { Component as FindzComponent } from '@/nodes/findz/Component'
import { apply as applyLinedup } from '../../../plugins/linedup/src/index.ts'
import { apply as applySleept } from '../../../plugins/sleept/src/index.ts'

await initI18n('zh')
await i18n.changeLanguage('zh')

const ORIGIN = 'dsh-app://app'
const NODE = 'xaihi-linedup'

/**
 * 面板的版面档位在 happy-dom 里量不出容器尺寸（ResizeObserver 不给值 ⇒ 一律判成 `collapsed`），
 * 而 `collapsed` 那档**不渲染结果页签**。所以这里按 `Component.host.test.tsx` 同一条做法把
 * 尺寸注入进去，量的是"结果有没有上屏"，不是"容器量得准不准"（后者有它自己那份判据）。
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

/** 面板发出去的那一次调用，照实记下来：判据要能区分「面板发出了」与「Runner 被调到」。 */
let runnerCalls: Array<{ nodeId: string; input: unknown }> = []
let runnerEvents: unknown[] = []

beforeEach(() => {
  runnerCalls = []
  runnerEvents = []
})

afterEach(() => {
  cleanup()
})

/**
 * 真插件注册进 `nodeRegistry`。
 *
 * `ctx` 用真 `Context`（`@deepseek-ai/cordis` 是 ui-host 的依赖），只把三片宿主服务替掉：
 * `tools` / `subprocess` / `commands`。它们不是这份判据的对象，而 `effect` / `on` / `get`
 * 由 Context 自己提供，不手搓 —— 手搓一个"长得像 Context 的对象"会让"插件到底调了哪些宿主面"
 * 这件事静默漂移（sleept 就在 apply 期调了 `ctx.effect`，替身缺一条就整条 apply 炸）。
 */
function registerPlugins(): void {
  const registered: unknown[] = []
  const ctx = new Context()
  ctx.tools = { register: (definition: unknown) => { registered.push(definition); return definition } } as never
  ctx.subprocess = { spawn: () => { throw new Error('这份判据里 sleept 不该真起子进程') } } as never
  // `register` 回 undefined：cordis 的 `effect` 只认「返回 void 或返回一个可抛弃的东西」，
  // 随手回一个对象会被判成 `Invalid effect` 而把整条 apply 炸掉（同 `packages/core` 那份集成测试的写法）。
  ctx.commands = { register: () => undefined } as never
  applyLinedup(ctx, { label: { get: () => 'linedup' } } as never)
  applySleept(ctx, { blockDefaultMinutes: { get: () => 60 } } as never)
  nodeRegistry.register({
    nodeId: 'findz',
    definition: { nodeId: 'findz', title: { zh: '归档检索', en: 'Findz' }, description: { zh: '', en: '' }, actions: [], fields: [], inputBindings: [] } as never,
    handlers: {},
    invoke: async () => '',
    run: async (actionId) => {
      if (actionId === 'open_library') {
        return {
          success: true,
          message: 'library opened',
          data: {
            library: { libraryId: 'lib-1', root: '/test/books', archiveCount: 2, memberCount: 10, watcherHealth: 'healthy' },
          },
        }
      }
      if (actionId === 'query_archives') {
        return {
          success: true,
          message: 'query ok',
          data: {
            archives: {
              items: [
                { id: 1, relativePath: 'vol1.zip', size: 1024, memberCount: 5, imageMemberCount: 5 },
                { id: 2, relativePath: 'vol2.cbz', size: 2048, memberCount: 8, imageMemberCount: 8 },
              ],
              total: 2,
            },
          },
        }
      }
      if (actionId === 'treemap') {
        return {
          success: true,
          message: 'treemap ok',
          data: {
            treemap: { name: 'root', value: 3072, children: [] },
          },
        }
      }
      return { success: true, message: 'ok' }
    },
  })
  expect(registered.length, '插件没往 ctx.tools 注册任何动作 ⇒ 这份装配没跑起来').toBeGreaterThan(0)
  expect(nodeRegistry.has('linedup'), 'linedup 没进 NodeRegistry').toBe(true)
  expect(nodeRegistry.has('sleept'), 'sleept 没进 NodeRegistry').toBe(true)
  expect(nodeRegistry.has('findz'), 'findz 没进 NodeRegistry').toBe(true)
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

/** 一条内存线：两侧各自在微任务里喂给对方（同 `node-host-wiring.spec.tsx` 的做法）。 */
function wired(withRunner: boolean) {
  const real = createLocalRunner(nodeRegistry)
  const runner = {
    async run(nodeId: string, input: unknown, onEvent?: (event: unknown) => void) {
      runnerCalls.push({ nodeId, input })
      return await real.run(nodeId, input, (event) => {
        runnerEvents.push(event)
        onEvent?.(event)
      })
    },
  }
  const docBridge = createDocumentBridge(
    (message) => { queueMicrotask(() => { void shellBridge.receive(message, ORIGIN) }) },
    ORIGIN,
    ['contract', 'state', 'config', 'env', 'runner'],
  )
  const shellBridge = createShellBridge(
    {
      settings: fakeSettings(),
      settingsNs: STATE_SETTINGS_NS,
      ...(withRunner ? { runner } : {}),
    },
    (message: BridgeMessage) => { queueMicrotask(() => { void docBridge.receive(message, ORIGIN) }) },
    ORIGIN,
  )
  return { docBridge, shellBridge }
}

async function handshake(docBridge: ReturnType<typeof createDocumentBridge>): Promise<void> {
  docBridge.hello(NODE)
  for (let i = 0; i < 500 && docBridge.ready() === null; i += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
  expect(docBridge.ready(), '桥没握手成功').not.toBeNull()
}

/** 在 store 里真部署一格，并把卡片数据写进去。 */
function deploy(nodeId: string, data: Record<string, unknown>): string {
  const store = useWorkspaceStore.getState()
  store.deployComponent(nodeId)
  const created = useWorkspaceStore.getState().components.at(-1)
  if (created === undefined) throw new Error('store 没给出部署后的组件')
  useWorkspaceStore.getState().patchComponentData(created.id, data)
  return created.id
}

/** 把真面板挂进树里，host 由生产装配点 `useNodeHostApi` 给。 */
function Surface({ compId, nodeId, Panel }: { compId: string; nodeId: string; Panel: React.ComponentType<NodeComponentProps> }) {
  const host = useNodeHostApi(compId, nodeId)
  // `createElement` 而不是直接调函数：函数调用会把面板的 hooks 记到 Surface 身上
  // （`node-mount.tsx:420-426` 的同一条教训，那边的症状是 React #300）。
  return createElement(Panel, { compId, host })
}

/** 卡片状态读回来（面板写的是 `host.patchData`，落在工作区快照里）。 */
function cardOf<T>(compId: string): T {
  const component = useWorkspaceStore.getState().components.find((item) => item.id === compId)
  return (component?.data ?? {}) as T
}

describe('网页面板 → 本地 Runner → 结果视图：端到端', () => {
  beforeEach(() => {
    registerPlugins()
  })

  it('linedup：点「运行过滤」把原生文本送进本地 Runner，并把返回的结构化结果渲染上屏', async () => {
    const { docBridge } = wired(true)
    await handshake(docBridge)
    const compId = deploy('linedup', {
      sourceText: 'gamma\nbeta-one\nalpha\nbeta-two',
      filterText: 'beta',
    })

    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Surface compId={compId} nodeId="linedup" Panel={LinedupComponent} />
      </DocumentBridgeProvider>,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '运行过滤' }))

    await waitFor(() => {
      expect(runnerCalls.length, `面板没把调用送到本地 Runner（卡片 phase=${String(cardOf<LinedupCardState>(compId).phase)}）`).toBe(1)
    })
    // 发出去的是**未裁剪的行数组**（`./model.ts`），不是原始文本：归一化只有 Runner 那一份。
    expect(runnerCalls[0]?.nodeId).toBe('linedup')
    expect(runnerCalls[0]?.input).toMatchObject({
      sourceLines: ['gamma', 'beta-one', 'alpha', 'beta-two'],
      filterLines: ['beta'],
    })

    await waitFor(() => {
      expect(cardOf<LinedupCardState>(compId).phase, `卡片没走到 completed（logs=${JSON.stringify(cardOf<LinedupCardState>(compId).logs)}）`).toBe('completed')
    })
    const result = cardOf<LinedupCardState>(compId).result
    expect(result?.keptCount).toBe(2)
    expect(result?.removedCount).toBe(2)

    // 结果视图真的上屏了：**两列**都要看得见（这一条抓的正是"计数对了、列表是空的"那种假绿）。
    await user.click(await screen.findByRole('tab', { name: /移除/ }))
    expect(screen.getByText('beta-one')).toBeTruthy()
    expect(screen.getByText('beta-two')).toBeTruthy()
    await user.click(await screen.findByRole('tab', { name: /预览/ }))
    expect(screen.getByText('gamma')).toBeTruthy()
    expect(screen.getByText('alpha')).toBeTruthy()
  })

  it('sleept：点「刷新」把 action=get_stats 送进本地 Runner，指标与终态文本一起回填', async () => {
    const { docBridge } = wired(true)
    await handshake(docBridge)
    const compId = deploy('sleept', {})

    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Surface compId={compId} nodeId="sleept" Panel={SleeptComponent} />
      </DocumentBridgeProvider>,
    )

    const user = userEvent.setup()
    const button = await screen.findByRole('button', { name: '刷新状态' }, { timeout: 3000 })
    await user.click(button)

    await waitFor(() => {
      expect(runnerCalls.length, `面板没把调用送到本地 Runner（卡片 phase=${String(cardOf<SleeptCardState>(compId).phase)}）`).toBe(1)
    })
    expect(runnerCalls[0]?.nodeId).toBe('sleept')
    expect(runnerCalls[0]?.input).toMatchObject({ action: 'get_stats' })

    await waitFor(() => {
      expect(cardOf<SleeptCardState>(compId).phase, `卡片没走到 completed（logs=${JSON.stringify(cardOf<SleeptCardState>(compId).logs)}）`).toBe('completed')
    })
    const stats = cardOf<SleeptCardState>(compId).stats
    expect(typeof stats?.cpu, 'Runner 回的结构化 data 没被面板投影成卡片统计').toBe('number')
    expect(cardOf<SleeptCardState>(compId).result).not.toBeNull()
  })

  it('findz：组件调用 host.runner.run(open_library/query_archives/treemap) 结果完整上屏', async () => {
    const { docBridge } = wired(true)
    await handshake(docBridge)
    const compId = deploy('findz', {
      libraryRoot: '/test/books',
    })

    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Surface compId={compId} nodeId="findz" Panel={FindzComponent} />
      </DocumentBridgeProvider>,
    )

    const user = userEvent.setup()
    // 点击打开库按钮
    const openBtn = await screen.findByRole('button', { name: /打开库|Open library/i })
    await user.click(openBtn)

    await waitFor(() => {
      expect(runnerCalls.some((c) => c.nodeId === 'findz' && (c.input as { action?: string })?.action === 'open_library')).toBe(true)
    })

    await waitFor(() => {
      expect(runnerCalls.some((c) => c.nodeId === 'findz' && (c.input as { action?: string })?.action === 'query_archives')).toBe(true)
    })

    // 验证归档结果真正上屏渲染在 ArchiveTable 中
    expect(await screen.findByText('vol1.zip')).toBeTruthy()
    expect(await screen.findByText('vol2.cbz')).toBeTruthy()
  })

  it('阳性对照：外壳那一侧抽掉 runner 时，面板必须停在 error，且一行结果都不许出现', async () => {
    const { docBridge } = wired(false)
    await handshake(docBridge)
    const compId = deploy('linedup', {
      sourceText: 'gamma\nbeta-one\nalpha\nbeta-two',
      filterText: 'beta',
    })

    render(
      <DocumentBridgeProvider bridge={docBridge}>
        <Surface compId={compId} nodeId="linedup" Panel={LinedupComponent} />
      </DocumentBridgeProvider>,
    )

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '运行过滤' }))

    await waitFor(() => {
      expect(cardOf<LinedupCardState>(compId).phase, 'runner 没接线时卡片必须立刻显示错误').toBe('error')
    })
    expect(runnerCalls).toHaveLength(0)
    expect(cardOf<LinedupCardState>(compId).result).toBeNull()
    // 出现任何一行就说明面板在浏览器里自己算了一份（ADR-0020 禁止的那条回落）。
    expect(screen.queryByText('beta-one')).toBeNull()
    expect(screen.queryByText('gamma')).toBeNull()
  })
})
