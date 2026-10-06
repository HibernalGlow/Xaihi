/**
 * 右上角的动作轮盘：PieMenu 的适配层。
 *
 * 动作全部来自 `@/actions` 注册表（ADR-0081），这里只负责「注册表 → 环上格子」。
 *
 * 排布按用户的口径，两条各自独立、互不推导：
 * - **半径** = 格子离锚点多远（`wheelRadiusPx`，用户在设置里调）；
 * - **间距** = 相邻两格夹多少度（`wheelSectorPitchDeg`，同样用户调）。
 * 绑定的格子从正下开始按间距依次排开，其余格子是**禁用的空位**——PieMenu 的瞄准
 * 本来就跳过 disabled（`nearestIndex(angle, angles, enabled)`），空位尺寸实测为 0
 * 也不进包围盒，所以上游几何一行不用改。绑得多就铺得远，绑得少就贴着锚点。
 *
 * 角度是 PieMenu 的罗盘口径：0 = 正上、顺时针，所以 180 = 正下、270 = 正左；
 * 锚点贴在标题栏右端，可用方向只有「正下 → 正左」这一象限。
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  PieMenu,
  PieMenuCenter,
  PieMenuContent,
  PieMenuItem,
  PieMenuTrigger,
} from "@/components/ui/pie-menu"
import { executeAction, getActionIcon, resolveActionLabel, useActionViews, type ActionContext, type ActionView } from "@/actions"
import {
  WHEEL_MAX_SECTORS,
  applyWheelLayout,
  clampWheelPitch,
  clampWheelRadius,
  wheelDeadZonePx,
  wheelFirstItemDeg,
  wheelSlotCount,
} from "@/actions/wheelPreferences"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { cn } from "@/lib/utils"

/** 图标胶囊的盒子边长。格子只放图标，名字显示在环心的回读位上。 */
const SECTOR_BOX_PX = 34

type Slot =
  | { kind: "bound"; view: ActionView; label: string }
  | { kind: "empty" }

export function ActionPieMenu({ context }: { context: ActionContext }) {
  const { t } = useTranslation()
  const views = useActionViews()
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const preferences = useWorkspaceShallowSelector((workspace) => ({
    order: workspace.wheelActionOrder,
    hiddenActions: workspace.wheelHiddenActions,
    radiusPx: workspace.wheelRadiusPx,
    pitchDeg: workspace.wheelSectorPitchDeg,
  }))

  const sectors = useMemo(() => {
    const commandViews = views.filter((view) => view.presentation === "command")
    return applyWheelLayout(commandViews, preferences, WHEEL_MAX_SECTORS)
  }, [views, preferences])

  const radius = clampWheelRadius(preferences.radiusPx)
  const slotCount = wheelSlotCount(clampWheelPitch(preferences.pitchDeg))

  const slots = useMemo<Slot[]>(() => {
    const bound: Slot[] = sectors.map((view) => ({
      kind: "bound" as const,
      view,
      label: t(resolveActionLabel(view.labelKey, context)),
    }))
    const empty: Slot[] = Array.from({ length: Math.max(0, slotCount - bound.length) }, () => ({ kind: "empty" as const }))
    return [...bound, ...empty]
  }, [sectors, slotCount, context, t])

  const badgeTotal = sectors.reduce((sum, view) => sum + view.badge, 0)
  const anyToggled = sectors.some((view) => view.toggled)
  const triggerLabel = t("common:moreActions")

  return (
    <PieMenu onOpenChange={(open) => { if (!open) setHighlighted(null) }}>
      <PieMenuTrigger
        type="button"
        data-testid="action-wheel-anchor"
        aria-label={triggerLabel}
        title={triggerLabel}
        className={cn(
          "relative grid size-8 place-items-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          anyToggled && "text-primary",
        )}
      >
        <span
          data-testid="action-wheel-dot"
          className={cn(
            "block size-2 rounded-full",
            anyToggled ? "bg-primary" : "bg-foreground",
            badgeTotal > 0 && "animate-pulse",
          )}
        />
        {badgeTotal > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 font-mono text-[9px] leading-none text-destructive-foreground">
            {badgeTotal > 9 ? "9+" : badgeTotal}
          </span>
        )}
      </PieMenuTrigger>

      <PieMenuContent
        radius={radius}
        deadZone={wheelDeadZonePx(radius)}
        startAngle={wheelFirstItemDeg(slotCount)}
      >
        {slots.map((slot, index) =>
          slot.kind === "bound" ? (
            <PieMenuItem
              key={slot.view.id}
              data-testid={`action-wheel-sector-${slot.view.id}`}
              data-action-id={slot.view.id}
              data-wheel-index={index}
              textValue={slot.label}
              title={slot.label}
              disabled={!slot.view.enabled}
              onHighlight={() => setHighlighted(slot.label)}
              onSelect={() => {
                executeAction(slot.view.id)
              }}
              className="size-[34px] justify-center gap-0 rounded-full px-0"
            >
              {(() => {
                const Icon = getActionIcon(slot.view.id)
                return Icon ? <Icon aria-hidden className="size-4" /> : null
              })()}
            </PieMenuItem>
          ) : (
            <PieMenuItem
              key={`empty-${index}`}
              aria-hidden
              disabled
              textValue=""
              className="size-0 min-w-0 border-0 p-0 opacity-0 shadow-none"
            />
          ),
        )}
        {highlighted ? (
          <PieMenuCenter className="max-w-[86px] -translate-x-1/2 -translate-y-1/2 text-center font-mono text-[10px] leading-tight tracking-widest text-muted-foreground">
            <span className="block max-w-full truncate">{highlighted}</span>
          </PieMenuCenter>
        ) : null}
      </PieMenuContent>
    </PieMenu>
  )
}

export { SECTOR_BOX_PX }
