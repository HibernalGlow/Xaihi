/**
 * 动作 id → 图标组件。
 *
 * 单独一张表而不是放进 descriptor：`@lumino/commands` 的 `icon` 字段类型是
 * `VirtualElement.IRenderer`（Blueprint 的 VirtualDOM，不是 React），用它就要把
 * `@lumino/virtualdom` 的渲染路径接进界面。本仓图标一律 lucide，与
 * `src/components/ui/fuse-button.tsx`、`sling-button.tsx` 换掉 `@hugeicons` 的做法一致。
 */
import type { ComponentType } from "react"
import { Activity, Code2, Gauge, History, Palette, Plus, Trash2 } from "lucide-react"

import { resolveModuleIcon } from "@/components/modules/moduleIconRegistry"

import { getNodeActionSource } from "./nodeActionIds"
import type { ActionId } from "./types"

export const ACTION_ICONS: Record<ActionId, ComponentType<{ className?: string }>> = {
  "workspace.dashboard": Gauge,
  "workspace.history": History,
  "workspace.deletions": Trash2,
  "workspace.operations": Activity,
  "workspace.runtime": Code2,
  "workspace.registry": Plus,
  "theme.switcher": Palette,
}

/** 派生动作没登记图标时的回退。返回 undefined 而不是兜底图标：缺图标要在界面上看得见。 */
export function getActionIcon(id: ActionId): ComponentType<{ className?: string }> | undefined {
  const direct = ACTION_ICONS[id]
  if (direct) return direct
  // 节点派生动作的图标住在模块表里，走同一套 lucide 解析，不给它另开一条图标通路。
  const source = getNodeActionSource(id)
  return source ? resolveModuleIcon(source.icon) : undefined
}
