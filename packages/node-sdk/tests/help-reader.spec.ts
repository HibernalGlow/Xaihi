/**
 * `nodeHelpFromManifest` 现在**读清单里的 `help`**——这一条是给那张使用面表接上读者。
 *
 * 之前它只拿 nodeId/title/description/actions 合成两块通用页（`Workspace UI` / `CLI`），
 * 于是"把 54 个 `help.workflows` 块搬进清单"这件事对终端面毫无影响：
 * 内容写没写、写对没写对，`--help` 都是同一屏（实测过的判断，见
 * `docs/port/gap-recheck-2026-10-07.md` 末节）。
 *
 * 三条必配的正反判据：清单没写才回退合成（既有形状不变）；写了就用自己的（不再出现合成标题）；
 * 双语行按请求语言摊平，`{zh,en}` 只有一半时不许静默变成空行。
 */
import { describe, expect, it } from 'vitest'

import { nodeHelpFromManifest } from '../src/help.ts'

const base = {
  nodeId: 'probe',
  title: { zh: '探针节点', en: 'Probe node' },
  description: { zh: '一句话描述。', en: 'One-line description.' },
  actions: [{ id: 'run', label: { zh: '运行', en: 'Run' } }],
}

describe('nodeHelpFromManifest 读清单里的 help', () => {
  it('清单没写 workflows ⇒ 仍合成那两块通用页（既有包行为不变）', () => {
    const help = nodeHelpFromManifest(base, { bin: 'xprobe' })
    expect(help.workflows.map((block) => block.title)).toEqual(['Workspace UI', 'CLI'])
    expect(help.whenToUse).toEqual(['One-line description.'])
  })

  it('清单写了块数组 ⇒ 用自己的，合成的那两个标题一个都不出现', () => {
    const help = nodeHelpFromManifest({
      ...base,
      help: {
        whenToUse: { zh: '要量形状时用。', en: 'Use when probing shapes.' },
        workflows: [{
          title: { zh: '工作区界面', en: 'Workspace UI' },
          summary: { zh: '在面板里跑。', en: 'Run it from the panel.' },
          ui: [{ zh: '打开探针面板。', en: 'Open the probe panel.' }],
          cli: ['Run `xprobe run --json` on paths.'],
        }],
      },
    }, { bin: 'xprobe' })
    expect(help.workflows).toHaveLength(1)
    expect(help.workflows[0]?.ui).toEqual(['Open the probe panel.'])
    expect(help.workflows[0]?.cli).toEqual(['Run `xprobe run --json` on paths.'])
    expect(help.whenToUse).toEqual(['Use when probing shapes.'])
  })

  it('language:"zh" ⇒ 每行摊平成中文；只有一半语言时不许出空行', () => {
    const source = {
      ...base,
      help: {
        workflows: [{
          title: 'Usage',
          ui: [{ zh: '只有中文的一条。' }, { zh: '两份都有。', en: 'Both.' }],
        }],
      },
    }
    const zh = nodeHelpFromManifest(source, { bin: 'xprobe', language: 'zh' })
    expect(zh.workflows[0]?.ui).toEqual(['只有中文的一条。', '两份都有。'])
    const en = nodeHelpFromManifest(source, { bin: 'xprobe', language: 'en' })
    // 只有中文那行在 en 档也得给出内容（回退到有的那一份），不能静默少一行：
    expect(en.workflows[0]?.ui).toEqual(['只有中文的一条。', 'Both.'])
  })

  it('扁平那一形（按面分组）也读得到：摊成一块，行不丢', () => {
    const help = nodeHelpFromManifest({
      ...base,
      help: { workflows: { ui: ['panel step'], cli: ['Run `xprobe run`.'], tips: [] } },
    }, { bin: 'xprobe' })
    expect(help.workflows).toHaveLength(1)
    expect(help.workflows[0]?.ui).toEqual(['panel step'])
    expect(help.workflows[0]?.cli).toEqual(['Run `xprobe run`.'])
    expect(help.workflows[0]?.tips).toBeUndefined()
  })

  it('全空的 workflows ⇒ 回退合成，而不是产出一块空页', () => {
    const help = nodeHelpFromManifest({ ...base, help: { workflows: [{ title: 'X', ui: [], cli: [] }] } }, { bin: 'xprobe' })
    expect(help.workflows.map((block) => block.title)).toEqual(['Workspace UI', 'CLI'])
  })
})
