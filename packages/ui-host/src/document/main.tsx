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
import App from '@/App'
import { startRealm } from './realm.ts'
import '@/index.css'

/**
 * 文档那一侧的正式入口：realm 管道在 `realm.ts`，这里只负责把工作台挂上去。
 * 形状照搬运源仓那份装载器：URL 决定装载什么、读不到的东西显示成可见失败。
 */
const realm = startRealm()

if (realm === null) {
  document.getElementById('xaihi-ui-root')?.replaceChildren(
    Object.assign(document.createElement('pre'), {
      textContent: 'Xaihi 文档缺少启动信息（window.__XAIHI_UI__ 未定义）——这份 main.js 应当由 /xaihi/ui/<rev>/index.html 装载。',
    }),
  )
  document.title = 'Xaihi — 装载失败'
} else {
  const container = document.getElementById('xaihi-ui-root')
  if (container === null) {
    document.title = 'Xaihi — 装载失败'
  } else {
    // 握手先走完再挂界面：host 形状来自桥，早挂会让第一帧读到的能力是"未知"而不是"没有"。
    const wait = setInterval(() => {
      if (realm.bridge.ready() === null) return
      clearInterval(wait)
      createRoot(container).render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
    }, 120)
    setTimeout(() => clearInterval(wait), 8000)
  }
}
