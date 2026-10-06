import { useTranslation } from "react-i18next"
import i18n from "@/i18n"

/**
 * 模块级节点 i18n 翻译函数
 *
 * 用于非组件代码（statusFromState、summaryText 等纯函数）。
 * 组件内请优先使用 useNodeI18n hook 以获得语言切换响应。
 *
 * 这些纯函数在组件渲染期间被调用，因此语言切换时组件重新渲染
 * 会自然地让这些函数读到新语言的翻译。
 */
export function tNode(nodeId: string, key: string, fallback: string, vars?: Record<string, unknown>): string {
  // 支持 namespace 前缀（如 "common:cancel"）直接跨命名空间取键
  const fullKey = key.includes(":") ? key : `${nodeId}.${key}`
  return i18n.t(fullKey, { ns: "module", defaultValue: fallback, ...(vars ?? {}) })
}

/**
 * 节点 i18n helper hook
 *
 * 将节点命名空间下的翻译键统一通过 nodeId 前缀访问。
 * 组件用 `const { t } = useNodeI18n("trename")`，
 * 再 `t("status.idle", "就绪")` 即可读取 `module.trename.status.idle`。
 *
 * fallback 始终保留中文原文，即使 i18n key 缺失也能显示。
 *
 * 支持插值变量：`t("summary.stats", "{{count}} 项", { count: 5 })`
 */
export function useNodeI18n(nodeId: string) {
  const { t, i18n } = useTranslation("module")
  const prefix = nodeId
  const translate = (key: string, fallback: string, vars?: Record<string, unknown>) => {
    if (key.includes(":")) return t(key, { defaultValue: fallback, ...(vars ?? {}) })
    const sharedFallback = key.startsWith("config.")
      ? t(`configCenter.${key.slice("config.".length)}`, { defaultValue: fallback, ...(vars ?? {}) })
      : fallback
    return t(`${prefix}.${key}`, { defaultValue: sharedFallback, ...(vars ?? {}) })
  }
  return {
    t: translate,
    /** 翻译 common 命名空间下的通用术语，如 tc("common:cancel", "取消") */
    tc: (key: string, fallback: string) => t(key, { defaultValue: fallback }),
    name: t(`${prefix}.name`, { defaultValue: nodeId }),
    description: t(`${prefix}.description`, { defaultValue: "" }),
    language: i18n.resolvedLanguage?.toLowerCase().startsWith("zh") ? "zh" as const : "en" as const,
  }
}
