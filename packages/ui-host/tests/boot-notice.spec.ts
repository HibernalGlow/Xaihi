import { describe, expect, it } from 'vitest'
import { describeHostSurface, describeNoBridge } from '../src/document/boot-notice.ts'

/** 造一份壳面：给 `dshDesktop` 加上不同形状的 `xaihiWindow`。 */
function scopeWith (dshDesktop: unknown): unknown {
  return { dshDesktop }
}

const OWNED = scopeWith({ xaihiWindow: { open: async () => ({ windowId: 1, alreadyOpen: false }) } })
const STOCK = scopeWith({ protocolVersion: 1, browser: {}, deviceInfo: {} })
const HALF = scopeWith({ xaihiWindow: { open: 'not-a-function' } })

describe('describeNoBridge 的顶层与 iframe 两格', () => {
  it('顶层 + 自家壳：说清通路没接通，但独立窗读回来是可用', () => {
    const notice = describeNoBridge({ isTopLevel: true, scope: OWNED, node: 'xaihi-sleept' })
    expect(notice.reason).toBe('top-level-no-bridge')
    expect(notice.windowSupported).toBe(true)
    expect(notice.windowReason).toBeUndefined()
    expect(notice.lines[0]).toContain('xaihi-sleept')
    expect(notice.lines.some((line) => line.includes('独立窗：可用'))).toBe(true)
  })

  it('整份工作台的文档要把"工作台"说出来，不许顶成某个节点', () => {
    const notice = describeNoBridge({ isTopLevel: true, scope: OWNED, node: '' })
    expect(notice.lines[0]).toContain('整份工作台的文档')
    expect(notice.lines[0]).not.toContain('节点 ')
  })

  it('iframe 里没有答话走另一格，文案指名 bridge-shell', () => {
    const notice = describeNoBridge({ isTopLevel: false, scope: OWNED, node: 'xaihi-linedup' })
    expect(notice.reason).toBe('iframe-no-answer')
    expect(notice.lines.some((line) => line.includes('bridge-shell'))).toBe(true)
  })
})

describe('开窗能力的三种不可用必须分得开', () => {
  it('官方桌面端 ⇒ stock-shell，且不许出现"可用"', () => {
    const notice = describeNoBridge({ isTopLevel: true, scope: STOCK, node: 'xaihi-sleept' })
    expect(notice.windowSupported).toBe(false)
    expect(notice.windowReason).toBe('stock-shell')
    const joined = notice.lines.join('\n')
    expect(joined).toContain('官方桌面端没有这个动词')
    expect(joined).not.toContain('独立窗：可用')
  })

  it('不在壳里 ⇒ no-shell-surface，与"有壳但没动词"不是同一个词', () => {
    const inBrowser = describeNoBridge({ isTopLevel: true, scope: {}, node: '' })
    const stock = describeNoBridge({ isTopLevel: true, scope: STOCK, node: '' })
    expect(inBrowser.windowReason).toBe('no-shell-surface')
    expect(inBrowser.lines.join('\n')).toContain('不在桌面壳里')
    expect(inBrowser.windowReason).not.toBe(stock.windowReason)
  })

  it('形状对但 open 不是函数 ⇒ not-a-function，也不许画成可用', () => {
    const notice = describeNoBridge({ isTopLevel: true, scope: HALF, node: '' })
    expect(notice.windowReason).toBe('not-a-function')
    expect(notice.lines.join('\n')).toContain('半接的壳')
    expect(notice.lines.join('\n')).not.toContain('独立窗：可用')
  })

  it('作用域整个缺失也不炸，按"不在壳里"说', () => {
    for (const scope of [undefined, null, 'a string']) {
      const notice = describeNoBridge({ isTopLevel: true, scope, node: '' })
      expect(notice.windowReason).toBe('no-shell-surface')
      expect(notice.lines.length).toBeGreaterThan(1)
    }
  })

  // 阳性对照：把"可用"这行从文案里抹掉，判据必须还能看见违规——否则上面那几条 not.toContain 是空的。
  it('尺看得见"把不可用画成可用"这种退化', () => {
    const broken = describeNoBridge({ isTopLevel: true, scope: OWNED, node: 'x' })
    const tampered = { ...broken, lines: [...broken.lines, '独立窗：可用'] }
    expect(tampered.lines.some((line) => line.includes('独立窗：可用'))).toBe(true)
    expect(describeNoBridge({ isTopLevel: true, scope: STOCK, node: 'x' }).lines.some((line) => line.includes('独立窗：可用'))).toBe(false)
  })

  it('windowStatus 给得出四个档，且 windowLine 就是画出来的那一句', () => {
    expect(describeNoBridge({ isTopLevel: true, scope: OWNED, node: 'x' }).windowStatus).toBe('supported')
    expect(describeNoBridge({ isTopLevel: true, scope: STOCK, node: 'x' }).windowStatus).toBe('stock-shell')
    expect(describeNoBridge({ isTopLevel: true, scope: {}, node: 'x' }).windowStatus).toBe('no-shell-surface')
    expect(describeNoBridge({ isTopLevel: true, scope: HALF, node: 'x' }).windowStatus).toBe('not-a-function')
    // 页面上按 data 属性取值的那句与 lines 最后一条必须是同一份，否则判据读的和使用者看的会分成两个版本
    for (const scope of [OWNED, STOCK, {}, HALF]) {
      const notice = describeNoBridge({ isTopLevel: true, scope, node: 'x' })
      expect(notice.lines[notice.lines.length - 1]).toBe(notice.windowLine)
    }
  })
})

// realm 探针从不等桥，所以它那一档只许报事实：placement + 能力读回。
// 这一条是给"探针声称桥失败了"那种过度陈述上的闸。
describe('describeHostSurface 只报事实', () => {
  it('顶层与 iframe 的 placement 分得开，两句话面也不同', () => {
    const top = describeHostSurface({ isTopLevel: true, scope: OWNED, node: 'xaihi-sleept' })
    const nested = describeHostSurface({ isTopLevel: false, scope: OWNED, node: 'xaihi-sleept' })
    expect(top.placement).toBe('top-level')
    expect(nested.placement).toBe('nested')
    expect(top.lines[0]).toContain('桌面壳直接开出来的顶层窗')
    expect(nested.lines[0]).toContain('外层 iframe')
    expect(nested.lines[0]).not.toContain('顶层窗，')
    expect(top.lines.join(' ')).not.toBe(nested.lines.join(' '))
  })

  it('不许出现"还没接通""没答话"这类只有等过桥才许说的话', () => {
    for (const isTopLevel of [true, false]) {
      const surface = describeHostSurface({ isTopLevel, scope: OWNED, node: 'x' })
      const joined = surface.lines.join('\n')
      expect(joined).not.toContain('还没接通')
      expect(joined).not.toContain('没答话')
      expect(joined).not.toContain('bridge-shell')
    }
  })

  it('能力读回与 describeNoBridge 同源，两档不许各写一套词', () => {
    for (const scope of [OWNED, STOCK, {}, HALF]) {
      const surface = describeHostSurface({ isTopLevel: true, scope, node: 'x' })
      const notice = describeNoBridge({ isTopLevel: true, scope, node: 'x' })
      expect(notice.windowStatus).toBe(surface.windowStatus)
      expect(notice.windowLine).toBe(surface.windowLine)
      expect(notice.windowReason).toBe(surface.windowReason)
    }
  })
})
