/**
 * Xaihi 工作台文档入口（React 19）。
 * 挂载 Xiranite 工作台根组件 App。
 *
 * @module xaihi-ui/document/main
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { initI18n } from '@/i18n'
import App from '@/App'
import '@/index.css'

// 预先初始化 i18n 资源
void initI18n()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

// 挂载工作台 UI
const container = document.getElementById('xaihi-ui-root') || document.getElementById('root')
if (container) {
  document.title = 'Xaihi'
  createRoot(container).render(
    <StrictMode>
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </NuqsAdapter>
    </StrictMode>,
  )
} else {
  console.error('[Xaihi] Failed to find root container (#xaihi-ui-root or #root)')
}


