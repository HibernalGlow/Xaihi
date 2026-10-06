/**
 * Lane — 单个泳道。
 *
 * 从 Xlchemy Lane.svelte 移植为 React，简化为：
 * - 标题栏（折叠按钮 + 标题 + 拖拽手柄 + 菜单）
 * - 内容区（按 cardOrder 排序的 LaneCard 列表，垂直滚动）
 * - 右侧调宽手柄（LaneResizer）
 *
 * 折叠：dispatch TOGGLE_LANE_COLLAPSE
 * 调宽：dispatch SET_LANE_WIDTH_RATIO（按 ratio 增量累加并 clamp 到 0.25~4）
 * 拖拽 lane：拖动标题栏时由 @dnd-kit 在 LaneView 中重排。
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Pencil, Ellipsis, Eraser, EyeOff, RotateCcw, Trash2 } from "lucide-react"
import type { Lane as LaneType } from "@/types/workspace"
import { useWorkspaceActions } from "@/store/workspaceStore"
import { useModuleDropTarget } from "@/hooks/useModuleDropTarget"
import { translateLabel } from "@/lib/i18nLabel"
import { LaneCard } from "./LaneCard"
import { LaneResizer } from "./LaneResizer"
import { LaneCollapseIcon } from "./LaneCollapseIcon"
import { SwimlaneCollapseDragButton } from "@/components/workspace/swimlane/SwimlaneCollapseDragButton"
import { KanbanColumn, KanbanColumnHandle } from "@/components/ui/kanban"
import { cn } from "@/lib/utils"

const RATIO_PRESETS = [0.5, 1, 1.5, 2, 3]
const LANE_WIDTH_UNIT = 320
const MIN_EXPANDED_LANE_WIDTH = 240
const formatRatioInput = (ratio: number) => Number(ratio.toFixed(2)).toString()

/** 泳道折叠/展开图标 — 从 Xlchemy LaneDragHandle.svelte 移植的 SVG。
 *  原版设计：泳道外框 + 内部 lane 矩形，矩形 fill 状态表示折叠/展开：
 *  - 展开态：矩形空心（fill: none），hover 变实心
 *  - 折叠态：矩形实心（fill: currentColor），hover 变空心 */
interface Props {
  lane: LaneType
  components: { id: string; moduleId: string }[]
  active?: boolean
  solo?: boolean
  soloWidth?: number
  onActivate?(): void
  onHoverFocus?(): void
  onHoverFocusCancel?(): void
  onTitleHostChange?(node: HTMLElement | null): void
  hideTitleForNavigator?: boolean
  onWidthRatioChange?(ratio: number): void
  onClear?(): void
  onResetNavigatorPosition?(): void
}

