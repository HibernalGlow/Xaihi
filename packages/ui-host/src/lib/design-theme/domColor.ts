/**
 * 把任意浏览器可解析的 CSS 颜色读成一个 `#rrggbb`。
 *
 * 为什么走 canvas 而不是正则解析字符串：主题变量今天写的是 `oklch(...)`，
 * 自定义主题里可能是 `color-mix(...)`、`hsl()` 或系统色关键字（`AccentColor`）。
 * 只有浏览器自己知道它解析成什么，而 sRGB 像素就是它的答案。
 *
 * 关键点是**证伪**：`ctx.fillStyle = 非法值` 不报错也不改变现状，
 * 所以先打一个哨兵色，写完后如果像素还是哨兵，就说明这个颜色在本机根本解析不出来，
 * 一律返回 null —— 调用方必须把「读不到」如实显示出来，不许悄悄拿别的颜色顶上。
 */

const SENTINEL = "#010203"

let scratch: CanvasRenderingContext2D | null = null
let scratchFailed = false

function context(): CanvasRenderingContext2D | null {
  if (scratchFailed) return null
  if (scratch) return scratch
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) {
    scratchFailed = true
    return null
  }
  scratch = ctx
  return scratch
}

function toHex(byte: number): string {
  return Math.max(0, Math.min(255, Math.round(byte))).toString(16).padStart(2, "0")
}

export function cssColorToHex(value: string | null | undefined): string | null {
  const candidate = typeof value === "string" ? value.trim() : ""
  if (!candidate) return null
  const ctx = context()
  if (!ctx) return null

  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = SENTINEL
  ctx.fillRect(0, 0, 1, 1)
  const before = ctx.getImageData(0, 0, 1, 1).data

  ctx.fillStyle = candidate
  ctx.fillRect(0, 0, 1, 1)
  const after = ctx.getImageData(0, 0, 1, 1).data

  const unchanged = after[0] === before[0] && after[1] === before[1] && after[2] === before[2]
  if (unchanged) return null
  if (after[3] === 0) return null

  return `#${toHex(after[0])}${toHex(after[1])}${toHex(after[2])}`.toLowerCase()
}

/**
 * 读根元素上某个 CSS 变量的实际颜色值（颜色主题应用完之后调用才有意义）。
 * 返回 null 表示变量不存在或本机解析不出来，调用方要如实区分这两种情况就别猜了。
 */
export function readRootColorVar(name: string): string | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name)
  return cssColorToHex(raw)
}

/**
 * 本机能不能读到「系统强调色」。
 * 这就是回读路径：不是「我们提供了这个选项」，而是「浏览器确实给了你一个颜色」。
 */
export function readSystemAccentColor(): string | null {
  return cssColorToHex("AccentColor")
}
