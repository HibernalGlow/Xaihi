import i18n from "@/i18n"

/**
 * `tt` —— 不依赖 hook 的即时翻译。
 *
 * 节点控件（`nodes/shared/controls.tsx`）与 MD3E 工作台会在纯函数、事件回调与
 * 渲染期以外的地方取文案，此时拿不到 `useTranslation()` 的 `t`。键形如
 * `module:kisaki.metrics.files`（namespace:key）；缺翻译时回落到第二个参数，
 * 再缺则回落到键本身 —— 与 `translateLabel` 的降级口径一致。
 */
export function tt(key: string, fallback?: string): string {
  const result = i18n.t(key, { defaultValue: fallback ?? key })
  if (typeof result === "string" && result.length > 0) return result
  return fallback ?? key
}
