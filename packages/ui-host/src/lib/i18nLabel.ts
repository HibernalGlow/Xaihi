/**
 * 标签翻译工具。
 *
 * 工作区与泳道的 label 字段可能存储三种形式：
 * 1. i18n key（如 "common:workspaceN:123"）—— 需要通过 t() 翻译
 * 2. 默认模板（如 "LANE 1"）—— 需要转换为 i18n key 再翻译
 * 3. 用户自定义文本 —— 原样返回
 *
 * 该模块通过正则匹配区分这三种情况，调用对应的 t() 重载进行翻译。
 */
import type { TFunction } from "i18next"

/** 匹配 "LANE N" 格式的默认泳道名。 */
const LANE_N_RE = /^LANE\s+(\d+)$/
/** 匹配 "common:workspaceN:123" 格式的工作区 i18n key。 */
const WORKSPACE_N_RE = /^common:workspaceN:(\d+)$/

/**
 * 翻译可能为 i18n key 的 label。
 *
 * - 形如 "common:workspaceN:123" 的 key → t("common:workspaceN", { n: 123 })
 * - 形如 "ns:key" 的 i18n key → t(key) 翻译
 * - 形如 "LANE 1" 的默认泳道名 → t("view:lane.laneN", { n })
 * - 用户自定义文本 → 原样返回
 */
export function translateLabel(label: string, t: TFunction): string {
  if (!label) return label
  // common:workspaceN:123 格式（带数字参数的 i18n key）
  const wsMatch = label.match(WORKSPACE_N_RE)
  if (wsMatch) {
    return t("common:workspaceN", { n: Number(wsMatch[1]) })
  }
  // 形如 "ns:key" 的 i18n key（无空格）
  if (label.includes(":") && !label.includes(" ")) {
    return t(label)
  }
  // "LANE N" 格式
  const laneMatch = label.match(LANE_N_RE)
  if (laneMatch) {
    return t("view:lane.laneN", { n: Number(laneMatch[1]) })
  }
  return label
}
