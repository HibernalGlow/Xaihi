/**
 * `nodeHelpFromManifest` 的判据。
 *
 * 三条要点：
 * 1. **推导出来的东西必须覆盖清单里的每一条动作**（少一条就是帮助页在撒谎）；
 * 2. **形状要与 `@xiranite/contract` 的 `NodeHelp` 对齐**——本包不引那个包
 *    （`workspace:*` 会把全仓 pnpm 拖崩），所以字段是照抄的，漂了必须有人发现。
 *    这一条靠**读上游源码做差集**，不靠人记；
 * 3. 缺字段的清单必须抛，而不是返回半份帮助。
 *
 * @module xaihi-sdk/tests/help
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nodeHelpFromManifest } from '../src/help.ts'

const GOOD = {
  nodeId: 'demo',
  title: { zh: '演示', en: 'Demo' },
  description: { zh: '做一件事。', en: 'Does one thing.' },
  actions: [
    { id: 'run', label: { zh: '运行', en: 'Run' }, description: { zh: '跑一次。', en: 'Run once.' } },
    { id: 'status', label: { zh: '状态', en: 'Status' }, description: { zh: '看状态。', en: 'Report state.' } },
  ],
}

/** 上游那份 NodeHelp 的字段面（用来核对我们的最小结构有没有漂）。 */
function contractHelpFields(): string[] {
  const source = readFileSync(new URL('../../../packages/contract/src/index.ts', import.meta.url), 'utf8')
  const block = /export interface NodeHelp \{([\s\S]*?)\n\}/.exec(source)
  const body = block?.[1]
  if (body === undefined) throw new Error('读不到 @xiranite/contract 的 NodeHelp：这条对照尺失效了')
  return [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((match) => match[1] as string)
}

describe('nodeHelpFromManifest', () => {
  it('每条动作都出现在命令面里，命令名用本仓的 bin', () => {
    const help = nodeHelpFromManifest(GOOD, { bin: 'xdemo', command: '/demo' })
    expect(help.commands.length).toBeGreaterThanOrEqual(2)
    const examples = help.commands[0]!.examples.map((example) => example.command)
    for (const action of ['run', 'status']) {
      expect(examples, `帮助页里没有 ${action} 这条动作的命令`).toContain(`xdemo ${action}`)
    }
    expect(help.commands[1]!.command).toBe('/demo')
    expect(help.title).toBe('Demo')
    expect(help.workflows.map((workflow) => workflow.title)).toContain('CLI')
  })

  it('形状与上游 contract 的 NodeHelp 字段对得上', () => {
    const help = nodeHelpFromManifest(GOOD)
    const produced = Object.keys(help).sort()
    const wanted = contractHelpFields().filter((field) => produced.includes(field)).sort()
    // 我们只要求"产出的字段都在上游声明过"（反向不要求：上游的可选字段可以不出现）。
    expect(produced.filter((field) => !wanted.includes(field)), '产出了上游没有的字段名').toEqual([])
    for (const field of ['title', 'short', 'workflows', 'commands']) {
      expect(produced, `上游 NodeHelp 有 ${field}，我们却没发`).toContain(field)
    }
  })

  it('阳性对照：缺 en 或缺 zh 都抛，并且报出是哪个字段', () => {
    expect(() => nodeHelpFromManifest({
      ...GOOD,
      actions: [{ id: 'run', label: { zh: '运行' } as never, description: GOOD.actions[0]!.description }],
    })).toThrow(/zh|en/)

    const halfWritten = structuredClone(GOOD)
    halfWritten.actions[0] = { id: 'run', label: GOOD.actions[0]!.label, description: { zh: '只有中文' } as never }
    expect(() => nodeHelpFromManifest(halfWritten)).toThrow(/description/)

    // **没有** description 是合法的（契约里 `NodeAction.description?` 可选）：
    // 实测上游 `node-definitions/linedup.json` 唯一的动作就没写，硬要它等于
    // 把"文案没填"升级成"这个节点不能用"。缺的时候例子只是不带 description。
    const noDescription = structuredClone(GOOD)
    delete (noDescription.actions[0] as { description?: unknown }).description
    const tolerant = nodeHelpFromManifest(noDescription, { bin: 'xdemo' })
    const first = tolerant.commands[0]!.examples[1]!
    expect(first.command).toBe('xdemo run')
    expect('description' in first, '缺描述却凭空造了一句').toBe(false)

    // 没有动作 ⇒ 直接抛，而不是给一张"看起来正常"的空帮助页。
    expect(() => nodeHelpFromManifest({ ...GOOD, actions: [] })).toThrow(/动作/)
    expect(() => nodeHelpFromManifest({ ...GOOD, nodeId: '' })).toThrow(/nodeId/)
  })

  it('阳性对照：不写 bin 时按 nodeId 推，写了就用写的（旧壳的命令名不许出现在产物里）', () => {
    const inferred = nodeHelpFromManifest(GOOD)
    expect(inferred.commands[0]!.examples[1]!.command).toMatch(/^xdemo /)
    const given = nodeHelpFromManifest(GOOD, { bin: 'xaihi-demo' })
    expect(given.commands[0]!.command).toBe('xaihi-demo')
    const text = JSON.stringify(given)
    // 品牌纪律（ADR-0010）：会随代码活下去的称呼里不许出现旧品牌。
    expect(text.toLowerCase()).not.toContain('xiranite')
  })
})
