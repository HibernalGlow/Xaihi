/**
 * 运行期那一半的判据：CSS 只进一次、锚点挂得上、门镜像得过去、宿主自己的弹层不被改脸、回收还得干净。
 *
 * 构建期那把尺（`scripts/build-css.mjs`）管的是"哪些规则不许命中宿主 DOM"；这张表管的是
 * "改写之后欠下的两件事到底做没做"。两条都不可省：构建期把 `:root[data-app-design=…]`
 * 改成 `[data-xaihi-ui][data-app-design=…]` 之后，**没人挂这个属性就等于六份设计配方
 * 全部静默不生效**——屏幕上是"颜色没变"，控制台里什么都没有。
 *
 * 每条都写了怎么把它证伪（要么改动被测模块那条就红，要么把守卫关掉这条还绿就删）。
 * 引用计数是跨用例的：`stats.owners` 是模块级状态，所以每条自己 dispose 干净。
 *
 * @module xaihi-ui/tests/css-scope
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { CLIENT_CSS } from '../src/client/generated/client-css.ts'
import { MainSurface } from '../src/client/surface.tsx'
import { DESIGN_STYLE_ID, SCOPE_ATTRIBUTE, designCssStats, injectDesignCss } from '../src/client/styles-inject.ts'
import { registerStyles } from '../src/client/styles.ts'
import type { RootProps } from '../src/client/workspace.tsx'

/** 只数"内容里含本产物"的表：两条路（自己的 id 与搬运批那张拼了 CLIENT_CSS 的）都算一份。 */
function sheetsCarryingOurCss(): number {
  const marker = CLIENT_CSS.slice(0, 512)
  return Array.from(document.getElementsByTagName('style'))
    .filter((tag) => (tag.textContent ?? '').includes(marker)).length
}

function flush(): Promise<void> {
  // MutationObserver 的回调在微任务里跑，happy-dom 也一样；不等它就数不到 portal。
  return new Promise((resolve) => { setTimeout(resolve, 0) })
}

const disposers: Array<() => void> = []
beforeEach(() => {
  // 前置条件：引用计数与表都得从干净状态开始。上一条用例要是漏了一个主人没 dispose，
  // 这条就在这里红——否则下面每条"表撤干净"的判读到的都是别人留下的状态。
  expect(designCssStats().owners).toBe(0)
  expect(document.getElementById(DESIGN_STYLE_ID)).toBeNull()
})
function inject(options: Parameters<typeof injectDesignCss>[0]): void {
  disposers.push(injectDesignCss(options))
}

afterEach(async () => {
  while (disposers.length > 0) disposers.pop()?.()
  document.head.replaceChildren()
  document.body.replaceChildren()
  for (const name of ['data-app-design', 'data-design-color', 'data-design-shape', 'data-design-motion']) {
    document.documentElement.removeAttribute(name)
  }
  delete window.__XAIHI_CSS__
  await flush()
})

