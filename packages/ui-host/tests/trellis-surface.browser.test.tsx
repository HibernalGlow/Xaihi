/**
 * 分形视图表面的两条回归：
 *
 *  1. 画布面（「分形视图支持纹理画布」）——工作区背景（背景图/网格/点阵）由 `.ws-canvas-bg`
 *     那一层铺开，经典卡片/流程/泳道三个视图都把该层挂在视图根上；分形视图过去被库自己的
 *     底色与舞台背板盖住，是唯一看不见纹理画布的视图。
 *  2. 节点右键的「关闭这个节点」——关闭走既有实例生命周期与确认规则，不交给库自己的 close
 *     （它只删视图记录，而 reconcile 会把实例再挂回来）。
 *
 * 被测组件是真正的 `TrellisView`；外层 div 是 `WorkspaceLayout` 根元素的替身（同一组 `theme-bg-*`
 * 类与同一组 `--ws-bg-*` 变量），画布层与主题门都挂在那个根上。
 */
import type { CSSProperties } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { page, userEvent } from '@vitest/browser/context'
import { initI18n } from '@/i18n'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { ContextMenuProvider } from '@/components/context-menu'
import { TrellisView } from '@/components/workspace/TrellisView'
import { toBackgroundImageCssUrl } from '@/lib/backgroundImage'
import type { ComponentInstance } from '@/types/workspace'

// 节点界面不在这条尺的范围内：这里只要一个能落地的「节点内容」，好让库把面板画出来。
vi.mock('@/components/modules/ModuleRenderer', () => ({
  ModuleRenderer: ({ moduleId }: { moduleId: string }) => <div data-testid={`module-${moduleId}`} style={{ height: '100%' }} />,
}))

/** 8×8 纯红 SVG：整张画布铺满它以后，任何一个像素都该是纯红，像素回读才好判。 */
const BACKGROUND_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNmZjAwMDAiLz48L3N2Zz4='
const WORKSPACE_ID = 'trellis-surface-test'

/** 节点界面的宿主能力查询会被 stub 掉，但像素回读要读 data URL——留一份真 fetch 给它。 */
const nativeFetch = globalThis.fetch.bind(globalThis)

beforeAll(async () => { await initI18n('zh') })
afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ components: [] })
})

function hostStyle(): CSSProperties {
  return {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    '--ws-bg-image-url': `url(${JSON.stringify(toBackgroundImageCssUrl(BACKGROUND_IMAGE))})`,
    '--ws-bg-opacity': '1',
    '--ws-bg-blur': '0px',
  } as CSSProperties
}

async function renderTrellis(backgroundClass: string, components: ComponentInstance[] = []) {
  useWorkspaceStore.setState({ activeWorkspaceId: WORKSPACE_ID, components })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'offline' }), { status: 200 })))
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ContextMenuProvider>
        <div className={`theme-wuling ${backgroundClass}`} style={hostStyle()}>
          <TrellisView />
        </div>
      </ContextMenuProvider>
    </QueryClientProvider>,
  )
  return waitFor(() => {
    const view = document.querySelector<HTMLElement>('.xaihi-trellis')
    expect(view, '分形视图没有渲染出来').not.toBeNull()
    expect(view!.getBoundingClientRect().height, '分形视图没有高度，库不会布局').toBeGreaterThan(100)
    return view!
  })
}

function part(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector)
  expect(element, `${selector} 不在分形视图里`).not.toBeNull()
  return element!
}

/** 元素截图 → 画布 → 取某点像素：这是「屏上真的画出来了」唯一读得回来的判据。 */
async function pixelAt(element: HTMLElement, fractionX: number, fractionY: number) {
  const base64 = await page.screenshot({ element, save: false })
  const bitmap = await createImageBitmap(await (await nativeFetch(`data:image/png;base64,${base64}`)).blob())
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  const x = Math.min(bitmap.width - 1, Math.round(fractionX * bitmap.width))
  const y = Math.min(bitmap.height - 1, Math.round(fractionY * bitmap.height))
  const [r, g, b] = context.getImageData(x, y, 1, 1).data
  return { r, g, b }
}

