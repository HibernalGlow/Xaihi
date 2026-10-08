import { StrictMode } from 'react'
import { render, waitFor, screen } from '@testing-library/react'
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

    // 验证 TopBar 标题栏与右侧动作轮盘锚点正常呈现
    const header = container.querySelector('header')
    expect(header).not.toBeNull()

    const wheelAnchor = container.querySelector('[data-testid="action-wheel-anchor"]')
    expect(wheelAnchor).not.toBeNull()

    // 验证工作区画布容器正常挂载
    const canvas = container.querySelector('[data-context-menu="workspace-canvas"]')
    expect(canvas).not.toBeNull()

    expect(container.innerHTML).not.toBe('')
  })

  it('当带有 node=sleept 参数时渲染独立节点窗口而不是工作台', async () => {
    // 模拟原生桌面子窗口 URL 参数: ?node=sleept
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

    // 等待浮窗组件挂载并确认类名 .xiranite-floating-window
    await waitFor(() => {
      const floatingWindow = container.querySelector('.xiranite-floating-window')
      expect(floatingWindow).not.toBeNull()
    }, { timeout: 3000 })

    // 独立窗口中不应该存在完整工作区画布与 TopBar
    expect(container.querySelector('[data-context-menu="workspace-canvas"]')).toBeNull()
    expect(container.querySelector('header')).toBeNull()
    expect(container.querySelector('[data-testid="action-wheel-anchor"]')).toBeNull()
  })
})
