import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createLocalRunner, nodeRegistry } from '@hibernalglow/xaihi-sdk'
import { createShellBridge, createDocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentHost } from '../../ui-host/src/client/document-host.ts'
import { toNodeHostApi } from '../../ui-host/src/client/node-host-bridge.ts'
import { apply as applyLinedup } from '../../../plugins/linedup/src/index.ts'
import { apply as applySleept } from '../../../plugins/sleept/src/index.ts'

describe('Local Runner 端到端集成测试（纯本地 Node.js 插件通道）', () => {
  it('linedup 节点可直接执行，无需 Agent，返回结构化 data 结果', async () => {
    const ctx = new Context()
    // 模拟最小注入环境
    ctx.tools = { register: () => {} } as never
    applyLinedup(ctx, { label: { get: () => 'linedup' } as never })

    const runner = createLocalRunner(nodeRegistry)
    const result = await runner.run('linedup', {
      sourceLines: ['apple', 'banana', 'orange', 'banana'],
      filterLines: ['banana'],
      caseSensitive: true,
      sort: true,
    }) as {
      success: boolean
      message: string
      data: {
        keptCount: number
        removedCount: number
        // 载荷形状就是 `core.ts` 的 `LinedupFilterResult`：面板
        //（`ui-host/src/nodes/linedup/{model.ts:52,ResultPanels.tsx:54,65}`）与命令行
        //（`plugins/linedup/src/cli.ts:182,190`）读的都是这两个名字。
        filteredLines: string[]
        removedLines: string[]
      }
    }

    expect(result.success).toBe(true)
    expect(result.message).toContain('kept 2')
    expect(result.data).toBeDefined()
    expect(result.data.keptCount).toBe(2)
    expect(result.data.removedCount).toBe(1)
    expect(result.data.filteredLines).toEqual(['apple', 'orange'])
    expect(result.data.removedLines).toEqual(['banana'])
  })

  it('sleept 节点可通过 actions.run/runner.run 触发 onEvent 进度与事件', async () => {
    const ctx = new Context()
    ctx.tools = { register: () => {} } as never
    ctx.subprocess = { spawn: () => {} } as never
    ctx.commands = { register: () => {} } as never

    applySleept(ctx, { blockDefaultMinutes: { get: () => 60 } as never })

    const runner = createLocalRunner(nodeRegistry)
    const events: unknown[] = []
    const result = await runner.run('sleept', {
      action: 'countdown',
      seconds: 1,
      dryrun: true,
    }, (event) => {
      events.push(event)
    }) as {
      success: boolean
      message: string
      data: unknown
    }

    expect(result.success).toBe(true)
    expect(events.length).toBeGreaterThan(0)
    expect((events[0] as { type: string }).type).toBe('progress')
  })

  it('前端 UI Bridge 穿透：通过 ShellBridge 与 LocalRunner 联动，UI 面板 actions.run 与 runner.run 完整往返', async () => {
    const ctx = new Context()
    ctx.tools = { register: () => {} } as never
    applyLinedup(ctx, { label: { get: () => 'linedup' } as never })

    const runner = createLocalRunner(nodeRegistry)
    const [shellSend, docReceive] = [vi.fn(), vi.fn()]

    // 建立外壳与文档两端
    const shellBridge = createShellBridge(
      { runner },
      (msg) => {
        // 模拟 postMessage 同步/异步投递
        void docBridge.receive(msg, 'test-origin')
      },
      'test-origin',
    )

    const docBridge = createDocumentBridge(
      (msg) => {
        void shellBridge.receive(msg, 'test-origin')
      },
      'test-origin',
      ['runner', 'contract', 'state', 'env'],
    )

    // 握手
    docBridge.hello('xaihi-linedup')
    expect(docBridge.ready()).not.toBeNull()
    expect(docBridge.ready()?.granted).toContain('runner')

    // 模拟文档侧 host 与 node-host-bridge 折叠
    const docHost = createDocumentHost({
      bridge: docBridge,
      state: {
        getData: () => ({}),
        patchData: () => {},
        replaceData: () => {},
      },
    })
    const uiHostApi = toNodeHostApi(docHost)

    // 通过 uiHostApi.actions.run 触发（同 sleept/linedup 前端组件调用方式）
    const actionResult = await uiHostApi.actions?.run('linedup', {
      sourceLines: ['one', 'two', 'three'],
      filterLines: ['two'],
      caseSensitive: true,
      sort: true,
    }) as {
      success: boolean
      data: { keptCount: number; removedCount: number; filteredLines: string[]; removedLines: string[] }
    }

    expect(actionResult.success).toBe(true)
    expect(actionResult.data.keptCount).toBe(2)
    expect(actionResult.data.removedCount).toBe(1)
    expect(actionResult.data.filteredLines).toEqual(['one', 'three'])
    expect(actionResult.data.removedLines).toEqual(['two'])

    // 通过 uiHostApi.runner.run 触发（同 findz 前端组件调用方式）
    const runnerResult = await uiHostApi.runner.run('linedup', {
      sourceLines: ['alpha', 'beta'],
      filterLines: ['alpha'],
      caseSensitive: true,
      sort: false,
    }) as {
      success: boolean
      data: { keptCount: number; removedCount: number }
    }

    expect(runnerResult.success).toBe(true)
    expect(runnerResult.data.keptCount).toBe(1)
    expect(runnerResult.data.removedCount).toBe(1)
  })

  it('sleept 节点执行 get_stats，正确返回 UI 所需的指标结构', async () => {
    const ctx = new Context()
    ctx.tools = { register: () => {} } as never
    ctx.subprocess = { spawn: () => {} } as never
    ctx.commands = { register: () => {} } as never

    applySleept(ctx, { blockDefaultMinutes: { get: () => 60 } as never })

    const runner = createLocalRunner(nodeRegistry)
    const result = await runner.run('sleept', {
      action: 'get_stats',
    }) as {
      success: boolean
      data: { currentCpu: number; currentUpload: number; currentDownload: number; timerStatus: string }
    }

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(typeof result.data.currentCpu).toBe('number')
    expect(result.data.timerStatus).toBe('idle')
  })

  it('findz 节点的输入转换器成功解构前端 UI 传递的嵌套 query 与 rules 结构', async () => {
    const { toFindzInput } = await import('../../../plugins/findz/src/index.ts')

    // 模拟前端 findz/Component.tsx invoke 传过来的参数形状
    const uiInput = {
      action: 'query_archives',
      libraryId: 'my-lib',
      text: 'search-keyword',
      pathPrefix: 'sub/dir',
      query: {
        rules: { type: 'group', op: 'and', children: [] },
        sortBy: 'archiveSize',
        sortDesc: true,
        page: { cursor: 'cursor-123', limit: 200 },
      },
    }

    const converted = toFindzInput('query_archives', uiInput, '/tmp/findz-indices')
    expect(converted.action).toBe('query_archives')
    expect(converted.libraryId).toBe('my-lib')
    expect(converted.text).toBe('search-keyword')
    expect(converted.pathPrefix).toBe('sub/dir')
    expect(converted.query?.sortBy).toBe('archiveSize')
    expect(converted.query?.sortDesc).toBe(true)
    expect(converted.query?.page?.cursor).toBe('cursor-123')
    expect(converted.query?.page?.limit).toBe(200)

    // 同样验证 treemap 的 rules 保留
    const treemapInput = {
      action: 'treemap',
      libraryId: 'my-lib',
      areaBy: 'compressedSize',
      query: {
        rules: { type: 'rule', field: 'format', value: 'zip' },
        page: { limit: 50 },
      },
    }
    const treemapConverted = toFindzInput('treemap', treemapInput, '/tmp/findz-indices')
    expect(treemapConverted.action).toBe('treemap')
    expect(treemapConverted.areaBy).toBe('compressedSize')
    expect(treemapConverted.query?.rules).toEqual({ type: 'rule', field: 'format', value: 'zip' })
    expect(treemapConverted.query?.page?.limit).toBe(50)
  })
})
