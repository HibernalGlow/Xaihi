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
const DEFAULT_ZH_CONFIG: Record<string, string> = {
  "config.trigger": "配置管理",
  "config.title": "配置管理",
  "config.description": "保存可复用默认值，或恢复本节点的已保存配置。",
  "config.save": "保存为默认",
  "config.restore": "恢复默认",
  "config.reload": "重新读取",
  "config.openFile": "打开文件",
}

export function useNodeI18n(nodeId: string) {
  const { t, i18n } = useTranslation("module")
  const prefix = nodeId
  const isZh = i18n.resolvedLanguage?.toLowerCase().startsWith("zh")
  const translate = (key: string, fallback: string, vars?: Record<string, unknown>) => {
    if (key.includes(":")) return t(key, { defaultValue: fallback, ...(vars ?? {}) })
    const nodeValue = t(`${prefix}.${key}`, { defaultValue: "__MISSING__", ...(vars ?? {}) })
    if (nodeValue !== "__MISSING__") return nodeValue

    if (key.startsWith("config.")) {
      if (isZh && DEFAULT_ZH_CONFIG[key]) {
        return DEFAULT_ZH_CONFIG[key]
      }
      return t(`configCenter.${key.slice("config.".length)}`, { defaultValue: fallback, ...(vars ?? {}) })
    }
    return fallback
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
