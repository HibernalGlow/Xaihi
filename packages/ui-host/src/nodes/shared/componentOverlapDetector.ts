/**
 * 节点与界面组件互相遮盖（Overlap / Occlusion）检测器。
 *
 * 遵循 ADR-0034（容器级自适应体系）与 ADR-0010（品牌一律 Xaihi）：
 * 用于在不同尺寸（tall-narrow, short-wide, square, workspace 等）和布局形态下，
 * 自动扫描 DOM 树中所有独立组件（SectionCard、HeroActionBar、HeaderBanner、交互面板等），
 * 计算两两之间的物理像素包围盒相交区域，防止因 CSS flex-1 压缩、overflow 丢失、
 * 绝对定位漂浮或负 margin 导致的界面重叠遮挡缺陷。
 */

export interface OverlapRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface OverlapViolation {
  elementA: HTMLElement
  elementB: HTMLElement
  labelA: string
  labelB: string
  rectA: OverlapRect
  rectB: OverlapRect
  intersection: OverlapRect & { area: number }
}

export interface OverlapDetectorOptions {
  /**
   * 判定重叠的最小像素容差阈值（默认 4px）。
   * 小于该阈值的微小相交视为边框贴合或正常外边距重叠，不予误报。
   */
  threshold?: number
  /**
   * 参与扫描的候选组件选择器。
   * 默认覆盖 MD3E 体系的核心语义槽位及独立卡片。
   */
  selectors?: string[]
  /**
   * 忽略的选择器（如背景贴片、浮动菜单的 Portal、隐藏占位等）。
   */
  ignoreSelectors?: string[]
}

export const DEFAULT_OVERLAP_COMPONENT_SELECTORS = [
  '[data-slot="md3e-section-card"]',
  '[data-slot="md3e-hero-action-bar"]',
  '[data-slot="md3e-header-banner"]',
  '[data-slot="primary-action"]',
  '[data-slot="card"]',
  '[data-slot="module-panel"]',
  '[data-slot="table-container"]',
]

export const DEFAULT_OVERLAP_IGNORE_SELECTORS = [
  '[aria-hidden="true"]',
  '[data-state="closed"]',
  '.pointer-events-none',
]

/**
 * 从元素中提取人类可读的组件标识，便于测试报错与定位。
 */
export function getElementComponentLabel(element: HTMLElement): string {
  const slot = element.getAttribute("data-slot")
  const testId = element.getAttribute("data-testid")
  const role = element.getAttribute("role")
  const ariaLabel = element.getAttribute("aria-label")
  const title =
    element.getAttribute("title") ||
    element.querySelector("h1, h2, h3, h4, span.font-black, [data-slot='title']")?.textContent?.trim()

  const parts: string[] = []
  if (slot) parts.push(`[slot="${slot}"]`)
  if (testId) parts.push(`[testid="${testId}"]`)
  if (role) parts.push(`[role="${role}"]`)
  if (title) parts.push(`"${title.slice(0, 30)}"`)
  else if (ariaLabel) parts.push(`aria="${ariaLabel.slice(0, 30)}"`)

  return parts.length > 0 ? parts.join(" ") : `<${element.tagName.toLowerCase()}.${Array.from(element.classList).slice(0, 2).join(".")}>`
}

/**
 * 检查单个元素是否处于可见渲染状态。
 */
export function isElementVisiblyRendered(element: HTMLElement): boolean {
  if (typeof window === "undefined") return true
  const style = window.getComputedStyle(element)
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false
  }
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/**
 * 计算两个矩形包围盒的相交重叠区域。
 */
export function computeRectIntersection(
  rectA: DOMRect | OverlapRect,
  rectB: DOMRect | OverlapRect,
): (OverlapRect & { area: number }) | null {
  const left = Math.max(rectA.left, rectB.left)
  const right = Math.min(rectA.right, rectB.right)
  const top = Math.max(rectA.top, rectB.top)
  const bottom = Math.min(rectA.bottom, rectB.bottom)

  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)

  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    area: width * height,
  }
}

/**
 * 核心检查函数：在给定的根容器中检测是否存在组件互相遮盖。
 *
 * @param root 需要检测的根元素（如 Md3eNodeSurface 内部容器）
 * @param options 检测配置
 * @returns 违规重叠列表；长度为 0 表示没有组件互相遮盖
 */
export function detectComponentOverlaps(
  root: HTMLElement,
  options: OverlapDetectorOptions = {},
): OverlapViolation[] {
  const {
    threshold = 4,
    selectors = DEFAULT_OVERLAP_COMPONENT_SELECTORS,
    ignoreSelectors = DEFAULT_OVERLAP_IGNORE_SELECTORS,
  } = options

  // 1. 收集所有候选组件元素
  const candidateElements = new Set<HTMLElement>()
  for (const selector of selectors) {
    const matched = root.querySelectorAll<HTMLElement>(selector)
    matched.forEach((el) => {
      // 过滤掉明确忽略的元素
      const isIgnored = ignoreSelectors.some((ignoreSel) => el.matches(ignoreSel) || el.closest(ignoreSel) !== null)
      if (!isIgnored) {
        candidateElements.add(el)
      }
    })
  }

  const elements = Array.from(candidateElements)
  const violations: OverlapViolation[] = []

  // 2. 两两配对碰撞检测
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elA = elements[i]!
      const elB = elements[j]!

      // 规则 A：祖先-后裔嵌套属于正常包含关系，不是互相遮盖
      if (elA.contains(elB) || elB.contains(elA)) {
        continue
      }

      // 规则 B：必须都是可见渲染元素
      if (!isElementVisiblyRendered(elA) || !isElementVisiblyRendered(elB)) {
        continue
      }

      const rectA = elA.getBoundingClientRect()
      const rectB = elB.getBoundingClientRect()

      // 规则 C：物理尺寸必须有效
      if (rectA.width <= 0 || rectA.height <= 0 || rectB.width <= 0 || rectB.height <= 0) {
        continue
      }

      const intersection = computeRectIntersection(rectA, rectB)
      if (!intersection) {
        continue
      }

      // 规则 D：交集宽度和高度都必须超过容差阈值
      if (intersection.width > threshold && intersection.height > threshold) {
        violations.push({
          elementA: elA,
          elementB: elB,
          labelA: getElementComponentLabel(elA),
          labelB: getElementComponentLabel(elB),
          rectA: {
            left: rectA.left,
            top: rectA.top,
            right: rectA.right,
            bottom: rectA.bottom,
            width: rectA.width,
            height: rectA.height,
          },
          rectB: {
            left: rectB.left,
            top: rectB.top,
            right: rectB.right,
            bottom: rectB.bottom,
            width: rectB.width,
            height: rectB.height,
          },
          intersection,
        })
      }
    }
  }

  return violations
}
