/**
 * `help.workflows` 现在收两形：上游那种带 title/summary 的块数组（每条还能 `{zh,en}`），
 * 以及本仓早先"按面分组、每组 `string[]`"那一形。
 *
 * 为什么值得单独钉：聚合 CLI 的渲染器与 `packages/contract` 读的一直是**块数组**
 * （`packages/cli-runtime/src/help.ts:10` 里 `workflow.title` / `summary` / `ui` / `cli` / `tips`），
 * 而 node-sdk 的类型原先只收扁平表 ⇒ 同一份上游数据搬进来时，46 个 title/summary 与
 * 125 条中文要么被丢、要么渲染器读不到（`docs/port/gap-recheck-2026-10-07.md` 末节量的就是这件事）。
 * 加宽之后**校验必须仍然会拒**——不然"两种都收"会变成"什么都能塞"。
 */
import { describe, expect, it } from 'vitest'

import { validateNodeDefinition } from '../src/node.ts'

/** 一份最小可用的定义；每条测试只换 `help`。 */
function defWithHelp(help: unknown): Record<string, unknown> {
  return {
    definitionVersion: 1,
    nodeId: 'shapeprobe',
    title: { zh: '形状探针', en: 'Shape probe' },
    description: { zh: '只测 help.workflows 的接受形状。', en: 'Tests help.workflows shapes only.' },
    actions: [{ id: 'run', label: { zh: '运行', en: 'Run' } }],
    fields: [{ id: 'target', kind: 'text', label: { zh: '目标', en: 'Target' } }],
    help,
  }
}

const ok = (help: unknown) => expect(validateNodeDefinition(defWithHelp(help) as never), JSON.stringify(help)).toMatchObject({ ok: true })
const rejectedWith = (help: unknown, needle: string) => {
  const result = validateNodeDefinition(defWithHelp(help) as never) as { ok: boolean, errors?: string[] }
  expect(result.ok, JSON.stringify(result)).toBe(false)
  expect((result.errors ?? []).join('\n')).toContain(needle)
}

describe('help.workflows 的两种形状', () => {
  it('块数组 + 每行双语 ⇒ 收（这是上游那一形）', () => {
    ok({
      whenToUse: { zh: '要探针时用。', en: 'Use when probing.' },
      workflows: [{
        title: { zh: '工作区 UI', en: 'Workspace UI' },
        summary: { zh: '在面板里跑。', en: 'Run it in the panel.' },
        ui: [{ zh: '打开面板。', en: 'Open the panel.' }],
        cli: ['Run `xshapeprobe run` on paths.'],
      }],
    })
  })

  it('扁平那一形（按面分组的 string[]）⇒ 仍然收，现有 26 份清单不因这次加宽而失效', () => {
    ok({ whenToUse: { zh: 'a', en: 'b' }, workflows: { ui: ['一条'], cli: ['one line'], tips: ['tip'] } })
  })

  it('双语只给一半 ⇒ 拒', () => rejectedWith({ workflows: [{ title: { zh: '只有中文' }, ui: ['x'] }] }, '每个语言都得是非空字符串'))
  it('行既不是串也不是对象 ⇒ 拒', () => rejectedWith({ workflows: [{ ui: [42] }] }, '只收 string 或 {zh,en}'))
  it('面名写错（扁平那一形）⇒ 拒，且要指名可写的是哪些', () => rejectedWith({ workflows: { panels: ['x'] } }, '不认识的面 "panels"'))
  it('扁平那一形里塞非 string ⇒ 拒', () => rejectedWith({ workflows: { ui: [{ zh: 'x' }] } }, '扁平那一形必须是 string[]'))
  it('块不是对象 ⇒ 拒', () => rejectedWith({ workflows: ['nope'] }, '块必须是对象'))
  it('workflows 既不是数组也不是对象 ⇒ 拒', () => rejectedWith({ workflows: 'x' }, '只能是块数组或按面分组的对象'))
})
