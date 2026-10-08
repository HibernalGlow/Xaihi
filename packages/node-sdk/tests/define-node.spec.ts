/**
 * `defineNode` 与条件求值的证伪测试。
 *
 * 三条尺各自带阳性对照：可见性过滤（关掉就会多出参数）、危险闸门动作集（拿别的动作
 * 必须不 ask）、pre-execute 监听的作用域（不相干工具必须原样 next）。
 *
 * @module xaihi-sdk/tests/define-node
 */

import { describe, expect, it } from 'vitest'
import {
  bindInputs,
  dangerFor,
  defineNode,
  parametersFor,
  transformValue,
  type ExecInfo,
  type NodeToolContext,
  type PreDecision,
} from '../src/define-node.ts'
import { matchCondition } from '../src/conditions.ts'
import type { NodeDefinition } from '../src/node.ts'

const definition = {
  definitionVersion: 1,
  nodeId: 'demo',
  title: { zh: '演示节点', en: 'Demo node' },
  description: { zh: '契约夹具', en: 'Contract fixture' },
  actions: [
    { id: 'dedup', label: { zh: '去重', en: 'Dedup' } },
    { id: 'shrink', label: { zh: '缩减', en: 'Shrink' }, description: { zh: '按数量保留', en: 'Keep a count' } },
  ],
  fields: [
    { id: 'action', kind: 'select', isActionSelector: true, label: { zh: '动作', en: 'Action' }, options: [
      { value: 'dedup', label: { zh: '去重', en: 'Dedup' } },
      { value: 'shrink', label: { zh: '缩减', en: 'Shrink' } },
    ] },
    { id: 'paths', kind: 'path-list', label: { zh: '路径', en: 'Paths' }, rules: [{ rule: { type: 'required' } }] },
    { id: 'count', kind: 'number', label: { zh: '数量', en: 'Count' }, visible: {
      type: 'single',
      predicate: { test: { type: 'actionIs', allowed: ['shrink'] }, negated: false },
    } },
    { id: 'force', kind: 'boolean', label: { zh: '强制', en: 'Force' } },
  ],
  groups: [{ id: 'main', fieldIds: ['action', 'paths', 'count', 'force'] }],
  inputBindings: [
    { fieldId: 'paths', slot: 'paths', transform: 'lines' },
    { fieldId: 'count', slot: 'keep', transform: 'asInteger' },
    { fieldId: 'force', slot: 'force' },
  ],
  danger: { type: 'actionIn', dangerous: ['shrink'] },
  reportsProgress: false,
  publishesOutputPath: false,
} as unknown as NodeDefinition

function fakeContext(): { ctx: NodeToolContext; registered: Array<Record<string, unknown>>; listeners: Array<(exec: ExecInfo, next: () => Promise<PreDecision>) => Promise<PreDecision>>; effects: Array<() => void> } {
  const registered: Array<Record<string, unknown>> = []
  const listeners: Array<(exec: ExecInfo, next: () => Promise<PreDecision>) => Promise<PreDecision>> = []
  const effects: Array<() => void> = []
  return {
    registered,
    listeners,
    effects,
    ctx: {
      tools: { register: (tool) => { registered.push(tool as unknown as Record<string, unknown>); return () => {} } },
      on: (_event, listener) => { listeners.push(listener); return () => {} },
      // cordis 的 `ctx.effect`：回调立即跑，返回的函数被收作注销器。
      effect: (callback: () => unknown) => { const dispose = callback(); if (typeof dispose === 'function') effects.push(dispose as () => void); return () => {} },
    },
  }
}

