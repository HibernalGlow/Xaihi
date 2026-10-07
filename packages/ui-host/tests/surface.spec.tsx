/**
 * 选择那一格的测试：三种清单结果各走哪一面、原因各是什么。
 *
 * `inRealm` 那片是注入的假件，不是真的 `WorkspaceRoot`：
 * 本组件的职责只有"选哪一面 + 把原因带出来"，把搬运树整棵拉进来测它
 * 只会让这条判据被别人正在改的文件淹没。
 * @module xaihi-ui/tests/surface
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { createElement, useEffect, useRef, useState } from 'react'
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

// 每个用例自己的 container：`document.querySelector` 会把上一个用例留下的 DOM 也捞进来，
// 那不是判据，那是串味（实测 5 条里 3 条这样挂掉）。
const renderSurface = (fetcher: typeof fetch) =>
  render(createElement(MainSurface, { ...rootProps(), inRealm: fallback, fetcher }))

afterEach(() => cleanup())

describe('MainSurface 的选择', () => {
  it('清单里 documentUrl 有值 ⇒ 走文档面，iframe 的 src 就是那条 URL', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ui: { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' } })) as unknown as typeof fetch
    const view = renderSurface(fetcher)
    await waitFor(() => expect(view.container.querySelector('iframe.xaihi-document-frame')).not.toBeNull())
    const frame = view.container.querySelector('iframe.xaihi-document-frame')
    expect(frame?.getAttribute('src')).toBe('/xaihi/ui/0123456789ab/index.html')
    expect(frame?.getAttribute('data-xaihi-surface')).toBe('document')
  })

  it('清单说产物没配 ⇒ 继续显示外壳那一面，并把那句原因挂在节点上', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      ui: { documentUrl: '', rev: 'missing', problems: ['xaihi ui bundle is not configured (config core.uiBundleDir is empty)'] },
    })) as unknown as typeof fetch
    const view = renderSurface(fetcher)
    await waitFor(() => expect(view.getByTestId('in-realm')).toBeTruthy())
    const wrapper = view.container.querySelector('[data-xaihi-surface="in-realm"]')
    expect(wrapper?.getAttribute('data-xaihi-reason')).toContain('core.uiBundleDir')
  })

  it('清单读不到（HTTP 503）⇒ 仍然有界面，但原因换成读失败那句，不停在"还没读到"', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch
    const view = renderSurface(fetcher)
    await waitFor(() => expect(view.getByTestId('in-realm')).toBeTruthy())
    const reason = view.container.querySelector('[data-xaihi-surface="in-realm"]')?.getAttribute('data-xaihi-reason') ?? ''
    expect(reason).toContain('503')
    expect(reason).not.toContain('还没读到')
  })

  it('第一次渲染就是外壳那一面：读清单是异步的，空白不是可接受的中间态', () => {
    let release: ((value: Response) => void) | undefined
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      release = resolve
    })) as unknown as typeof fetch
    const view = renderSurface(fetcher)
    expect(view.getByTestId('in-realm')).toBeTruthy()
    expect(view.container.querySelector('iframe')).toBeNull()
    release?.(jsonResponse({ ui: { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' } }))
  })

  it('外壳那一面自己带 hooks 时，换面不许把它记到本组件头上（宿主实测：React #300）', async () => {
    // 2026-10-06 在真 DSH 宿主里读到的崩法：`slot entry crashed in 'main': Minified React error #300`
    // = "Rendered fewer hooks than expected"。成因不是 React 版本，是 `inRealm(root)` 这种**当函数调**
    // 的写法——被调组件的 hooks 记在调用方身上，于是 pending（调了它）→ document（没调）那一次
    // 重渲染少了一整层 hook。真 `WorkspaceRoot` 恰好带 3 个 hooks，所以只有真组件上屏才暴露。
    const Hooked = (props: RootProps) => {
      useState(0)
      useEffect(() => {})
      useRef(null)
      return createElement('div', { 'data-testid': 'in-realm' }, props.locale)
    }
    const fetcher = vi.fn(async () => jsonResponse({ ui: { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' } })) as unknown as typeof fetch
    const noisy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = render(createElement(MainSurface, { ...rootProps(), inRealm: Hooked, fetcher }))
    await waitFor(() => expect(view.container.querySelector('iframe.xaihi-document-frame')).not.toBeNull())
    const hookError = noisy.mock.calls.flat().find((arg) => String(arg).includes('fewer hooks'))
    noisy.mockRestore()
    expect(hookError).toBeUndefined()
  })

  it('走外壳那一面时，props 原样送到（选择这一层不许把 t / locale / renderSlot / runCommand 丢掉）', async () => {
    const received: RootProps[] = []
    const spyFallback = (props: RootProps) => {
      received.push(props)
      return createElement('div', { 'data-testid': 'in-realm' }, '外壳那一面')
    }
    const fetcher = vi.fn(async () => jsonResponse({ ui: { documentUrl: '', rev: 'missing' } })) as unknown as typeof fetch
    const props = rootProps()
    const view = render(createElement(MainSurface, { ...props, inRealm: spyFallback, fetcher }))
    await waitFor(() => expect(view.getByTestId('in-realm')).toBeTruthy())
    // 至少两次：先按"还没读到清单"渲染一次，清单读到了再渲染一次。
    // 断的是**每一次都拿全 props**，不是次数——次数是实现细节，漏送才是事故。
    expect(received.length).toBeGreaterThanOrEqual(1)
    for (const got of received) {
      expect(got.locale).toBe('zh')
      expect(got.t).toBe(props.t)
      expect(got.renderSlot).toBe(props.renderSlot)
      expect(got.runCommand).toBe(props.runCommand)
    }
  })

  it('清单说产物里没有问宿主的装载点 ⇒ iframe 仍在（界面没被诊断顶掉），但上方那句话读得回来', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      ui: { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab', hostMount: 'absent' },
    })) as unknown as typeof fetch
    const view = renderSurface(fetcher)
    await waitFor(() => expect(view.container.querySelector('[data-xaihi-host-mount]')).not.toBeNull())
    expect(view.container.querySelector('iframe.xaihi-document-frame')).not.toBeNull()
    expect(view.container.querySelector('[data-xaihi-host-mount="absent"]')?.textContent).toContain('问不到对面')
  })

  it('正向对照：装载点在的时候不许有那句话；清单没发这个字段也不许现编一句', async () => {
    for (const ui of [
      { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab', hostMount: 'present' },
      { documentUrl: '/xaihi/ui/0123456789ab/index.html', rev: '0123456789ab' },
    ]) {
      const fetcher = vi.fn(async () => jsonResponse({ ui })) as unknown as typeof fetch
      const view = renderSurface(fetcher)
      await waitFor(() => expect(view.container.querySelector('iframe.xaihi-document-frame')).not.toBeNull())
      expect(view.container.querySelector('[data-xaihi-host-mount]')).toBeNull()
      cleanup()
    }
  })
})
