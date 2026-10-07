import { describe, expect, it } from 'vitest'
import { defineNode } from '../src/define-node.ts'
import { createLocalRunner, NodeRegistry, nodeRegistry } from '../src/node-registry.ts'

describe('NodeRegistry 本地执行通道', () => {
  it('支持注册、名称规范化检索与注销', () => {
    const registry = new NodeRegistry()
    const dummyNode = {
      nodeId: 'dummy-tool',
      definition: {
        definitionVersion: 1,
        nodeId: 'dummy-tool',
        title: { en: 'Dummy', zh: '测试' },
        description: { en: 'Desc', zh: '描述' },
        actions: [{ id: 'run' }],
        fields: [],
        inputBindings: [],
      },
      handlers: {
        run: async () => 'ok',
      },
      invoke: async () => 'ok',
      run: async () => ({ success: true, message: 'ok' }),
    }

    const unregister = registry.register(dummyNode as never)
    expect(registry.get('dummy-tool')).toBe(dummyNode)
    expect(registry.get('xaihi-dummy-tool')).toBe(dummyNode)
    expect(registry.get('@hibernalglow/xaihi-dummy-tool')).toBe(dummyNode)
    expect(registry.list()).toContain(dummyNode)

    unregister()
    expect(registry.get('dummy-tool')).toBeUndefined()
  })

  it('通过 defineNode 自动注册，并通过 run 捕获 resultView 数据', async () => {
    const ctx = {
      tools: { register() {} },
      on() {},
    }
    const def = {
      definitionVersion: 1,
      nodeId: 'calc-sample',
      title: { en: 'Calc', zh: '计算' },
      description: { en: 'Calc desc', zh: '计算描述' },
      actions: [{ id: 'add', label: { en: 'Add', zh: '相加' } }],
      fields: [
        { id: 'x', kind: 'number', label: { en: 'X', zh: 'X' } },
        { id: 'y', kind: 'number', label: { en: 'Y', zh: 'Y' } },
      ],
      inputBindings: [
        { fieldId: 'x', slot: 'x', transform: 'asInteger' },
        { fieldId: 'y', slot: 'y', transform: 'asInteger' },
      ],
    }

    const handle = defineNode(ctx as never, {
      definition: def,
      handlers: {
        async add({ inputs, run }) {
          const sum = Number(inputs.x ?? 0) + Number(inputs.y ?? 0)
          run.resultView({ sum, numbers: [inputs.x, inputs.y] })
          return `sum is ${sum}`
        },
      },
    })

    // 测试 handle.run
    const directResult = await handle.run('add', { x: 10, y: 20 })
    expect(directResult.success).toBe(true)
    expect(directResult.message).toBe('sum is 30')
    expect(directResult.data).toEqual({ sum: 30, numbers: [10, 20] })

    // 测试通过 nodeRegistry 全局执行
    const runner = createLocalRunner(nodeRegistry)
    const result = await runner.run('calc-sample', { action: 'add', x: 5, y: 7 }) as {
      success: boolean
      message: string
      data: unknown
    }
    expect(result.success).toBe(true)
    expect(result.message).toBe('sum is 12')
    expect(result.data).toEqual({ sum: 12, numbers: [5, 7] })
  })

  it('当节点不存在或报错时如实返回失败原因，并保留已捕获的 data', async () => {
    const runner = createLocalRunner()
    const notFound = await runner.run('non-existent-node', {}) as { success: boolean; message: string }
    expect(notFound.success).toBe(false)
    expect(notFound.message).toContain('not registered')

    const ctx = { tools: { register() {} }, on() {} }
    const def = {
      definitionVersion: 1,
      nodeId: 'failing-sample',
      title: { en: 'Failing', zh: '失败测试' },
      description: { en: 'Desc', zh: '描述' },
      actions: [{ id: 'fail', label: { en: 'Fail', zh: '失败' } }],
      fields: [],
      inputBindings: [],
    }
    defineNode(ctx as never, {
      definition: def,
      handlers: {
        async fail({ run }) {
          run.resultView({ partialErrors: ['something wrong'] })
          throw new Error('boom')
        },
      },
    })

    const failed = await runner.run('failing-sample', { action: 'fail' }) as {
      success: boolean
      message: string
      data: unknown
    }
    expect(failed.success).toBe(false)
    expect(failed.message).toBe('boom')
    expect(failed.data).toEqual({ partialErrors: ['something wrong'] })
  })

  it('支持向 onEvent 回调实时推送 progress 与 preview 日志', async () => {
    const ctx = { tools: { register() {} }, on() {} }
    const def = {
      definitionVersion: 1,
      nodeId: 'progress-sample',
      title: { en: 'Progress', zh: '进度测试' },
      description: { en: 'Desc', zh: '描述' },
      actions: [{ id: 'work', label: { en: 'Work', zh: '执行' } }],
      fields: [],
      inputBindings: [],
    }

    defineNode(ctx as never, {
      definition: def,
      handlers: {
        async work({ run }) {
          run.progress({ done: 5, total: 10 })
          run.preview({ message: 'working on step 1' })
          return 'done'
        },
      },
    })

    const events: unknown[] = []
    const runner = createLocalRunner()
    const result = await runner.run('progress-sample', { action: 'work' }, (event) => {
      events.push(event)
    }) as { success: boolean }

    expect(result.success).toBe(true)
    expect(events).toEqual([
      { type: 'progress', progress: 50, done: 5, total: 10 },
      { type: 'log', message: 'working on step 1' },
    ])
  })
})