export function Lane({ lane, components, active = false, solo = false, soloWidth, onActivate, onHoverFocus, onHoverFocusCancel, onTitleHostChange, hideTitleForNavigator = false, onWidthRatioChange, onClear, onResetNavigatorPosition }: Props) {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(translateLabel(lane.label, t))
  const [ratioInput, setRatioInput] = useState(formatRatioInput(lane.widthRatio))
  const widthRatioRef = useRef(lane.widthRatio)
  const handleDropModule = useCallback((moduleId: string) => {
    workspaceActions.deployComponent(moduleId, { viewMode: "lane", laneId: lane.id })
  }, [lane.id, workspaceActions])
  const { isModuleOver, moduleDropHandlers } = useModuleDropTarget(handleDropModule)
  const laneWidth = solo ? Math.max(1, soloWidth ?? 960) : Math.max(MIN_EXPANDED_LANE_WIDTH, Math.round(lane.widthRatio * LANE_WIDTH_UNIT))
  const columnStyle = lane.collapsed
    ? { flex: "0 0 3rem" }
    : { flex: `0 0 ${laneWidth}px`, width: laneWidth }

  useEffect(() => {
    widthRatioRef.current = lane.widthRatio
    setRatioInput(formatRatioInput(lane.widthRatio))
  }, [lane.widthRatio])

  function commitRename() {
    const trimmed = name.trim()
    if (trimmed) workspaceActions.renameLane(lane.id, trimmed)
    setRenaming(false)
  }

  function commitRatioInput() {
    const val = parseFloat(ratioInput)
    if (!isNaN(val) && val > 0) (onWidthRatioChange ?? ((ratio) => workspaceActions.setLaneWidthRatio(lane.id, ratio)))(val)
    setRatioInput(formatRatioInput(lane.widthRatio))
  }

  if (lane.collapsed) {
    return (
      <KanbanColumn
        value={lane.id}
        data-context-menu="lane"
        data-lane-id={lane.id}
        style={columnStyle}
        className="xiranite-ui-copy h-full w-auto min-w-12 flex-shrink-0 items-center gap-2 rounded-none border-0 border-r border-border/40 bg-muted/20 px-1 py-3 hover:bg-muted/40"
        data-swimlane-active={active}
        onPointerEnter={onHoverFocus}
        onPointerLeave={onHoverFocusCancel}
        onPointerDownCapture={() => { if (!active) onActivate?.() }}
      >
        <KanbanColumnHandle
          asChild
          data-lane-drag-handle="true"
        >
          <SwimlaneCollapseDragButton collapsed laneLabel={translateLabel(lane.label, t)} onClick={() => workspaceActions.toggleLaneCollapse(lane.id)} />
        </KanbanColumnHandle>
        <span className="text-[10px] font-mono tracking-widest text-muted-foreground" style={{ writingMode: "vertical-rl" }}>{translateLabel(lane.label, t)}</span>
      </KanbanColumn>
    )
  }

  return (
    <KanbanColumn
      value={lane.id}
      disabled={renaming}
      data-context-menu="lane"
      data-lane-id={lane.id}
      style={columnStyle}
      className="xiranite-ui-copy relative h-full w-auto min-w-60 gap-0 rounded-none border-0 border-r border-border/40 bg-card/40 p-0"
      data-swimlane-active={active}
      data-swimlane-solo={solo}
      onPointerEnter={onHoverFocus}
      onPointerLeave={onHoverFocusCancel}
      onPointerDownCapture={(event) => {
        if (active) return
        event.preventDefault()
        event.stopPropagation()
        onActivate?.()
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center gap-1.5 h-8 px-2 border-b border-border/40 bg-muted/30 flex-shrink-0">
        <KanbanColumnHandle asChild disabled={renaming} data-lane-drag-handle="true">
          <SwimlaneCollapseDragButton collapsed={false} laneLabel={translateLabel(lane.label, t)} onClick={() => workspaceActions.toggleLaneCollapse(lane.id)} />
        </KanbanColumnHandle>

        <span ref={onTitleHostChange} className="flex min-w-0 flex-1" data-swimlane-navigator-title-slot={lane.id}>
        {hideTitleForNavigator ? null : renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename() }}
            className="min-w-0 flex-1 bg-background border border-border px-1 py-0 text-[11px] font-mono rounded-sm outline-none focus:border-primary"
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-left text-[11px] font-mono font-semibold uppercase tracking-widest text-muted-foreground"
            title={translateLabel(lane.label, t)}
          >
            {translateLabel(lane.label, t)}
          </span>
        )}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen(o => !o)
          }}
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          title={t("common:moreActions")}
        >
          <Ellipsis className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 菜单浮层 — relative 父级 + absolute 定位，z-50 高于其他 lane */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
            onContextMenu={(e) => { e.preventDefault(); setMenuOpen(false) }}
          />
          <div className="absolute right-0 top-9 mt-0.5 w-48 rounded-md border border-border bg-card shadow-lg z-50 p-1 text-xs">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenaming(true) }}
              className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-muted/60 rounded-sm"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("common:rename")}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); workspaceActions.toggleLaneCollapse(lane.id) }}
              className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-muted/60 rounded-sm"
            >
              <LaneCollapseIcon collapsed={false} /> {t("common:collapse")}
            </button>

            <div className="px-2 py-1.5 border-t border-border/60 mt-1">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <span className="text-[10px] font-mono tracking-widest">{t("common:widthRatio")}</span>
              </div>
              <div className="grid grid-cols-5 gap-1 mb-1">
                {RATIO_PRESETS.map(preset => (
                  <button
                    key={preset}
                    onClick={(e) => { e.stopPropagation(); (onWidthRatioChange ?? ((ratio) => workspaceActions.setLaneWidthRatio(lane.id, ratio)))(preset) }}
                    className={cn(
                      "py-1 rounded-sm border text-[10px] font-mono",
                      Math.abs(lane.widthRatio - preset) < 0.01
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/40 hover:bg-muted/60"
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={ratioInput}
                  onChange={(e) => setRatioInput(e.target.value)}
                  onBlur={commitRatioInput}
                  onKeyDown={(e) => { if (e.key === "Enter") commitRatioInput() }}
                  min={0.25}
                  max={4}
                  step={0.1}
                  className="w-14 bg-background border border-border px-1 py-0 text-[10px] font-mono rounded-sm outline-none focus:border-primary"
                />
                <span className="text-muted-foreground text-[10px]">×</span>
              </div>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); workspaceActions.toggleLaneVisibility(lane.id) }}
              className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-muted/60 rounded-sm border-t border-border/60"
            >
              <EyeOff className="h-3.5 w-3.5" /> {t("common:hide")}
            </button>
            <button
              type="button"
              disabled={components.length === 0 || !onClear}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClear?.() }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-45"
            >
              <Eraser className="h-3.5 w-3.5" /> 清空当前泳道
            </button>
            <button
              type="button"
              disabled={!onResetNavigatorPosition}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onResetNavigatorPosition?.() }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted/60 disabled:pointer-events-none disabled:opacity-45"
            >
              <RotateCcw className="h-3.5 w-3.5" /> 重置操作栏位置
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); workspaceActions.removeLane(lane.id) }}
              className="flex items-center gap-2 px-2 py-1.5 w-full text-left hover:bg-destructive/10 hover:text-destructive rounded-sm"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common:delete")}
            </button>
          </div>
        </>
      )}

      {/* 内容区：card 列表 */}
      <div
        data-lane-drop-zone={lane.id}
        data-scrollbar="hidden"
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2 min-h-0 transition-colors",
          isModuleOver ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : undefined,
        )}
        {...moduleDropHandlers}
      >
        {components.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[10px] font-mono text-muted-foreground/60">
              {isModuleOver ? t("registry:dropHint") : t("view:lane.emptyLane")}
            </p>
          </div>
        ) : (
          components.map(c => (
            <LaneCard key={c.id} compId={c.id} moduleId={c.moduleId} />
          ))
        )}
      </div>
      <LaneResizer
        className="absolute inset-y-0 right-0 z-20 w-2 translate-x-1 bg-transparent hover:bg-primary/30"
        onResize={(deltaRatio) => {
          widthRatioRef.current += deltaRatio
          ;(onWidthRatioChange ?? ((ratio) => workspaceActions.setLaneWidthRatio(lane.id, ratio)))(widthRatioRef.current)
        }}
      />
    </KanbanColumn>
  )
}