describe('设计 CSS 的注入与作用域', () => {
  it('注一张表：内容就是产物本身，位置在宿主那张表之后', () => {
    const host = document.createElement('style')
    host.id = 'host-sheet'
    host.textContent = '.host { color: red }'
    document.head.append(host)

    inject({})

    const tags = Array.from(document.getElementsByTagName('style'))
    const ours = document.getElementById(DESIGN_STYLE_ID)
    expect(ours).not.toBeNull()
    expect(ours?.textContent).toBe(CLIENT_CSS)
    // 先后就是优先级：我们的无层声明必须排在宿主表后面。拔掉 append 换成 prepend 这条就红。
    expect(tags.indexOf(ours as HTMLStyleElement)).toBeGreaterThan(tags.indexOf(host))
  })

  it('同一份产物只进一次：搬运批那张表已经带了 CLIENT_CSS，就不再塞第二份 574 KB', () => {
    const disposeStyles = registerStyles()
    inject({})
    expect(sheetsCarryingOurCss()).toBe(1)
    const second = injectDesignCss({})
    expect(sheetsCarryingOurCss()).toBe(1)
    expect(designCssStats().owners).toBe(2)
    second()
    disposeStyles()
  })

  it('引用计数归零才摘表：还有主人在时 dispose 不许动文档', () => {
    const first = injectDesignCss({})
    const second = injectDesignCss({})
    first()
    expect(document.getElementById(DESIGN_STYLE_ID)).not.toBeNull()
    expect(designCssStats().injected).toBe(true)
    second()
    expect(document.getElementById(DESIGN_STYLE_ID)).toBeNull()
    expect(designCssStats().injected).toBe(false)
  })

  it('给面板根挂锚点，并把 documentElement 上的门镜像过去', () => {
    document.documentElement.setAttribute('data-app-design', 'md3')
    document.documentElement.setAttribute('data-design-color', 'custom')
    const root = document.createElement('div')
    document.body.append(root)

    inject({ root })

    expect(root.getAttribute(SCOPE_ATTRIBUTE)).toBe('true')
    // 门不镜像＝六份配方在面板根上整块失效；apply.ts 写在 documentElement，这里得搬过来。
    expect(root.getAttribute('data-app-design')).toBe('md3')
    expect(root.getAttribute('data-design-color')).toBe('custom')
  })

  it('显式给的 designAttributes 优先于 documentElement 上现读的', () => {
    document.documentElement.setAttribute('data-app-design', 'mondrian')
    const root = document.createElement('div')
    document.body.append(root)
    inject({ root, designAttributes: { 'data-app-design': 'swiss' } })
    expect(root.getAttribute('data-app-design')).toBe('swiss')
  })

  it('回收按账还原：我们加过的摘掉，别人本来就有的值原样留着', () => {
    const root = document.createElement('div')
    root.setAttribute(SCOPE_ATTRIBUTE, 'host-owned')
    document.body.append(root)
    const other = document.createElement('div')
    document.body.append(other)

    const dispose = injectDesignCss({ root, designAttributes: { 'data-app-design': 'md3' } })
    expect(root.getAttribute(SCOPE_ATTRIBUTE)).toBe('host-owned')
    expect(root.getAttribute('data-app-design')).toBe('md3')
    dispose()

    // 已存在的锚点不许被覆盖，也不许在回收时被顺手删掉——那是宿主的属性不是我们的。
    expect(root.getAttribute(SCOPE_ATTRIBUTE)).toBe('host-owned')
    expect(root.hasAttribute('data-app-design')).toBe(false)
    expect(other.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false)
  })

  it('portal 两条闸门：最后一次交互在我们根内才镜像，外面的不碰', async () => {
    document.documentElement.setAttribute('data-app-design', 'md3')
    const root = document.createElement('div')
    document.body.append(root)
    inject({ root })
    // 计数是模块级共享的一份（面板与 portal 都记在同一个 stats 上），所以按**增量**判：
    // 断绝对值会把别的用例灌进来的数算成本条的行为，那既不是判据也挡不住回归。
    const skippedBefore = designCssStats().portalsSkipped
    const markedBefore = designCssStats().portalsMarked

    // 闸门一没过：没有 pointerdown 落在根里，宿主自己开的弹层必须原样。
    const hostPortal = document.createElement('div')
    hostPortal.setAttribute('data-radix-portal', '')
    document.body.append(hostPortal)
    await flush()
    expect(hostPortal.hasAttribute(SCOPE_ATTRIBUTE)).toBe(false)
    expect(designCssStats().portalsSkipped).toBe(skippedBefore + 1)
    expect(designCssStats().lastSkipReason).toBe('last-interaction-outside')

    // 闸门二：交互落在根内之后，新出现的弹层要拿到锚点与门。
    root.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const ourPortal = document.createElement('div')
    ourPortal.setAttribute('data-radix-portal', '')
    document.body.append(ourPortal)
    await flush()
    expect(ourPortal.getAttribute(SCOPE_ATTRIBUTE)).toBe('true')
    expect(ourPortal.getAttribute('data-app-design')).toBe('md3')
    expect(designCssStats().portalsMarked).toBe(markedBefore + 1)
  })

  it('已经被我们标过的节点重挂一次不把计数越加越大', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    inject({ root })
    root.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    const markedBefore = designCssStats().portalsMarked

    const portal = document.createElement('div')
    portal.setAttribute('data-radix-portal', '')
    document.body.append(portal)
    await flush()
    expect(designCssStats().portalsMarked).toBe(markedBefore + 1)
    const scopedAfterFirst = designCssStats().scopedRoots
    document.body.append(portal) // 同一个节点搬回 body（Radix 重开对话框的形状）
    await flush()
    // 按元素去重：搬回来既不多标一次，也不把 scopedRoots 抬高。
    expect(designCssStats().portalsMarked).toBe(markedBefore + 1)
    expect(designCssStats().scopedRoots).toBe(scopedAfterFirst)
    expect(scopedAfterFirst).toBeGreaterThan(1) // 根 + 那一个 portal
  })

  it('读数挂到 globalThis 供实机核对，回收后连读数一起清掉', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const dispose = injectDesignCss({ root })
    expect(designCssStats().cssBytes).toBe(CLIENT_CSS.length)
    expect(window.__XAIHI_CSS__).toBeDefined()
    expect(window.__XAIHI_CSS__?.owners).toBe(1)
    dispose()
    expect(window.__XAIHI_CSS__).toBeUndefined()
  })
})

