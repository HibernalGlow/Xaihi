/**
 * Xaihi 文档的入口：整个界面唯一一份 HTML 里跑的那份 JS（React 19）。
 *
 * 形状照搬运源仓那份装载器（`src/plugin-host-main.tsx`）：URL 决定装载什么、
 * 装载不到的东西显示成**读得回的失败**而不是空白，页面自己报告拿到了哪些能力。
 *
 * 与那一版不同的地方只有两条，都是被 DSH 这一侧逼出来的：
 * 1. 源仓那份是"同一个应用的第二个顶层文档"，remote 用宿主自己的 MF 实例装载；
 *    这里的文档是被 DSH 的槽框住的（`<iframe>`），所以拿不到宿主的模块表，
 *    React 19 由构建期别名 `react → react-19` 内联进来（ADR-0009 的实测结论：
 *    同一次编译里做不到外面 18 里面 19，那张图必须闭合且不能把元素交回宿主渲染）。
 * 2. 节点组件要的 `host` 不再来自进程内对象，而来自 `postMessage`（`bridge-document`）。
 *    这一步现在只把桥建起来并握手；把 `components/modules/hostApi.ts` 的求值面换成这座桥
 *    是下一刀，那一刀要动的是搬进来的 422 行，不能顺手改一半。
 *
 * @module xaihi-ui/document/main
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { NODE_CAPABILITY_IDS } from '@hibernalglow/xaihi-sdk'
import { createDocumentBridge } from '@/client/bridge-document.ts'
import App from '@/App'
import '@/index.css'

/** 由 `/xaihi/ui/<rev>/index.html` 那份文档壳写进 window 的启动信息。 */
interface XaihiUiBoot {
  rev: string
  apiBase: string
  bundleBase: string
  /** 要打开哪个节点的表面；缺省 = 整个工作台。 */
  node?: string
}

const boot = (globalThis as { __XAIHI_UI__?: XaihiUiBoot }).__XAIHI_UI__

function fail(message: string): void {
  const root = document.getElementById('xaihi-ui-root')
  if (root === null) return
  root.textContent = message
  document.title = 'Xaihi — 装载失败'
}

if (boot === undefined) {
  // 没有启动信息就等于这份 JS 不是被我们的文档壳带进来的：直说，不要按默认值画一屏。
  fail('Xaihi 文档缺少启动信息（window.__XAIHI_UI__ 未定义）——这份 main.js 应当由 /xaihi/ui/<rev>/index.html 装载。')
} else {
  const shellOrigin = window.location.origin
  const bridge = createDocumentBridge(
    (message) => window.parent.postMessage(message, shellOrigin),
    shellOrigin,
    [...NODE_CAPABILITY_IDS],
  )

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return
    void bridge.receive(event.data, event.origin)
  })

  const container = document.getElementById('xaihi-ui-root')
  if (container === null) fail('文档壳里没有 #xaihi-ui-root 这一格')
  else {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    // 握手在渲染之后发：界面先出来，能力随后按退化显示——反过来会白屏等一次往返。
    bridge.hello(boot.node ?? '')
  }

  // 页面自己报告协商结果，不打开控制台就能看见"哪一组没给、为什么"。
  // 这是那条装载器的老纪律：授权的答案要成为一个可观察事实。
  const report = document.createElement('pre')
  report.dataset.xaihiBridge = 'negotiation'
  report.style.cssText = 'position:fixed;right:0;bottom:0;margin:0;padding:6px 8px;font:11px/1.5 ui-monospace,monospace;background:rgba(0,0,0,.6);color:#fff;max-width:50%;white-space:pre-wrap'
  const paint = () => {
    const ready = bridge.ready()
    report.textContent = ready === null
      ? 'xaihi bridge: 等待宿主握手应答'
      : `xaihi bridge rev=${boot.rev} node=${boot.node ?? ''} granted=[${ready.granted.join(', ')}] degraded=${ready.degraded.length}`
  }
  paint()
  const timer = setInterval(paint, 400)
  setTimeout(() => clearInterval(timer), 6000)
  document.body.appendChild(report)
}

