/**
 * 文档那一侧的**管道**：读启动信息、建桥、报告协商结果、把根节点交出去。
 *
 * 它刻意不认识任何界面内容（`main.tsx` 才认识 App）。为什么拆开：
 * 搬运树还没建得出来（实测 44 条错，属搬运批的台账），而"这一份文档是不是真的
 * React 19、桥是不是真的能和外层往返、产物没配时是不是真的显示退化"这三件事
 * 不该等整棵树搬完才第一次被验证 —— 那正是最贵的一批假设。
 *
 * @module xaihi-ui/document/realm
 */

import { version as reactVersion } from 'react'
import { NODE_CAPABILITY_IDS } from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentBridge, type DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'

/** 由 `/xaihi/ui/<rev>/index.html` 那份文档壳写进 window 的启动信息。 */
export interface XaihiUiBoot {
  rev: string
  apiBase: string
  bundleBase: string
  /** 要打开哪个节点的表面；空串 = 整个工作台。 */
  node?: string
}

export interface Realm {
  boot: XaihiUiBoot
  bridge: DocumentBridge
  /** 递给上层界面的 host 形状暂时由调用方自己接（桥的 caps 未授予时每条都会抛可读回的错）。 */
  report: (line: string) => void
}

/** 把结果显示在页面上：这条路径的判据要**不打开控制台**也能读回来。 */
function makeReport(): (line: string) => void {
  const box = document.createElement('pre')
  box.dataset.xaihiBridge = 'negotiation'
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;font:11px/1.5 ui-monospace,monospace;background:rgba(0,0,0,.72);color:#fff;max-width:70%;white-space:pre-wrap'
  document.body.appendChild(box)
  return (line: string) => { box.textContent = line }
}

/**
 * 起好这一份文档的 realm。
 * @returns 启动信息、桥，以及一个往页面上写字的口子。
 */
export function startRealm(): Realm | null {
  const boot = (globalThis as { __XAIHI_UI__?: XaihiUiBoot }).__XAIHI_UI__
  if (boot === undefined) return null
  const report = makeReport()
  const origin = window.location.origin
  const bridge = createDocumentBridge(
    (message) => window.parent.postMessage(message, origin),
    origin,
    [...NODE_CAPABILITY_IDS],
  )
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent) return
    void bridge.receive(event.data, event.origin)
  })
  report(`xaihi realm: rev=${boot.rev} node=${boot.node ?? ''} React=${reactVersion} · 等宿主握手`)
  bridge.hello(boot.node ?? '')
  const timer = setInterval(() => {
    const ready = bridge.ready()
    report(ready === null
      ? `xaihi realm: rev=${boot.rev} React=${reactVersion} · 等宿主握手（没应答=这条桥还没人接）`
      : `xaihi realm: rev=${boot.rev} React=${reactVersion} granted=[${ready.granted.join(', ')}] refused=[${ready.refused.join(', ')}]`)
    if (ready !== null) clearInterval(timer)
  }, 200)
  setTimeout(() => clearInterval(timer), 8000)
  return { boot, bridge, report }
}