describe('参数表与可见性', () => {
  it('动作选择器不进参数表', () => {
    expect(Object.keys(parametersFor(definition, 'dedup'))).not.toContain('action')
  })

  it('只收该动作可见的字段', () => {
    expect(Object.keys(parametersFor(definition, 'dedup')).sort()).toEqual(['force', 'paths'])
    expect(Object.keys(parametersFor(definition, 'shrink')).sort()).toEqual(['count', 'force', 'paths'])
  })

  it('required 规则变成参数 required，path-list 变字符串数组', () => {
    const spec = parametersFor(definition, 'shrink')
    expect(spec['paths']).toMatchObject({ type: 'array', items: { type: 'string' }, required: true })
    expect(spec['count']).toMatchObject({ type: 'number' })
    expect(spec['force']).toMatchObject({ type: 'boolean' })
    expect(spec[definition.fields[0]?.id ?? 'action']).toBeUndefined()
  })

  it('阳性对照：可见性被判 false 的字段绝不进参数表', () => {
    expect(matchCondition(definition.fields[2]?.visible, {}, 'dedup')).toBe(false)
    expect(Object.keys(parametersFor(definition, 'dedup'))).not.toContain('count')
  })
})

describe('输入绑定', () => {
  it('按 transform 绑成执行输入', () => {
    const inputs = bindInputs(definition, { paths: 'a.txt\n b.txt \n', count: '3', force: true })
    expect(inputs).toEqual({ paths: ['a.txt', 'b.txt'], keep: 3, force: true })
  })

  it('trimOrOmit 把空串变成不提供', () => {
    expect(transformValue('   ', 'trimOrOmit')).toBeUndefined()
    expect(transformValue(' x ', 'trimOrOmit')).toBe('x')
    expect(transformValue('a,b ,, ', 'delimited')).toEqual(['a', 'b'])
    expect(transformValue('n/a', 'asInteger')).toBeUndefined()
  })
})

describe('危险闸门', () => {
  it('actionIn 只对点名的动作判危险', () => {
    expect(dangerFor(definition, undefined, 'shrink', {})?.zh).toContain('危险')
    expect(dangerFor(definition, undefined, 'dedup', {})).toBeUndefined()
  })

  it('pluginExport 缺判定函数在注册期就抛，而不是等第一次调用', () => {
    expect(() => defineNode(fakeContext().ctx, {
      definition: { ...definition, danger: { type: 'pluginExport', exportName: 'is_dangerous' } },
      handlers: { dedup: async () => 'ok', shrink: async () => 'ok' },
    })).toThrow('dangerCheck')
  })

  it('defineNode 注册每个动作一个工具，并把危险动作的调用转成 ask', async () => {
    const { ctx, registered, listeners } = fakeContext()
    defineNode(ctx, {
      definition,
      handlers: { dedup: async () => 'dedup-ok', shrink: async () => 'shrink-ok' },
    })
    expect(registered.map((tool) => tool['name'])).toEqual(['demo_dedup', 'demo_shrink'])
    expect(listeners).toHaveLength(1)
    const listener = listeners[0]!
    let passed = 0
    const next = async (): Promise<PreDecision> => { passed += 1; return { kind: 'allow' } }
    const asked = await listener({ name: 'demo_shrink', arguments: { count: 1 } }, next)
    expect(asked.kind).toBe('ask')
    expect(passed).toBe(0)
    const allowed = await listener({ name: 'demo_dedup', arguments: {} }, next)
    expect(allowed.kind).toBe('allow')
    expect(passed).toBe(1)
    // 阳性对照：不相干工具必须完全不被本节点拦截
    const foreign = await listener({ name: 'other_node_action', arguments: {} }, next)
    expect(foreign.kind).toBe('allow')
    expect(passed).toBe(2)
  })

  it('定义不合法时一次抛全部问题', () => {
    const broken = { ...definition, nodeId: '', fields: [{ id: 'x', kind: 'slider', label: { zh: '滑' } }] }
    expect(() => defineNode(fakeContext().ctx, { definition: broken, handlers: { dedup: async () => 'x', shrink: async () => 'x' } }))
      .toThrow(/nodeId is required/)
  })

  it('缺动作实现时抛错', () => {
    expect(() => defineNode(fakeContext().ctx, { definition, handlers: { dedup: async () => 'x' } }))
      .toThrow('no handler for action "shrink"')
  })
})
