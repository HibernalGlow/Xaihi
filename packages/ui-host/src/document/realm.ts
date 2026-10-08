/**
 * 文档那一侧的**管道**：读启动信息、建桥、报告协商结果、把根节点交出去。
 *
 * 它刻意不认识任何界面内容（`main.tsx` 才认识 App）。为什么拆开：
 * 搬运树还没建得出来（2026-10-06 17:45 复测 8 条错，六个成因，逐条挂在 ADR-0009 的 ① 那一行；
 * 今天从 43 条降到 8 条的是搬运批补的两条解析规则），而"这一份文档是不是真的
 * React 19、桥是不是真的能和外层往返、产物没配时是不是真的显示退化"这三件事
 * 不该等整棵树搬完才第一次被验证 —— 那正是最贵的一批假设。
 *
 * @module xaihi-ui/document/realm
 */

import { version as reactVersion } from 'react'
import { NODE_CAPABILITY_IDS, REQUIRED_CAPABILITIES } from '@hibernalglow/xaihi-sdk/bridge'
import { createDocumentBridge, createHttpDocumentBridge, type DocumentBridge } from '@hibernalglow/xaihi-sdk/bridge'
import { createLogger } from '../lib/logger.ts'
import { createPersistedState } from '../client/document-host.ts'

/** 把上一次跑留下的标记读出来（形状不认识时按空处理，不让取证页因为一份旧数据就画不出来）。 */
function readMarks(data: unknown): string[] {
  const marks = (data as { marks?: unknown } | undefined)?.marks
  return Array.isArray(marks) ? marks.filter((row): row is string => typeof row === 'string') : []
}

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
  /** 协商读数的口子：进日志模块（`xiranite:realm`）并记进 `__XAIHI_REALM__.lines`，不再画在页面上。 */
  report: (line: string) => void
}

/**
 * 协商读数去哪儿了（使用者 2026-10-07 拍板：左下角那块黑框日志不再保留）：
 * - 每行走**日志模块**（`createLogger('realm')` ⇒ consola `xiranite:realm`，配置了后端时
 *   同一份结构化 envelope 也会进 `/logs` 传输）；
 * - 同时留在 `reportLines`（随 `__XAIHI_REALM__.lines` 读回）：活体取证脚本与现场诊断
 *   要的是**结构化读数**，不是 console 排版解析。
 * 原先那块 `position:fixed` 黑底协商板（`data-xaihi-bridge="negotiation"`）随这条决定撤掉；
 * "不打开控制台也读得回来"的那部分职责由 `BackendStatusBanner`（bridge === null 的可见退化）
 * 与 `realm-entry` 探针板（专门的取证页）继续承担。
 */

/** 读数留最后多少行：握手那行（granted/refused）是判据本身，不能被后面的往返读数顶掉。 */
const MAX_REPORT_LINES = 12

/** 协商读数的现场账本；`__XAIHI_REALM__.lines` 暴露的就是这一份（同一个数组引用）。 */
const reportLines: string[] = []

function makeReport (): (line: string) => void {
  const logger = createLogger('realm')
  return (line: string) => {
    // 轮询期间同一行每 200ms 重发一次：去重让日志与账本都只记一次变化。
    if (reportLines[reportLines.length - 1] === line) return
    reportLines.push(line)
    if (reportLines.length > MAX_REPORT_LINES) reportLines.shift()
    logger.info(line)
  }
}

/** 顶层窗那次会话的号：只要合路由那侧的形状（16–64 位十六进制）。它是会话记账，不是凭据。 */
function hostSessionId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 起好这一份文档的 realm。
 * @returns 启动信息、桥，以及协商读数的口子（进日志模块，不再画在页面上）。
 */
