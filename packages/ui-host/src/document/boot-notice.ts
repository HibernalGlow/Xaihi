/**
 * 文档落在**没有桥**的那一侧时应该读出什么（ADR-0011 决定 4：可以退化，不许静默、不许伪造）。
 *
 * 只有纯函数：输入是"是不是顶层 + 壳面探测结果 + 寻址段"，输出是要画上去的行。
 * 画的部分住在 `main.tsx` / `realm-entry.tsx`，这样这一格不起 DOM 也能测，反向对照也在同一档。
 *
 * 分两个函数是因为**能声称的强度不一样**：
 * - `describeHostSurface` 只报现场事实（我在顶层窗还是 iframe 里、有没有独立窗动词），
 *   realm 探针用它 —— 探针从不等桥，所以它没有立场说"桥没答话"。
 * - `describeNoBridge` 说"桥等不到"，只有真的等过了才许用它（`main.tsx` 的那 8 秒）。
 *
 * @module xaihi-ui/document/boot-notice
 */

import { readXaihiWindowCapability } from '@hibernalglow/xaihi-sdk/bridge'

/** 一次判定要读到的现场；全部由调用方给，本模块不碰 `window`。 */
export interface BootProbe {
  /** 文档是不是顶层（没有 iframe 父帧）。顶层 = 桌面壳自己开出来的那个窗。 */
  readonly isTopLevel: boolean
  /** 壳面探测的作用域，通常是 `globalThis`；形状不认识时按"没有壳面"处理。 */
  readonly scope: unknown
  /** URL 上寻址到的节点；空串表示整个工作台。 */
  readonly node: string
}

/** 开窗能力的读回档：`supported` 或 SDK 那份原因词表里的一个。 */
export type WindowStatus = 'supported' | 'stock-shell' | 'no-shell-surface' | 'not-a-function'

export interface HostSurface {
  /** 落在哪一格：顶层窗还是别人的 iframe。 */
  readonly placement: 'top-level' | 'nested'
  readonly windowSupported: boolean
  readonly windowReason?: string
  readonly windowStatus: WindowStatus
  /** 单独摘出来的那句开窗读回，给按属性取值的判据用（不必再猜 lines 的第几行）。 */
  readonly windowLine: string
  /** 画给使用者看的行，第一行是"我在哪儿"。 */
  readonly lines: string[]
}

export interface NoBridgeNotice extends HostSurface {
  /** 为什么没桥：顶层根本没有父帧，还是 iframe 里那一侧没答话。 */
  readonly reason: 'top-level-no-bridge' | 'iframe-no-answer'
}

/** 开窗能力那句话；不可用时必须把原因写进去，不许只说"不可用"。 */
function capabilityOf (scope: unknown): { readonly status: WindowStatus, readonly supported: boolean, readonly reason?: string, readonly line: string } {
  const capability = readXaihiWindowCapability(scope)
  if (capability.supported === true) {
    return { status: 'supported', supported: true, line: '独立窗：可用（自家桌面壳已接 0001 的动词）' }
  }
  const reason = capability.reason
  const tail = reason === 'stock-shell'
    ? '官方桌面端没有这个动词，独立窗在这个宿主里不可用'
    : reason === 'not-a-function'
      ? '壳上有这个成员，但 open 不是函数（半接的壳）'
      : '不在桌面壳里（浏览器或官方 web 面）'
  return { status: reason, supported: false, reason, line: `独立窗：不可用 —— ${tail}` }
}

function whereLine (probe: BootProbe): string {
  const where = probe.node === '' ? '整份工作台的文档' : `节点 ${probe.node} 的文档`
  return probe.isTopLevel
    ? `这是桌面壳直接开出来的顶层窗，装的是${where}。`
    : `这份${where}装在外层 iframe 里，不是顶层窗。`
}

/**
 * 只报现场事实的那一档：我在哪个容器里、有没有独立窗动词。
 * @param probe - 现场读数。
 * @returns 逐行文案与开窗能力读回。
 */
export function describeHostSurface (probe: BootProbe): HostSurface {
  const capability = capabilityOf(probe.scope)
  return {
    placement: probe.isTopLevel ? 'top-level' : 'nested',
    windowSupported: capability.supported,
    windowReason: capability.reason,
    windowStatus: capability.status,
    windowLine: capability.line,
    lines: [whereLine(probe), capability.line],
  }
}

/**
 * 桥确实等不到时的那一档：在事实之上再加一句"这条通路现在到哪儿为止"。
 * 只有调用方**真的等过**（或顶层根本没有父帧可等）才许用。
 * @param probe - 现场读数。
 * @returns 带失败因果的文案。
 */
export function describeNoBridge (probe: BootProbe): NoBridgeNotice {
  const surface = describeHostSurface(probe)
  // 顶层窗里没有父帧，桥的那一侧不可能存在——这句是结构事实，不是猜的。
  // iframe 那一格必须等过才报，因为"还没答话"和"没装配"读起来是同一片空白。
  const cause = probe.isTopLevel
    ? '节点界面要经 DSH 工作台那一侧的桥（bridge-shell）才出内容，顶层没有父帧，这条通路还没接通。'
    : '桥的那一侧到点没答话：装配（bridge-shell）没挂上，或握手被拒 —— 外层给的 cap 与协议版本对不上时也走这一格。'
  return {
    ...surface,
    reason: probe.isTopLevel ? 'top-level-no-bridge' : 'iframe-no-answer',
    lines: [surface.lines[0], cause, surface.windowLine],
  }
}
