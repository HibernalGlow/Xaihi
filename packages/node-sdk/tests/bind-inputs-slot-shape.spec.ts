/**
 * 界面那一侧说的是**槽位名**，模型那一侧说的是**字段 id**：一次改名绑定必须两边都认。
 *
 * 出处（2026-10-10 实机，隔离宿主 3199）：cleanf 卡片上填好 `/Users/glow/Downloads` 按"预演清理"，
 * 回的是内核那句 `cleanf: No valid paths provided.`。根因不在内核也不在界面，在这条缝的合成方式：
 * `runAction` 写的是 `{ ...raw, ...bindInputs(definition, raw) }`，而 `bindInputs` 只按**字段 id**
 * 取值（cleanf 的清单是 `pathsText→paths`），界面给的是槽位名 `paths` ⇒ 字段那次取值缺席、绑出一个
 * 空数组，再把界面真发过来的那一份覆盖掉。同一份输入只要把键换成 `pathsText`，同一条路由立刻扫出 9 项。
 *
 * 这份用例的夹具**故意做成改名绑定**，并在第一条里断言它确实是改名的：谁要是把夹具改成同名，
 * 这份尺就当场红，而不是悄悄变成一条什么都测不到的绿灯。
 *
 * @module xaihi-sdk/tests/bind-inputs-slot-shape
 */

import { describe, expect, it } from 'vitest'
import { bindInputs, defineNode, type NodeToolContext } from '../src/define-node.ts'
import { NodeRegistry } from '../src/node-registry.ts'
import type { NodeDefinition } from '../src/node.ts'

/** 形状抄自 `plugins/cleanf/package.json#xaihi.node`（两条改名绑定 + 一条同名绑定）。 */
const renamed = {
  definitionVersion: 1,
  nodeId: 'slotbind',
  title: { zh: '槽位夹具', en: 'Slot fixture' },
  description: { zh: '契约夹具', en: 'Contract fixture' },
  actions: [{ id: 'clean', label: { zh: '清理', en: 'Clean' } }],
  fields: [
    { id: 'action', kind: 'select', isActionSelector: true, label: { zh: '动作', en: 'Action' }, options: [{ value: 'clean', label: { zh: '清理', en: 'Clean' } }] },
    { id: 'pathsText', kind: 'path-list', label: { zh: '路径', en: 'Paths' } },
    { id: 'presetsText', kind: 'multiline', label: { zh: '预设', en: 'Presets' } },
    { id: 'preview', kind: 'boolean', label: { zh: '预演', en: 'Preview' } },
  ],
  groups: [{ id: 'main', fieldIds: ['action', 'pathsText', 'presetsText', 'preview'] }],
  inputBindings: [
    { fieldId: 'action', slot: 'action', transform: 'trim' },
    { fieldId: 'pathsText', slot: 'paths', transform: 'delimited' },
    { fieldId: 'presetsText', slot: 'presets', transform: 'delimited' },
    { fieldId: 'preview', slot: 'preview', transform: 'asBoolean' },
  ],
} as unknown as NodeDefinition

function fakeContext(): { ctx: NodeToolContext; registry: NodeRegistry } {
  const registry = new NodeRegistry()
  return {
    registry,
    ctx: {
      tools: { register: () => () => {} },
      on: () => () => {},
      inject: (_deps, callback) => {
        const dispose = callback({ get: () => registry })
        return typeof dispose === 'function' ? (dispose as () => void) : () => {}
      },
      get: () => registry,
    },
  }
}

describe('改名绑定的两种调用形状', () => {
  it('夹具确实是改名的（否则这份尺是空的）', () => {
    const binding = renamed.inputBindings.find((entry) => entry.slot === 'paths')
    expect(binding?.fieldId).toBe('pathsText')
    expect(binding?.fieldId).not.toBe(binding?.slot)
  })

  it('界面形状（槽位名）不被清空', () => {
    const inputs = bindInputs(renamed, { paths: ['/Users/glow/Downloads'], preview: false })
    expect(inputs.paths).toEqual(['/Users/glow/Downloads'])
    expect(inputs.preview).toBe(false)
  })

  it('模型形状（字段 id）照旧走 transform', () => {
    const inputs = bindInputs(renamed, { pathsText: 'a,b', presetsText: 'x,y', preview: 'true' })
    expect(inputs.paths).toEqual(['a', 'b'])
    expect(inputs.presets).toEqual(['x', 'y'])
    expect(inputs.preview).toBe(true)
  })

  it('两种名字都缺席时仍然是空值，不是编出来的默认', () => {
    const inputs = bindInputs(renamed, {})
    expect(inputs.paths).toEqual([])
    expect(inputs.preview).toBeUndefined()
  })
})

describe('经 defineNode 的真实合成路径（runAction 的 {...raw, ...bindInputs}）', () => {
  async function run(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { ctx, registry } = fakeContext()
    let seen: Record<string, unknown> = {}
    defineNode(ctx, {
      definition: renamed,
      handlers: {
        clean: async ({ inputs }) => {
          seen = inputs
          return 'ok'
        },
      },
    })
    const result = await registry.run('slotbind', input)
    expect(result.success).toBe(true)
    return seen
  }

  it('界面发的槽位活到最后：cleanf 那条 No valid paths provided. 的根因', async () => {
    const inputs = await run({ paths: ['/Users/glow/Downloads'], presets: ['empty_folders'], preview: true })
    expect(inputs.paths).toEqual(['/Users/glow/Downloads'])
    expect(inputs.presets).toEqual(['empty_folders'])
    expect(inputs.preview).toBe(true)
  })

  it('界面发的 preview=false 不被当成缺席', async () => {
    const inputs = await run({ paths: ['/tmp'], preview: false })
    expect(inputs.preview).toBe(false)
  })

  it('模型形状经同一条路仍然是变换后的值', async () => {
    const inputs = await run({ pathsText: 'a,b', preview: true })
    expect(inputs.paths).toEqual(['a', 'b'])
  })
})