export function startRealm(): Realm | null {
  const boot = (globalThis as { __XAIHI_UI__?: XaihiUiBoot }).__XAIHI_UI__
  if (boot === undefined) return null
  const report = makeReport()
  const origin = window.location.origin
  // 对面是谁，取决于这一份文档落在哪个容器里（ADR-0011 的三条路里被拍下来的那条）：
  // 被嵌在产品槽里 ⇒ 父帧就是外壳，走 postMessage；桌面壳自己开出来的顶层窗 ⇒
  // 既没有父帧也没有 opener，走 Xaihi 自己的 `/xaihi/host` 路由。
  // 两条载体共用同一套消息与失败词，界面因此不分叉。
  const isTopLevel = window.parent === window
  const bridge = isTopLevel
    ? createHttpDocumentBridge({
      endpoint: `${boot.apiBase}/host`,
      sid: hostSessionId(),
      requested: [...NODE_CAPABILITY_IDS],
      selfOrigin: origin,
    })
    : createDocumentBridge(
      (message) => window.parent.postMessage(message, origin),
      origin,
      [...NODE_CAPABILITY_IDS],
    )
  if (!isTopLevel) {
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window.parent) return
      void bridge.receive(event.data, event.origin)
    })
  }
  report(`xaihi realm: rev=${boot.rev} node=${boot.node ?? ''} React=${reactVersion} 载体=${isTopLevel ? 'host-http' : 'postMessage'} · 等宿主握手`)
  bridge.hello(boot.node ?? '')
  // 协商成功之后主动跑一次**真动词**：`config.get` 会穿过桥落到外壳的 settings 面，
  // 对岸应答不回来就是 timeout/refused。只看 granted=[…] 证的是"外壳接了这条桥"，
  // 而这条 realm 要的是"外壳能用上游那 9 组能力面服务这个文档"。
  const probeRoundTrip = async (): Promise<void> => {
    const started = Date.now()
    try {
      const value = await bridge.call('config.get')
      const text = JSON.stringify(value) ?? 'undefined'
      report(`xaihi realm: config.get 往返成功 ${String(Date.now() - started)}ms · ${text.slice(0, 160)}`)
    } catch (error) {
      const reason = (error as { reason?: string }).reason ?? 'unknown'
      const detail = (error as { detail?: string }).detail ?? ''
      report(`xaihi realm: config.get 没走通 reason=${reason}${detail === '' ? '' : ` · ${detail}`}（${String(Date.now() - started)}ms）`)
    }
  }
  /**
   * 文档那半边的持久路径也走一遍**生产代码**（`createPersistedState`）：
   * 预取 → 同步改本地 → 往后刷。判据刻意要跨一次**框的重载**才成立：
   * 第一次跑写一条标记，第二次跑必须 `hydrate()` 读到它并把上一次的标记带在本地值里。
   * 只量外壳那半边不算数——同步形状有没有被破坏（`getData()` 立刻可读）发生在这一侧。
   */
  const probeStatePersistence = async (): Promise<void> => {
    const node = boot.node === '' || boot.node === undefined ? 'realm-probe' : boot.node
    const state = createPersistedState({ bridge, node })
    const marker = `run@${String(Date.now())}`
    try {
      const had = await state.hydrate()
      const before = JSON.stringify(state.getData() ?? null)
      state.patchData({ marks: [...(readMarks(state.getData())), marker] })
      // 同步那份立刻就得是新的：上游 `getData()` 是同步返回的，这条是"节点 UI 一行不改"的关键。
      const syncedImmediately = JSON.stringify(state.getData() ?? null)
      await state.flush()
      const err = state.syncError()
      report(`state 半边（node=${node}）：预取到=${String(had)} 改前=${before.slice(0, 90)} `
        + `本地即时=${syncedImmediately.slice(0, 90)} 刷后=${err === null ? 'ok' : `失败 ${err}`}`)
    } catch (error) {
      const reason = (error as { reason?: string })?.reason ?? 'unknown'
      report(`state 半边没走通：reason=${reason}（这条是文档侧的预取失败，不是外壳没答）`)
    }
  }
  let timer: ReturnType<typeof setInterval> | null = null
  const stopPolling = (): void => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
  const poll = (): void => {
    const ready = bridge.ready()
    if (ready !== null) {
      stopPolling()
      // degraded 要分两行念：必给的三组（contract/state/env）里任何一条被拒，文档里的节点表面就跑不
      // 起来；其余那几组是"今天外壳确实没有对应物"。混成一句"必给却没兑现"会把没接的东西说成缺勤，
      // 而 workspace/runner/clipboard 这些本来就在提案账上（P1 等）。
      const requiredSet = new Set<string>(REQUIRED_CAPABILITIES)
      const required = ready.refused.filter((id) => requiredSet.has(id))
      const others = ready.refused.filter((id) => !requiredSet.has(id))
      const reasonOf = (id: string) => ready.degraded.find((row) => row.capability === id)?.reason ?? '外壳没有提供这一组'
      // env 带没带快照要单独念：它过去是"granted 里写了 env、ready 里却没有这一格"，
      // 光看 granted 列表读不出来（界面那头表现为 host.env 抛 refused）。
      const envLine = ready.env === undefined ? 'env 快照：没带' : `env 快照：theme=${ready.env.theme} platform=${ready.env.platform}`
      report(`xaihi realm: rev=${boot.rev} React=${reactVersion} granted=[${ready.granted.join(', ')}] refused=[${ready.refused.join(', ')}] ${envLine}`)
      if (required.length > 0) report(`必给却没兑现：${required.map((id) => `${id}: ${reasonOf(id)}`).join(' | ')}`)
      if (others.length > 0) report(`其余没接（在提案账上）：${others.map((id) => `${id}: ${reasonOf(id)}`).join(' | ')}`)
      void probeRoundTrip()
      void probeStatePersistence()
      return
    }
    report(`xaihi realm: rev=${boot.rev} React=${reactVersion} · 等宿主握手（没应答=这条桥还没人接）`)
  }
  timer = setInterval(poll, 200)
  // 8 秒后降频但**不停**：宿主冷启动可能让握手晚于这扇窗才落地。实测形状（2026-10-07 壳内）：
  // 界面自己（`useBridgeReady` 的独立轮询）早已拿到 ready、工作台照常挂出，而协商读数冻在
  // 「等宿主握手」——硬停让 ready 落地时再也没人补 granted/refused，账本与界面各说各话。
  // 读数要"在界面上读得回来"（决定 4），轮询必须活得比宿主的慢启动久。
  setTimeout(() => {
    if (timer === null) return
    clearInterval(timer)
    timer = setInterval(poll, 1000)
  }, 8000)
  // 句柄留在 window 上：现场读数（真宿主里那次）需要能从外层按同源 iframe 打一次调用。
  // `lines` 是协商读数账本（与 `reportLines` 同一引用），取证脚本从这里结构化读回。
  ;(globalThis as { __XAIHI_REALM__?: { boot: XaihiUiBoot; bridge: DocumentBridge; probe: () => Promise<void>; lines: readonly string[] } }).__XAIHI_REALM__ = {
    boot,
    bridge,
    probe: probeRoundTrip,
    lines: reportLines,
  }
  return { boot, bridge, report }
}
