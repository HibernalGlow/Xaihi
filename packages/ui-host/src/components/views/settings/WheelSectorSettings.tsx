/**
 * 轮盘扇区的自定义编辑器（两列 kanban：在轮盘上 / 已隐藏）。
 *
 * 形状照抄节点卡片工具栏那份（`WorkspaceSection.tsx` 里的 `ChromeActionKanban`），
 * 差别是这里的动作集合由 `@/actions` 注册表动态给——新增一个动作不需要改这份设置界面。
 *
 * 组件自己订阅注册表（`useActionViews`），宿主只注入偏好、回调与文案：
 * 让宿主 import `@/actions` 会把 builtins→store 的链绕进设置层，实测会打断相邻代码的泛型推断。
 */
import { horizontalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVertical } from "lucide-react"
import { useMemo } from "react"

import { Kanban, KanbanBoard, KanbanColumn, KanbanItem, KanbanItemHandle, KanbanOverlay } from "@/components/ui/kanban"
import { getActionContext, getActionIcon, useActionViews } from "@/actions"
import {
  WHEEL_HIDDEN_COLUMN,
  WHEEL_MAX_SECTORS,
  WHEEL_PITCH_MAX_DEG,
  WHEEL_PITCH_MIN_DEG,
  WHEEL_RADIUS_MAX_PX,
  WHEEL_RADIUS_MIN_PX,
  WHEEL_VISIBLE_COLUMN,
  mergeWheelKanbanColumns,
  splitWheelKanbanColumns,
} from "@/actions/wheelPreferences"
import { AlphabetIndexSlider } from "./primitives"

function SectorCard({ id, label }: { id: string; label: string }) {
  const Icon = getActionIcon(id)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-left text-xs text-foreground">
      <GripVertical aria-hidden className="size-3 shrink-0 text-muted-foreground/60" />
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}

function SectorColumn({
  columnId,
  label,
  ids,
  labelFor,
  dragActionLabel,
}: {
  columnId: string
  label: string
  ids: string[]
  labelFor: (id: string) => string
  dragActionLabel: (action: string) => string
}) {
  return (
    <KanbanColumn value={columnId} asHandle={false} className="h-auto min-h-20 w-full flex-row flex-wrap content-start gap-1.5 rounded-sm border-border/40 bg-muted/10 p-1.5">
      <div className="flex basis-full items-center justify-between px-1 py-0.5 text-[10px] font-mono tracking-widest text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{ids.length}</span>
      </div>
      {ids.map((id) => (
        <KanbanItem key={id} value={id} className="flex max-w-full items-center rounded-sm border border-border/40 bg-background/80 p-1.5 shadow-sm data-dragging:z-20 data-dragging:bg-card data-dragging:shadow-md">
          <KanbanItemHandle className="touch-none w-full" aria-label={dragActionLabel(labelFor(id))}>
            <SectorCard id={id} label={labelFor(id)} />
          </KanbanItemHandle>
        </KanbanItem>
      ))}
    </KanbanColumn>
  )
}

export function WheelSectorSettings({
  order,
  hiddenActions,
  onPreferencesChange,
  labelForAction,
  dragActionLabel,
  visibleLabel,
  hiddenLabel,
  overflowHintFor,
  maxSectors = WHEEL_MAX_SECTORS,
  radiusPx,
  pitchDeg,
  onGeometryChange,
  radiusLabel,
  pitchLabel,
  formatRadius,
  formatPitch,
}: {
  order: readonly string[]
  hiddenActions: readonly string[]
  onPreferencesChange: (order: string[], hiddenActions: string[]) => void
  /** 把注册表给的 labelKey 翻成界面语言；组件不自己碰 i18n，保持可测。 */
  labelForAction: (labelKey: string) => string
  dragActionLabel: (action: string) => string
  visibleLabel: string
  hiddenLabel: string
  /** 可见项超出扇区上限时的提示。回读路径：截断必须看得见。 */
  overflowHintFor?: (count: number) => string
  maxSectors?: number
  /** 半径与间距是两个独立参数，互不推导（用户口径）。 */
  radiusPx: number
  pitchDeg: number
  onGeometryChange: (radiusPx: number, pitchDeg: number) => void
  radiusLabel: string
  pitchLabel: string
  formatRadius: (value: number) => string
  formatPitch: (value: number) => string
}) {
  const views = useActionViews()
  const ids = useMemo(() => views.map((view) => view.id), [views])
  const labelKeyById = useMemo(
    () => Object.fromEntries(views.map((view) => [view.id, view.labelKey])),
    [views],
  )
  const context = getActionContext()

  function labelFor(id: string): string {
    const labelKey = labelKeyById[id]
    return labelForAction(typeof labelKey === "string" ? labelKey : labelKey?.(context) ?? id)
  }

  const columns = splitWheelKanbanColumns(ids, order, hiddenActions)

  function commitColumns(next: Record<string, string[]>) {
    const preferences = mergeWheelKanbanColumns(ids, {
      [WHEEL_VISIBLE_COLUMN]: next[WHEEL_VISIBLE_COLUMN] ?? columns[WHEEL_VISIBLE_COLUMN],
      [WHEEL_HIDDEN_COLUMN]: next[WHEEL_HIDDEN_COLUMN] ?? columns[WHEEL_HIDDEN_COLUMN],
    })
    onPreferencesChange(preferences.order, preferences.hiddenActions)
  }

  const overflow = columns[WHEEL_VISIBLE_COLUMN].length - maxSectors

  return (
    <div className="space-y-2">
      <Kanban
        value={columns}
        getItemValue={(id: string) => id}
        onValueChange={commitColumns}
        strategy={horizontalListSortingStrategy}
        orientation="vertical"
      >
        <KanbanBoard className="flex h-auto flex-col gap-2">
          <SectorColumn columnId={WHEEL_VISIBLE_COLUMN} label={visibleLabel} ids={columns[WHEEL_VISIBLE_COLUMN]} labelFor={labelFor} dragActionLabel={dragActionLabel} />
          <SectorColumn columnId={WHEEL_HIDDEN_COLUMN} label={hiddenLabel} ids={columns[WHEEL_HIDDEN_COLUMN]} labelFor={labelFor} dragActionLabel={dragActionLabel} />
        </KanbanBoard>
        <KanbanOverlay>
          {({ value }) => <SectorCard id={value as string} label={labelFor(value as string)} />}
        </KanbanOverlay>
      </Kanban>
      {overflow > 0 && overflowHintFor ? (
        <p className="font-mono text-[10px] tracking-widest text-destructive">{overflowHintFor(overflow)}</p>
      ) : null}

      <div className="grid gap-3 pt-1">
        <AlphabetIndexSlider
          label={radiusLabel}
          min={WHEEL_RADIUS_MIN_PX}
          max={WHEEL_RADIUS_MAX_PX}
          current={radiusPx}
          value={formatRadius(radiusPx)}
          onValueChange={(next) => onGeometryChange(next, pitchDeg)}
        />
        <AlphabetIndexSlider
          label={pitchLabel}
          min={WHEEL_PITCH_MIN_DEG}
          max={WHEEL_PITCH_MAX_DEG}
          current={pitchDeg}
          value={formatPitch(pitchDeg)}
          onValueChange={(next) => onGeometryChange(radiusPx, next)}
        />
      </div>
    </div>
  )
}
