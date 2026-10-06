/** 桌面壳"独立成窗"能力的探测与**可见**退化（ADR-0011 决定 4）。 */

/** 节点寻址段的形状与两侧保持一致：壳侧 `xaihi-window-policy.ts` 与本仓 `packages/core/src/routes.ts` 的 `NODE_PATTERN`。 */
const NODE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u

/**
 * Xaihi 文档路由的形状，与壳侧 0002/0007 的 `XAIHI_DOCUMENT_PATH` 逐字同一条：
 * 被嵌在产品文档里的那一层要替自己的 iframe 转达开窗请求（子帧拿不到 preload），
 * 转达时必须自带这份路径 —— 本地先按形状收住，坏路径不该跑到 IPC 那一步。
 */
const DOCUMENT_PATH_PATTERN = /^\/xaihi\/ui\/[0-9a-f]{12}\/index\.html$/u

/** 一次开窗的结果：`alreadyOpen` 为真表示聚焦了既有的那个窗，而不是新开了一个。 */
export interface XaihiWindowOpening {
  readonly windowId: number
  readonly alreadyOpen: boolean
}

/** 壳上的动词；第二个参数是 0007 那条转达分支，缺省时目标取自发起者自己的文档。 */
export type XaihiWindowOpener = (node: string, documentPath?: string) => Promise<XaihiWindowOpening>

/**
 * 探测结果只有两种形态，且**不支持时必须带原因**。
 * 没有"读不到就当支持"的分支——那等于伪造宿主没说过的话。
 */
export type XaihiWindowCapability =
  | { readonly supported: true, readonly shell: 'xaihi-desktop', readonly opener: XaihiWindowOpener }
  | { readonly supported: false, readonly reason: XaihiWindowUnavailableReason }

/** `not-a-function` 留给"形状对但动词不是函数"这种半接的壳，与"根本没有壳"要分得开。 */
export type XaihiWindowUnavailableReason = 'no-shell-surface' | 'stock-shell' | 'not-a-function'

interface ShellSurface {
  readonly dshDesktop?: {
    readonly xaihiWindow?: {
      readonly open?: (node: string, documentPath?: string) => Promise<XaihiWindowOpening>
    }
  }
}

/**
 * 从任意作用域（`globalThis`、测试替身、iframe 的 window）读出开窗动词。
 * @param scope - the object to probe; `undefined` is accepted and reported as unsupported.
 * @returns either an opener, or the reason this surface cannot open a window.
 */
export function readXaihiWindowCapability (scope: unknown): XaihiWindowCapability {
  const surface = scope as ShellSurface | null | undefined
  if (surface === null || surface === undefined || typeof surface !== 'object') {
    return { supported: false, reason: 'no-shell-surface' }
  }
  const desktop = surface.dshDesktop
  if (desktop === undefined || desktop === null || typeof desktop !== 'object') {
    // 官方桌面端与 `dsh web` 走这一格：那里确实没有 Xaihi 的窗动词，界面要照着说。
    return { supported: false, reason: 'no-shell-surface' }
  }
  const windowApi = desktop.xaihiWindow
  if (windowApi === undefined || windowApi === null) {
    // 有壳、但不是我们打过 0001 的那一份：报 stock-shell，别和"根本没注入"混成一个词。
    return { supported: false, reason: 'stock-shell' }
  }
  if (typeof windowApi.open !== 'function') return { supported: false, reason: 'not-a-function' }
  // 两个参数都要转过去：只带 node 的包装层会把 0007 的转达路径静默吃掉（实测的"半接"就长这样）。
  return { supported: true, shell: 'xaihi-desktop', opener: (node, documentPath) => windowApi.open!(node, documentPath) }
}

/** 开窗的结果同样只有两种，失败带原因；IPC 抛回来的原文透传，不重写成"未知错误"。 */
export type OpenNodeWindowResult =
  | { readonly ok: true, readonly opening: XaihiWindowOpening }
  | { readonly ok: false, readonly reason: 'invalid-node-id' | 'invalid-document-path' | XaihiWindowUnavailableReason | `ipc-failed: ${string}` }

/**
 * 为一个节点请求独立窗：先本地按形状收 node 与（可选的）文档路径，再交给壳。
 * @param scope - the surface to probe for the shell verb.
 * @param node - a manifest id; invalid ids never reach IPC.
 * @param documentPath - 0007 的转达分支：由产品文档替被嵌的 Xaihi 帧来问时给自家文档路径；
 *   缺省表示"发起者自己就是那份文档"。形状不合本地就拒，不喂给 IPC。
 */
export async function openNodeWindow (
  scope: unknown,
  node: string,
  documentPath?: string,
): Promise<OpenNodeWindowResult> {
  if (typeof node !== 'string' || !NODE_ID_PATTERN.test(node)) return { ok: false, reason: 'invalid-node-id' }
  if (documentPath !== undefined && (typeof documentPath !== 'string' || !DOCUMENT_PATH_PATTERN.test(documentPath))) {
    return { ok: false, reason: 'invalid-document-path' }
  }
  const capability = readXaihiWindowCapability(scope)
  if (!capability.supported) return { ok: false, reason: capability.reason }
  try {
    return { ok: true, opening: await capability.opener(node, documentPath) }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: `ipc-failed: ${detail}` }
  }
}
