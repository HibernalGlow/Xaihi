/**
 * 移动端断点检测 hook（shadcn 约定）。
 *
 * 通过 matchMedia 监听 `(max-width: 767px)` 媒体查询，
 * 返回当前视口宽度是否小于 768px（Tailwind 的 md 断点）。
 *
 * 初始值为 undefined（SSR 安全），首次 useEffect 后才同步真实状态；
 * 返回值用 `!!` 强制为 boolean，避免 undefined 导致下游条件渲染出错。
 */
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
