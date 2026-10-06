/**
 * 生成的 CSS 文本 → 文档：注入、顺序、回收、以及"不把全局重置漏给宿主"这件事的运行期那一半。
 *
 * 为什么必须走 JS 而不是 `<link>`：宿主给插件的只有 `client.js` 与 `client.<name>.js`
 * 两条 URL 形状，资源路由按 `/^client\.[\w.-]+\.js$/` 收，`client.css` 根本发不出来
 * （`dsh-client-modules/lib/index.js:169,913-947`）。所以构建期把整棵样式树装成字符串
 * （`scripts/build-css.mjs` → `generated/client-css.ts`），这里注进一个 `<style>`。
 *
 * 顺序为什么是"活的"：上游 `<Xiranite>/src/main.tsx:13-25` 那份顺序是
 * `styles/tailwind.css` → `index.css` → `styles/themes/index.css` → 六份 design 配方，
 * 而这些表**不进任何 `@layer`**，而 CSS Cascade 4 里无层声明压过 `@layer utilities` 里的
 * 工具类；同特异性时又靠先后决胜。这份顺序已经在**产物内部**烧死了（构建期由
 * `checkOrder` 那把尺钉住，九段标记逐个查字节位置），运行期只需要保证：
 *  1. 我们的 `<style>` 里就是这个字符串本身，不拆成多张表去重排；
 *  2. 它排在宿主自己那张表之后（append 到 `<head>` 尾部），
 *     否则我们的无层声明会盖掉宿主后加载的界面；
 *  3. 同一份 CSS 只进一次：`registerStyles()`（`client/styles.ts`，搬运批 owns）
 *     已经把 `CLIENT_CSS` 拼在它那张表里，两条路都跑就会往文档里塞第二份 574 KB。
 *     `findExistingSheet()` 因此同时认两个 id 与"内容里已含本产物"这一种情况。
 *
 * 全局重置怎么不外泄：构建期把"能命中宿主任意 DOM"的无层规则改写成
 * `:is(.xaihi-workbench, [data-xaihi-ui]) …`，设计语言的门从 `:root[data-app-design=…]`
 * 改挂到 `[data-xaihi-ui][data-app-design=…]`（实测：整形前这类规则 693 条，其中 `:root` 门
 * 665 条；整形后剩 0 条危险形状 + 5 条纯自定义属性块）。于是运行期欠下两件事，就是这个模块
 * 干的两件事：**给面板根挂 `data-xaihi-ui`**，以及**把门属性镜像到 Radix portal 容器**
 * ——portal 的内容挂在 `document.body` 下，不在我们子树里，不镜像就会得到"对话框全裸"。
 * 镜像只在"最后一次交互发生在我们根内"时发生，否则会连带标记宿主自己开的弹层。
 *
 * 回收：`ctx.effect` 拿到的是同一个 disposer；引用计数归零才摘 `<style>`、断开 observer、
 * 还原我们改过的属性。DSH 的插件重载不是"文档换新"，是同一个 document 里再跑一次入口，
 * 不摘干净就是每张表越叠越厚。
 *
 * @module xaihi-ui/styles-inject
 */

import { CLIENT_CSS } from './generated/client-css.ts'

/** 我们这张表的 id；与 `client/styles.ts` 的 `xaihi-ui-styles` 分开，两张表各有各的账。 */
export const DESIGN_STYLE_ID = 'xaihi-design-css'
/** 构建期 SCOPE_ROOT 的锚点。改名要同时改 `scripts/build-css.mjs` 里的那份常量。 */
export const SCOPE_ATTRIBUTE = 'data-xaihi-ui'
/** 设计语言的门属性前缀：`apply.ts` 写什么，这里就镜像什么（不猜具体值）。 */
const GATE_ATTRIBUTES = ['data-app-design', 'data-design-color', 'data-design-shape', 'data-design-typography', 'data-design-motion', 'data-design-states', 'data-design-elevation', 'data-design-geometry', 'data-design-density', 'data-design-color-control', 'data-design-color-field', 'data-design-color-nav']

/** Radix / sonner 的 portal 根形状。这条名单只用来**认候选**，真标记还要过交互闸门。 */
const PORTAL_SELECTOR = `[data-radix-portal], [data-radix-popper-content-wrapper], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-sonner-toaster]`

/** 读得回的状态：DSH 里看不到控制台也不算能查，所以挂一份到 globalThis。 */
export interface XaihiCssStats {
  injected: boolean
  owners: number
  cssBytes: number
  parsedRules: number
  scopedRoots: number
  portalsMarked: number
  portalsSkipped: number
  lastSkipReason: string
}

const stats: XaihiCssStats = {
  injected: false, owners: 0, cssBytes: 0, parsedRules: 0,
  scopedRoots: 0, portalsMarked: 0, portalsSkipped: 0, lastSkipReason: '',
}

declare global {
  interface Window {
    __XAIHI_CSS__?: XaihiCssStats
  }
}

/** 跨 realm 安全：文档表元素用 `nodeType`/`tagName` 认，不用 `instanceof`
 *  （`client/document-frame.tsx` 那个 `<iframe>` 里的 `Element` 不是同一个类，
 *   `instanceof` 在跨 realm 时恒假——症状是"样式注了两次"或"portal 一条都不标"）。 */
