import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createLocalRunner, nodeRegistry } from '@hibernalglow/xaihi-sdk'
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
        kept: string[]
        removed: string[]
      }
    }

    expect(result.success).toBe(true)
    expect(result.message).toContain('kept 2')
    expect(result.data).toBeDefined()
    expect(result.data.keptCount).toBe(2)
    expect(result.data.removedCount).toBe(1)
    expect(result.data.kept).toEqual(['apple', 'orange'])
    expect(result.data.removed).toEqual(['banana'])
  })

  it('sleept 节点可执行 status 与 get_stats，返回 UI 期望的指标数据', async () => {
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
      message: string
      data: {
        currentCpu: number
        currentUpload: number
        currentDownload: number
        timerStatus: string
      }
    }

    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(typeof result.data.currentCpu).toBe('number')
    expect(result.data.timerStatus).toBe('idle')
  })
})
