/**
 * caps 透传的判据，单独一个文件：这里要 mock 掉 `document-frame` 模块，
 * 而 mock 是整文件生效的——放在 surface.spec.tsx 里会把「真实 DocumentFrame 的
 * data-xaihi-surface 属性」那条断言变成在测自己的假件（实测就是这样先红了一次）。
 * @module xaihi-ui/tests/surface-caps
 */

import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
const frameProps: Array<Record<string, unknown>> = []
vi.mock('../src/client/document-frame.tsx', async () => {
  const actual = await vi.importActual<typeof import('../src/client/document-frame.tsx')>('../src/client/document-frame.tsx')
  return {
    ...actual,
    DocumentFrame: (props: Record<string, unknown>) => {
      frameProps.push(props)
      return createElement('iframe', { className: 'xaihi-document-frame', src: String(props.documentUrl ?? '') })
    },
  }
})

import { MainSurface } from '../src/client/surface.tsx'
import type { RootProps } from '../src/client/workspace.tsx'

const rootProps = (): RootProps => ({
  t: ((key: string) => key) as RootProps['t'],
  locale: 'zh',
  renderSlot: () => null,
  runCommand: async () => ({ ok: true as const, text: '' }),
})

const jsonResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const fallback = () => createElement('div', { 'data-testid': 'in-realm' }, '外壳那一面')

describe('MainSurface 把 caps 递下去', () => {
  it('文档面拿到的 caps 就是装配侧那一份（不透传等于文档永远读到退化）', async () => {
    const caps = { env: { theme: 'dark' as const, platform: 'web' } }
    const fetcher = vi.fn(async () => jsonResponse({ ui: { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' } })) as unknown as typeof fetch
    frameProps.length = 0
    render(createElement(MainSurface, { ...rootProps(), inRealm: fallback, fetcher, caps }))
    await waitFor(() => expect(document.querySelector('iframe.xaihi-document-frame')).not.toBeNull())
    const seen = frameProps.filter((row) => Object.hasOwn(row, 'caps'))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)?.caps).toBe(caps)
  })

  it('没传 caps 时文档面拿到的是空对象，而不是复用上一次那一份', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ui: { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' } })) as unknown as typeof fetch
    frameProps.length = 0
    render(createElement(MainSurface, { ...rootProps(), inRealm: fallback, fetcher }))
    await waitFor(() => expect(document.querySelector('iframe.xaihi-document-frame')).not.toBeNull())
    const last = frameProps.at(-1)
    expect(Object.keys((last?.caps ?? {}) as object)).toEqual([])
  })
})