function asElement(node: unknown): Element | null {
  if (node === null || typeof node !== 'object') return null
  const candidate = node as { nodeType?: number, tagName?: string, matches?: unknown }
  if (candidate.nodeType !== 1) return null
  return node as Element
}

/** 已经有人在文档里放这份 CSS 了吗（我们自己的表，或搬运批那张拼了 CLIENT_CSS 的表）。 */
function findExistingSheet(doc: Document, css: string): HTMLStyleElement | null {
  const marker = css.slice(0, 512)
  const byId = doc.getElementById(DESIGN_STYLE_ID)
  const byIdElement = asElement(byId)
  if (byIdElement !== null && byIdElement.tagName === 'STYLE') return byIdElement as HTMLStyleElement
  for (const node of Array.from(doc.getElementsByTagName('style'))) {
    const element = asElement(node)
    if (element === null) continue
    const text = (element as unknown as { textContent?: string }).textContent
    if (typeof text === 'string' && text.includes(marker)) return element as unknown as HTMLStyleElement
  }
  return null
}

function parsedRuleCount(tag: HTMLStyleElement, doc: Document): number {
  // 只在表已经进了 CSSOM 时才读数；happy-dom / 早期文档里拿不到就当 0，不编数字。
  const cssRules = tag.sheet?.cssRules
  if (typeof cssRules?.length === 'number') return cssRules.length
  return doc.contains(tag) ? 0 : 0
}

function gateValues(root: Element): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const name of GATE_ATTRIBUTES) {
    const value = root.getAttribute(name)
    if (value !== null) out.push([name, value])
  }
  return out
}

/** 我们改过谁的哪些属性，回收时按这份账还原（不顺手清掉别人本来就有的值）。 */
type Restored = Array<{ element: Element, attribute: string, previous: string | null }>

function markElement(root: Element, gates: Array<[string, string]>, undo: Restored, marked?: Set<Element>): void {
  const setOnce = (attribute: string, value: string) => {
    if (root.getAttribute(attribute) !== null) return
    undo.push({ element: root, attribute, previous: null })
    root.setAttribute(attribute, value)
  }
  setOnce(SCOPE_ATTRIBUTE, 'true')
  for (const [attribute, value] of gates) setOnce(attribute, value)
  // 计的是"被我们标了几个元素"，按元素去重：同一个 portal 反复开合不该把数越加越大。
  marked?.add(root)
}

export interface InjectDesignCssOptions {
  /** 面板根：`.xaihi-workbench` 那个容器，或它的外层。给它挂作用域锚点。 */
  root?: Element | null
  /** 当前设计语言的门属性；不给就从 `root` 上现读（`apply.ts` 已经写过的话）。 */
  designAttributes?: Record<string, string>
  document?: Document
}

/** 一个挂载点自己的账：根、门、我们改过什么、标过哪些元素。 */
interface ScopeSession {
  root: Element | null
  gates: Array<[string, string]>
  undo: Restored
  marked: Set<Element>
}

/**
 * 表与 observer 是**文档级一份**，session 是**挂载点级若干份**。
 * 分成两层不是讲究：React 18 StrictMode 的双挂载与 DSH 的插件重载都会让引用数真的 >1。
 * 上一版每个调用各自起 observer、各自按 `addedHere` 摘表，于是"第一个主人先 dispose、
 * 最后那个后 dispose"这条路上表和 observer 都留在文档里 —— 实测摘不掉的 574 KB 第二张表，
 * 外加每开一次面板就多一个往全局计数里灌水的 observer。
 */
const sessions: ScopeSession[] = []
let sharedTag: HTMLStyleElement | null = null
let sharedCreated = false
let stopSharedObserver: (() => void) | null = null

function scopedRootCount(): number {
  let total = 0
  for (const session of sessions) total += session.marked.size
  return total
}

function restoreUndo(undo: Restored): void {
  for (const entry of undo) {
    if (entry.previous === null) entry.element.removeAttribute(entry.attribute)
    else entry.element.setAttribute(entry.attribute, entry.previous)
  }
  undo.length = 0
}

/**
 * 注入 CSS 并建立作用域。返回 disposer，交给 `ctx.effect`。
 * 幂等：同一份内容已在文档里时只加引用计数，不再塞第二张 574 KB 的表。
 */
