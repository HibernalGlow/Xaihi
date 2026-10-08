/**
 * Xaihi 工作台文档入口（React 19）。
 * 挂载 Xiranite 工作台根组件 App，并把这一份文档的桥递下去。
 *
 * 两条与"能跑起来"并列的立场（都是 2026-10-07 使用者拍板的口径）：
 * 1. **通信只走 DSH 插件标准面**。所以这里起 `startRealm()`（那一步按容器选载体：
 *    被嵌在槽里就是 `postMessage`、桌面壳开的顶层窗就是同源 `POST /xaihi/host`），
 *    并把桥交给 `<DocumentBridgeProvider>`；**不再**往 window 上塞
 *    `__XIRANITE_BACKEND__ = { baseUrl: '/api' }` 那份 REST 兜底（ADR-0013：
 *    配置的真源是 DSH 的设置面，本仓不自带配置文件，也不自带后端）。
 * 2. **拿不到启动信息不算崩**。`window.__XAIHI_UI__` 由 `/xaihi/ui/<rev>/index.html`
 *    那份文档壳写进来；没写就让 `startRealm()` 返回 null、桥是 null，界面照常挂载并
 *    把退化读回来（ADR-0011 决定 4），而不是白屏。
 *
 * @module xaihi-ui/document/main
 */

// 显式为动态 chunk 设置 base，防在自定义 scheme 下触发 Automatic publicPath is not supported
// @ts-ignore
if (typeof __webpack_public_path__ !== 'undefined') {
  // @ts-ignore
  __webpack_public_path__ = (globalThis as unknown as { __XAIHI_UI__?: { bundleBase?: string } }).__XAIHI_UI__?.bundleBase ?? './'
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { initI18n } from '@/i18n'
import App from '@/App'
import { startRealm } from './realm.ts'
import { DocumentBridgeProvider } from './bridge-context.tsx'
import { mountSettingsFace } from './settings-face.ts'
import '@/client/generated/client.css'
import '@/index.css'

// 预先初始化 i18n 资源
void initI18n()

// 桥在 render 之前就建好（握手是异步的，`useBridgeReady` 在树里等它），
// 并且只建这一次：`startRealm()` 每调一次就多一条握手、多一个会话号。
const realm = startRealm()
// 设置面那一格（`NodeMemoryProtectionSettings` 读的 `host.config`）也挂在同一条桥上：
// 它过去是"文档装配点"自己再起一次 realm（`settings-face.ts:30`），那样会得到第二条桥。
const settingsFaceAttached = mountSettingsFace(realm)

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
          <DocumentBridgeProvider bridge={realm?.bridge ?? null}>
            <App />
          </DocumentBridgeProvider>
        </QueryClientProvider>
      </NuqsAdapter>
    </StrictMode>,
  )
} else {
  console.error('[Xaihi] Failed to find root container (#xaihi-ui-root or #root)')
}

// 装载自述：桥这一条链断在哪一段（没启动信息 / 还没握手 / 设置面没装成）要看得到，
// 而不是只在开发者控制台里。生产构建没有 `startupDebug` 那套开关，所以用一条 console 线。
console.info(
  `[Xaihi] 文档装载：rev=${realm?.boot.rev ?? '(无启动信息)'} node=${realm?.boot.node ?? ''} `
  + `桥=${realm === null ? '未建（window.__XAIHI_UI__ 未定义）' : '已建（握手进行中）'} `
  + `设置面=${settingsFaceAttached ? '已装' : '待握手'}`,
)


