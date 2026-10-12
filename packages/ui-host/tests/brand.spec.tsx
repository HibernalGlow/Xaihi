// 品牌占位的对照：两个槽都按最小 priority 占（`single` 槽取最小者渲染），组件都带读回锚点。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { XaihiBrandMark, XaihiBrandName, registerXaihiBrand } from '../src/client/brand.tsx'

describe('Xaihi 品牌占位', () => {
  it('标记与名字都带 data-xaihi-brand 读回锚点', () => {
    const mark = renderToStaticMarkup(<XaihiBrandMark />)
    expect(mark).toContain('data-xaihi-brand="mark"')
    expect(mark).toContain('>X<')
    const name = renderToStaticMarkup(<XaihiBrandName label="Xaihi" />)
    expect(name).toContain('data-xaihi-brand="name"')
    expect(name).toContain('Xaihi')
  })

  it('两个槽都经 inject 等到声明，并以 priority -1 注册', () => {
    const injected: string[] = []
    const registered: { name: string, priority: number | undefined }[] = []
    const ctx = {
      slots: {
        inject: (name: string, contribute: () => unknown) => { injected.push(name); contribute() },
        register: (options: { name: string, priority?: number }) => {
          registered.push({ name: options.name, priority: options.priority })
          return () => {}
        },
      },
    }
    registerXaihiBrand(ctx as never, ((key: string) => key) as never)
    expect(injected).toEqual(['sidebar.brand.mark', 'sidebar.brand.name'])
    expect(registered).toEqual([
      { name: 'sidebar.brand.mark', priority: -1 },
      { name: 'sidebar.brand.name', priority: -1 },
    ])
  })
})
