/**
 * 清单没写 `inputBindings` 时，注册与调用都不许炸。
 *
 * 出处（2026-10-09 实测）：kisaki 第一次装进 3199 的 profile 时，宿主只留下一句
 * `xaihi-kisaki: failed to import`，真原因在 `defineNode` 的预检循环里
 * ——`definition.inputBindings is not iterable`。类型上这一格是必填
 * （`node.ts:197`），但校验器是把原值直接交回去的（`node.ts:405` 的
 * `value: raw as unknown as NodeDefinition`），所以"清单里没写"这条路一直是类型谎言。
 *
 * @module xaihi-sdk/tests/manifest-without-input-bindings
 */

import { describe, expect, it } from 'vitest'
import { bindInputs, defineNode, type NodeToolContext } from '../src/define-node.ts'
import { NodeRegistry } from '../src/node-registry.ts'
import type { NodeDefinition } from '../src/node.ts'

/** 与 `define-node.spec.ts` 的夹具同一形状，但**整格不给** `inputBindings`（kisaki 的清单今天就是这样）。 */
const withoutBindings = {
  definitionVersion: 1,
  nodeId: 'nobind',
  title: { zh: '无绑定夹具', en: 'No-binding fixture' },
  description: { zh: '契约夹具', en: 'Contract fixture' },
  actions: [{ id: 'scan', label: { zh: '扫描', en: 'Scan' } }],
  fields: [
    {
      id: 'tool',
      kind: 'select',
      isActionSelector: true,
      label: { zh: '工具', en: 'Tool' },
      options: [{ value: 'empty-files', label: { zh: '空文件', en: 'Empty files' } }],
    },
  ],
  groups: [{ id: 'main', fieldIds: ['tool'] }],
} as unknown as NodeDefinition

function fakeContext(): { ctx: NodeToolContext; registered: Array<Record<string, unknown>> } {
  const registered: Array<Record<string, unknown>> = []
  const registry = new NodeRegistry()
  return {
    registered,
    ctx: {
      tools: { register: (tool) => { registered.push(tool as unknown as Record<string, unknown>); return () => {} } },
      on: () => () => {},
      inject: (_deps, callback) => {
        const dispose = callback({ get: () => registry })
        return typeof dispose === 'function' ? (dispose as () => void) : () => {}
      },
      get: () => registry,
    },
  }
}

describe('清单缺 inputBindings', () => {
  it('bindInputs 交出空槽位表，而不是把整次调用打成异常', () => {
    expect(bindInputs(withoutBindings, { tool: 'empty-files' })).toEqual({})
  })

  it('defineNode 照样注册出工具，handle.run 把原始 args 原样交给 handler', async () => {
    const { ctx, registered } = fakeContext()
    const seen: Array<{ args: Record<string, unknown>; inputs: Record<string, unknown> }> = []
    const node = defineNode(ctx, {
      definition: withoutBindings,
      handlers: {
        scan: async ({ args, inputs }) => {
          seen.push({ args, inputs })
          return 'ok'
        },
      },
    })
    expect(registered.map((tool) => tool['name'])).toEqual(['nobind_scan'])
    const result = await node.run('scan', { tool: 'empty-files' })
    expect(result.success).toBe(true)
    expect(result.message).toBe('ok')
    // 缺席 ⇒ 没有额外槽位，`inputs` 就等于原始 args 本身（面板正是靠这条送整份输入的）。
    expect(seen[0]?.inputs).toEqual({ tool: 'empty-files' })
    expect(seen[0]?.args).toEqual({ tool: 'empty-files' })
  })

  it('阳性对照：同一份夹具补上绑定后，槽位真的被绑出来（不许把缺席写成"永远返回空表"）', () => {
    const withBindings = {
      ...withoutBindings,
      inputBindings: [{ fieldId: 'tool', slot: 'selectedTool', transform: 'trim' }],
    } as unknown as NodeDefinition
    expect(bindInputs(withBindings, { tool: '  empty-files ' })).toEqual({ selectedTool: 'empty-files' })
  })
})