/**
 * 接线那一半：`MainSurface` 挂载时把上面那些行为真做一次。
 * 把 `surface.tsx` 里那个 `useEffect` 删掉，前两条立刻红——这条判据不是装饰。
 */
describe('面板挂载时的作用域接线', () => {
  const rootProps = (): RootProps => ({
    t: ((key: string) => key) as RootProps['t'],
    locale: 'zh',
    renderSlot: () => null,
    runCommand: async () => ({ ok: true as const, text: '' }),
  })
  const noDocument = async () =>
    ({ ok: true, status: 200, json: async () => ({ ui: {} }) }) as unknown as Response

  it('外壳那一面的根拿到锚点，产物那张表同时在文档里', async () => {
    document.documentElement.setAttribute('data-app-design', 'md3')
    const view = render(createElement(MainSurface, {
      ...rootProps(),
      inRealm: () => createElement('div', { 'data-testid': 'in-realm' }, '那一面'),
      fetcher: noDocument as unknown as typeof fetch,
    }))
    await waitFor(() => expect(view.container.querySelector('.xaihi-surface-in-realm')).not.toBeNull())
    const realmRoot = view.container.querySelector('.xaihi-surface-in-realm')
    expect(realmRoot?.getAttribute(SCOPE_ATTRIBUTE)).toBe('true')
    expect(realmRoot?.getAttribute('data-app-design')).toBe('md3')
    expect(document.getElementById(DESIGN_STYLE_ID)).not.toBeNull()
    cleanup()
  })

  it('卸载之后锚点与表都撤干净（DSH 重载插件是同一个 document 再跑一次入口）', async () => {
    const view = render(createElement(MainSurface, {
      ...rootProps(),
      inRealm: () => createElement('div', null, '那一面'),
      fetcher: noDocument as unknown as typeof fetch,
    }))
    await waitFor(() => expect(document.getElementById(DESIGN_STYLE_ID)).not.toBeNull())
    cleanup()
    expect(document.getElementById(DESIGN_STYLE_ID)).toBeNull()
    expect(view.container.querySelector('.xaihi-surface-in-realm')?.hasAttribute(SCOPE_ATTRIBUTE) ?? false).toBe(false)
    expect(designCssStats().owners).toBe(0)
  })

  it('走文档面时不在宿主文档里注我们那张表：独立 realm 有自己的产物', async () => {
    const fetcher = vi.fn(async () =>
      ({ ok: true, status: 200, json: async () => ({ ui: { documentUrl: '/xaihi/ui/abcd/index.html', rev: 'abcd' } }) }) as unknown as Response)
    render(createElement(MainSurface, {
      ...rootProps(),
      inRealm: () => createElement('div', null, '那一面'),
      fetcher: fetcher as unknown as typeof fetch,
    }))
    await waitFor(() => expect(document.querySelector('iframe.xaihi-document-frame')).not.toBeNull())
    // 首帧是 in-realm（清单还没读到不该出现空白），表因此确实注进去过一次；
    // 换面时 React 的 passive effect 清理排在微任务之后，所以这里等它落定而不是当场断言。
    // 减法跑测（10-06 实测）：把 `surface.tsx` 那个 useEffect 的 `return` 摘掉，
    // 这条红在上面的前置条件上（owners 1 ≠ 0），"卸载那条"同时红——不是超时红。
    await waitFor(() => expect(document.getElementById(DESIGN_STYLE_ID)).toBeNull())
    cleanup()
  })
})
