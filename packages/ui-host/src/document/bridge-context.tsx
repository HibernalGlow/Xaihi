/**
 * 把这一份文档的桥递给整棵搬运树。
 *
 * 为什么要有这一层：桥是在 `startRealm()` 里建的（模块作用域，早于第一次 `createRoot`），
 * 而真正消费它的两处住在树深处 —— `store/workspaceContext.tsx`（工作区快照的往返）
 * 与 `components/modules/hostApi.ts`（节点 host 面）。搬来的组件里没有"我这份文档的桥"
 * 这个概念，所以既不给他们加 prop（那是改 231 个文件的形状），也不起第二个模块单例
 * （同一份文档里两个单例在 StrictMode 下会各建一份）：用一个 context 从上往下递。
 * 读不到时是 `null`（"这份文档不在宿主里"），不是"没接线所以我替你造一个"——
 * 后者会把"没有宿主"报成"宿主什么都答不上来"（ADR-0011 决定 4 要的正是这两种能分开）。
 *
 * 为什么还要 `useBridgeReady()`：`startRealm()` **立刻**返回，握手是异步的，握手落地之前
 * 桥对象存在、但每条调用都抛 `not-ready`。消费方要的是"什么时候可以开始问"，而不是
 * "桥对象有没有" —— 这两件事在同一次装载里先后成立，用一个布尔分开才不会把在飞的握手
 * 读成失败（`realm.ts:137` 的 200ms 轮询是同一条口径）。
 *
 * @module xaihi-ui/document/bridge-context
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'

/** 桥的默认值是 `null`：没有 `<DocumentBridgeProvider>` 就是"不在宿主里"，不是"还没接"。 */
const DocumentBridgeContext = createContext<DocumentBridge | null>(null)

/**
 * 把 realm 那条桥放进树里。
 * @param props.bridge - `startRealm()?.bridge`；`startRealm()` 返回 null（缺启动信息）时传 null。
 */
export function DocumentBridgeProvider({ bridge, children }: {
  bridge: DocumentBridge | null
  children: ReactNode
}): React.JSX.Element {
  return <DocumentBridgeContext.Provider value={bridge}>{children}</DocumentBridgeContext.Provider>
}

/**
 * 读这一份文档的桥。
 * @returns 桥；没有 provider 或 provider 给的是 null 时返回 null（消费方自己决定怎么退化）。
 */
export function useDocumentBridge(): DocumentBridge | null {
  return useContext(DocumentBridgeContext)
}

/** 握手轮询间隔：与 `realm.ts:159` 同一量级（那边是 200ms），不加第二个节拍。 */
const HANDSHAKE_POLL_MS = 200

/**
 * 握手落地了没有。
 *
 * 只在"还没落地"时轮询，落地即停（不常驻定时器）；`bridge` 换成另一条时重新判。
 * @param bridge - `useDocumentBridge()` 读到的桥。
 * @returns 可以开始问桥了没有。
 */
export function useBridgeReady(bridge: DocumentBridge | null): boolean {
  const [ready, setReady] = useState<boolean>(() => bridge !== null && bridge.ready() !== null)

  useEffect(() => {
    if (bridge === null) {
      setReady(false)
      return undefined
    }
    if (bridge.ready() !== null) {
      setReady(true)
      return undefined
    }
    setReady(false)
    const timer = setInterval(() => {
      if (bridge.ready() === null) return
      setReady(true)
      clearInterval(timer)
    }, HANDSHAKE_POLL_MS)
    return () => { clearInterval(timer) }
  }, [bridge])

  return ready
}
