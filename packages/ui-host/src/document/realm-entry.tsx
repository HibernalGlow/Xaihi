/**
 * realm 管道验证用的入口：只起 realm + 挂一块**明写自己不是界面**的板。
 *
 * 为什么要有它：整棵搬运树还建不出来（2026-10-06 复测 8 条错，属搬运批那一刀），而
 * 「这一份文档里装进来的 React 是哪一份、它能不能真的挂载、桥能不能跨文档往返」
 * 不该等树搬完才第一次被验证。这块板不是工作台，页面上也这么写。
 *
 * @module xaihi-ui/document/realm-entry
 */

import { createRoot } from 'react-dom/client'
import { startRealm } from './realm.ts'

const realm = startRealm()

if (realm === null) {
  document.getElementById('xaihi-ui-root')?.replaceChildren(
    Object.assign(document.createElement('pre'), {
      textContent: 'Xaihi 文档缺少启动信息（window.__XAIHI_UI__ 未定义）——这份 main.js 应由 /xaihi/ui/<rev>/index.html 装载。',
    }),
  )
  document.title = 'Xaihi — 装载失败'
} else {
  const container = document.getElementById('xaihi-ui-root')
  if (container === null) {
    document.title = 'Xaihi — 装载失败'
  } else {
    // 必须真走 createRoot：这条探针要证的是"React 19 能在我们自己的文档里挂载"，
    // 用 appendChild 拼 DOM 正好把要证的东西绕过去（第一版就是这样，产物里没有 react-dom）。
    createRoot(container).render(
      <div data-xaihi-realm-probe="true" style={{ padding: 16, font: '13px/1.6 ui-monospace,monospace' }}>
        <strong>Xaihi 文档 realm 探针（不是工作台）</strong>
        <br />
        {`rev=${realm.boot.rev} · node=${realm.boot.node ?? ''}`}
        <br />
        界面内容等搬运树建出来之后由 main.tsx 挂载。
      </div>,
    )
  }
}