export function injectDesignCss(options: InjectDesignCssOptions = {}): () => void {
  const doc = options.document ?? (typeof document === 'undefined' ? undefined : document)
  if (doc === undefined || typeof doc.head === 'undefined') return () => {}
  stats.owners++
  stats.cssBytes = CLIENT_CSS.length
  stats.injected = true

  if (sharedTag === null) {
    const existing = findExistingSheet(doc, CLIENT_CSS)
    if (existing !== null) {
      sharedTag = existing
      sharedCreated = false
    } else {
      const tag = doc.createElement('style')
      tag.id = DESIGN_STYLE_ID
      tag.setAttribute('data-xaihi-css', 'design')
      tag.textContent = CLIENT_CSS
      // append 到尾部：宿主的表在前，我们的无层声明才排在它后面（先后就是优先级）。
      doc.head.append(tag)
      sharedTag = tag
      sharedCreated = true
    }
  }
  stats.parsedRules = parsedRuleCount(sharedTag, doc)

  const undo: Restored = []
  const root = options.root ?? null
  const given: Array<[string, string]> = Object.entries(options.designAttributes ?? {}).map(([k, v]) => [k, v])
  // 门属性的出处按"谁最近写过"排：显式给的 > `documentElement`（`apply.ts:92` 写在那里）> 根上已有的。
  const gates: Array<[string, string]> = [...given]
  if (given.length === 0) {
    const seen = new Set<string>()
    for (const pair of [...gateValues(doc.documentElement), ...(root !== null ? gateValues(root) : [])]) {
      if (seen.has(pair[0])) continue
      seen.add(pair[0])
      gates.push(pair)
    }
  }
  const marked = new Set<Element>()
  if (root !== null) markElement(root, gates, undo, marked)
  const session: ScopeSession = { root, gates, undo, marked }
  sessions.push(session)
  stats.scopedRoots = scopedRootCount()

  if (stopSharedObserver === null) stopSharedObserver = observePortals(doc)

  return () => {
    restoreUndo(session.undo)
    const at = sessions.indexOf(session)
    if (at >= 0) sessions.splice(at, 1)
    stats.owners--
    stats.scopedRoots = scopedRootCount()
    if (stats.owners > 0) return
    stopSharedObserver?.()
    stopSharedObserver = null
    if (sharedCreated) sharedTag?.remove()
    sharedTag = null
    sharedCreated = false
    stats.injected = false
    stats.scopedRoots = 0
    stats.portalsMarked = 0
    stats.portalsSkipped = 0
    if (typeof window !== 'undefined') delete window.__XAIHI_CSS__
  }
}

function matchPortal(node: Element): Element | null {
  const matches = (element: Element, selector: string) =>
    typeof (element as unknown as { matches?: (s: string) => boolean }).matches === 'function'
    && (element as unknown as { matches: (s: string) => boolean }).matches(selector)
  if (matches(node, PORTAL_SELECTOR)) return node
  const nested = node.querySelector(PORTAL_SELECTOR)
  return nested
}

/**
 * portal 标记。两条闸门，一条都不能少：
 *  1. 只认 `PORTAL_SELECTOR` 形状的直接 body 子树；
 *  2. 只在"最后一次交互落在某个挂载点根内"时标记，并且只标进**那一个** session 的账
 *     ——宿主自己也用 Radix（它的 dist 里 `data-slot` 有 14 处），少了这条就会把我们的
 *     规则盖到宿主的弹层上。
 * 漏标的代价是对话框没样式；错标的代价是改宿主的脸。两边都记进 `stats`，能读回来。
 * 整个文档只有这一个 observer：多挂载点（StrictMode 双挂载、面板重开）不再各留一个。
 */
function observePortals(doc: Document): () => void {
  if (typeof doc.body === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  let interaction: ScopeSession | null = null
  const sessionFor = (target: Element): ScopeSession | null => {
    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      const session = sessions[index]
      if (session === undefined || session.root === null) continue
      if (target === session.root || session.root.contains(target)) return session
    }
    const holder = target.closest(`[${SCOPE_ATTRIBUTE}]`)
    if (holder === null) return null
    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      const session = sessions[index]
      if (session === undefined || session.root === null) continue
      if (session.root === holder || session.root.contains(holder)) return session
    }
    return null
  }
  const onInteraction = (event: Event) => {
    const target = asElement(event.target)
    interaction = target === null ? null : sessionFor(target)
  }
  doc.addEventListener('pointerdown', onInteraction, true)
  doc.addEventListener('keydown', onInteraction, true)

  const observer = new MutationObserver((records) => {
    if (sessions.length === 0) {
      stats.portalsSkipped++
      stats.lastSkipReason = 'no-root'
      return
    }
    for (const record of records) {
      for (const added of record.addedNodes) {
        const node = asElement(added)
        if (node === null) continue
        const portal = matchPortal(node)
        if (portal === null) continue
        if (portal.hasAttribute(SCOPE_ATTRIBUTE)) continue
        const session = interaction
        if (session === null) {
          stats.portalsSkipped++
          stats.lastSkipReason = 'last-interaction-outside'
          continue
        }
        markElement(portal, session.gates, session.undo, session.marked)
        stats.portalsMarked++
        stats.scopedRoots = scopedRootCount()
      }
    }
  })
  observer.observe(doc.body, { childList: true, subtree: false })
  return () => {
    observer.disconnect()
    doc.removeEventListener('pointerdown', onInteraction, true)
    doc.removeEventListener('keydown', onInteraction, true)
    interaction = null
  }
}

/** 给测试与排查用的一份读数（不许由它反推期望值，只用来在实机上核对）。 */
export function designCssStats(): XaihiCssStats {
  if (typeof window !== 'undefined') window.__XAIHI_CSS__ = stats
  return stats
}
