/**
 * **验证用的入口**：把一份真节点界面挂在桥背书的 host 面上，量「路线 (A) 能不能服务节点自己的界面」。
 *
 * 为什么要有它（而不是直接改生产入口）：`main.tsx` 与它的装配点在搬运 lane 手里正在重写，
 * 而这一格要证的不是"界面长什么样"，是**那条通路能不能把一个真组件的 host 动词送到对面**：
 * `startRealm` → 按容器选载体（顶层窗就是 `/xaihi/host`）→ `createDocumentHost` →
 * `toNodeHostApi` 折成组件读的扁名 → 渲染 `linedup` 的 `Component`。
 * 板子上明写这是验证载体，不是工作台。
 *
 * 读回口子（判据与探针都靠它们）：
 * - `[data-xaihi-nodeface]`：`host=bridge` 且握手已落地才出现；值里带节点名与 `granted=[…]`。
 * - `[data-xaihi-nodeface-state]`：桥对面那份状态读回来的样子（`read=ok` / `read=<原因>`）。
 * - `globalThis.__XAIHI_NODEFACE__`：`{ host, bridge, node }`，让外层能对同一份面发一次真写再回读。
 *
 * @module xaihi-ui/document/node-face-entry
 */

import { createRoot } from 'react-dom/client'
import { initI18n } from '@/i18n'
import linedupEntry from '@/nodes/linedup/entry'
import { NODE_CAPABILITY_IDS } from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentHost, createPersistedState } from '../client/document-host.ts'
import { toNodeHostApi } from '../client/node-host-bridge.ts'
import { startRealm } from './realm.ts'

void initI18n()

const NODE = 'xaihi-linedup'
/**
 * 这一格状态用的键：不用 URL 上那个节点键。`realm.ts` 握手后自己会跑一次 state 持久探测，
 * 写的是 `nodeState[boot.node]`——两处同写一格会撞乐观并发围栏，把判据自己搞成假红
 * （同一件事在 `realm-entry.tsx` 里记过一次）。组件的 `compId` 仍是 `NODE`：
 * 扁名那层的 `compId` 是"这一格卡"的身份，与状态键不是同一层（见 `node-host-bridge.ts`）。
 */
const STATE_NODE = 'xaihi-nodeface'
const HANDSHAKE_TRIES = 60

const root = document.getElementById('xaihi-ui-root')
const realm = startRealm()

if (root === null || realm === null) {
  document.title = 'Xaihi — 节点界面验证：装载失败'
  root?.replaceChildren(
    Object.assign(document.createElement('pre'), {
      textContent: realm === null
        ? '缺 window.__XAIHI_UI__：这份产物应由 /xaihi/ui/<rev>/index.html 装载'
        : '文档里没有 #xaihi-ui-root',
    }),
  )
} else {
  const { bridge } = realm
  const node = STATE_NODE
  const state = createPersistedState({ bridge, node })
  const host = toNodeHostApi(createDocumentHost({
    bridge,
    state,
    workspace: { listComponents: () => [], updateComponent: () => {} },
  }))
  // 握手之前不渲染组件：`createDocumentHost` 的每个动词都先 `requireReady`，
  // 早渲染的那一帧会把"还没握手"显示成组件自己的错，那是装配层的错账到界面头上。
  let tries = 0
  const timer = setInterval(() => {
    tries += 1
    const ready = bridge.ready()
    if (ready === null) {
      if (tries < HANDSHAKE_TRIES) return
      clearInterval(timer)
      root.replaceChildren(Object.assign(document.createElement('pre'), {
        dataset: { xaihiNodeface: 'no-handshake' },
        textContent: `等不到宿主握手（${String(HANDSHAKE_TRIES)} 次轮询用完）· 请求的组=${NODE_CAPABILITY_IDS.join(',')}`,
      }))
      return
    }
    clearInterval(timer)
    ;(globalThis as { __XAIHI_NODEFACE__?: unknown }).__XAIHI_NODEFACE__ = { host, bridge, state, node, compId: NODE }
    const Component = linedupEntry.Component
    const shell = document.createElement('div')
    shell.dataset.xaihiNodeface = `host=bridge node=${node} comp=${NODE} granted=[${ready.granted.join(',')}]`
    root.replaceChildren(shell)
    const stateLine = document.createElement('pre')
    stateLine.dataset.xaihiNodefaceState = 'pending'
    shell.appendChild(stateLine)
    void state.hydrate().then((had) => {
      stateLine.dataset.xaihiNodefaceState = had ? 'read=ok' : 'read=empty'
      stateLine.textContent = had
        ? `对面读回：${JSON.stringify(state.getData() ?? null).slice(0, 160)}`
        : '对面那一格还没存过东西（这不是失败，是首次）'
    }, (error: unknown) => {
      const err = error as { reason?: string; detail?: string }
      stateLine.dataset.xaihiNodefaceState = `read=${err?.reason ?? 'threw'}`
      stateLine.textContent = `读对面失败：${String(err?.reason ?? error)}${err?.detail === undefined ? '' : ` · ${err.detail}`}`
    })
    const mount = document.createElement('div')
    shell.appendChild(mount)
    createRoot(mount).render(<Component compId={node} host={host} />)
  }, 250)
}