describe('分形视图的画布面', () => {
  it('背景图模式下把背景图画到分形画布上，且中间没有不透明的地板', async () => {
    const view = await renderTrellis('theme-bg-image')

    // 视图根就是画布层：`.ws-canvas-bg` 不在根上时，下面的 ::after 判据与像素回读都会红。
    expect(view.classList.contains('ws-canvas-bg')).toBe(true)
    expect(getComputedStyle(view, '::after').backgroundImage).toContain('data:image/svg+xml')

    // 库自己的底与舞台背板必须让开，否则它们盖在画布层之上。
    expect(getComputedStyle(part('.xaihi-trellis .trellis')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(part('[data-trellis-part="backdrop"]')).backgroundColor).toBe('rgba(0, 0, 0, 0)')

    const pixel = await pixelAt(view, 0.02, 0.02)
    expect([pixel.r, pixel.g, pixel.b], `左上角应当是被背景图铺满的纯红，实测 ${JSON.stringify(pixel)}`).toEqual([255, 0, 0])
  })

  it('对照：纯色模式下同一个点不是红——像素探针读的是真的画出来的那一层', async () => {
    const view = await renderTrellis('theme-bg-none')

    const pixel = await pixelAt(view, 0.02, 0.02)
    expect([pixel.r, pixel.g, pixel.b]).not.toEqual([255, 0, 0])
  })

  it('覆盖到顶栏：背景图挂在应用根上时，分形画布同样让它透上来', async () => {
    // 这一档画布层自己的图是关掉的（`.theme-bg-image.theme-bg-cover-topbar .ws-canvas-bg::after{display:none}`），
    // 透上来靠的是根那一层 + 分形视图自己的底与舞台背板让开。
    const view = await renderTrellis('theme-bg-image theme-bg-cover-topbar')

    expect(getComputedStyle(view, '::after').display).toBe('none')
    const pixel = await pixelAt(view, 0.02, 0.02)
    expect([pixel.r, pixel.g, pixel.b], `覆盖到顶栏时左上角应当是根那层的纯红，实测 ${JSON.stringify(pixel)}`).toEqual([255, 0, 0])
  })

  it('点阵模式下点阵层画在分形视图根上', async () => {
    const view = await renderTrellis('theme-bg-dot-grid')

    expect(getComputedStyle(view, '::before').backgroundImage).toContain('radial-gradient')
    expect(getComputedStyle(part('[data-trellis-part="backdrop"]')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('分形视图的节点右键', () => {
  it('右键节点 → 关闭这个节点 → 无需二次确认直接从画布上消失', async () => {
    const component: ComponentInstance = { id: 'node-a', moduleId: 'sleept', state: 'docked', workspaceId: WORKSPACE_ID }
    const view = await renderTrellis('theme-bg-dot-grid', [component])
    expect(view.querySelector('.xaihi-trellis-node')).not.toBeNull()

    fireEvent.contextMenu(await screen.findByTestId('module-sleept'), { clientX: 120, clientY: 90 })

    const closeItem = await screen.findByRole('menuitem', { name: '关闭这个节点' })
    await userEvent.click(closeItem)

    // 二次确认已关掉：不应弹出确认对话框，节点直接关闭
    expect(screen.queryByRole('dialog')).toBeNull()

    await waitFor(() => expect(useWorkspaceStore.getState().components).toHaveLength(0))
    await waitFor(() => expect(document.querySelector('.xaihi-trellis-node')).toBeNull())
  })

  it('标签栏右键（库自己的面板菜单）也给出同一个入口，且不顶掉库的项', async () => {
    const component: ComponentInstance = { id: 'node-b', moduleId: 'sleept', state: 'docked', workspaceId: WORKSPACE_ID }
    const view = await renderTrellis('theme-bg-dot-grid', [component])

    const tabbar = await waitFor(() => {
      const found = view.querySelector<HTMLElement>('[data-trellis-part="tabbar"]')
      expect(found, '面板没有标签栏').not.toBeNull()
      return found!
    })
    fireEvent.contextMenu(tabbar, { clientX: 200, clientY: 40 })

    // 追加而不是替换：库自己的项（最大化/悬浮/隐藏…）还在。
    expect((await screen.findAllByRole('menuitem')).length).toBeGreaterThan(1)
    await userEvent.click(await screen.findByRole('menuitem', { name: '关闭这个节点' }))

    // 二次确认已关掉：不弹出确认框直接生效
    expect(screen.queryByRole('dialog')).toBeNull()

    await waitFor(() => expect(useWorkspaceStore.getState().components).toHaveLength(0))
  })
})
