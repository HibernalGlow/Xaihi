import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import App from '@/App'
import { initI18n } from '@/i18n'

describe('工作台 App 根组件渲染', () => {
  beforeAll(async () => {
    await initI18n('zh')
    await import('@/components/workspace/WorkspaceLayout')
    await import('@/components/workspace/CardView')
    await import('@/components/workspace/ComponentCard')
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'offline' }), { status: 200 })))
  })

  it('在 Provider 树下成功挂载并渲染工作台 UI', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    const { container } = render(
      <StrictMode>
        <NuqsAdapter>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </NuqsAdapter>
      </StrictMode>,
    )

    // 等待 Suspense 懒加载完成并渲染出 WorkspaceLayout 核心节点
    await waitFor(() => {
      // WorkspaceLayout 包含 flex h-screen flex-col 等基础布局容器
      const layout = container.querySelector('.flex.h-screen.flex-col')
      expect(layout).not.toBeNull()
    }, { timeout: 3000 })

    // 验证 TopBar 标题栏与右侧紧凑动作入口正常呈现
    const header = container.querySelector('header')
    expect(header).not.toBeNull()

    const actionAnchor = container.querySelector('[data-testid="compact-action-switch"]')
    expect(actionAnchor).not.toBeNull()

    // 验证工作区画布容器正常挂载
    const canvas = container.querySelector('[data-context-menu="workspace-canvas"]')
    expect(canvas).not.toBeNull()

    expect(container.innerHTML).not.toBe('')
  })

  it('浏览器忽略残留的 node 参数并继续渲染工作台', async () => {
    // 普通浏览器不能把 node 参数当成独立窗口指令；该能力只由原生桌面壳提供。
    window.history.replaceState({}, '', '/xaihi/ui/rev/index.html?node=sleept')

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    const { container } = render(
      <StrictMode>
        <NuqsAdapter>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </NuqsAdapter>
      </StrictMode>,
    )

    // 等待工作台保留画布与顶栏，而不是把旧节点 URL 误判成 popup。
    await waitFor(() => {
      expect(container.querySelector('[data-context-menu="workspace-canvas"]')).not.toBeNull()
    }, { timeout: 3000 })

    expect(container.querySelector('header')).not.toBeNull()
    expect(container.querySelector('[data-testid="compact-action-switch"]')).not.toBeNull()
  })
})
