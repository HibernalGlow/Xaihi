import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import {
  Copy,
  CopyX,
  Trash2,
  Maximize2,
  Minimize2,
  Expand,
  ExternalLink,
  Focus as FocusIcon,
  Layers,
  BringToFront,
  Eye,
  EyeOff,
  Plus,
  Image as ImageIcon,
  Layout as LayoutIcon,
  Palette,
  Square,
  Share2,
  ArrowRight,
  ChevronsUpDown,
  X,
} from "lucide-react"
import { getWorkspaceState, useWorkspaceActions } from "@/store/workspaceStore"
import { COMPONENT_VIEW_MODES, type ComponentViewMode } from "@/store/workspace/constants"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useContextMenuBuilder } from "./context"
import type { ContextMenuItemDef, ContextMenuContext } from "./ContextMenuProvider"
import { copyToClipboard } from "./helpers"
import type { ViewMode, CardLayout } from "@/types/workspace"

/**
 * Registers default context-menu builders for built-in scopes.
 * Call this once from the workspace layout root.
 *
 * Scopes:
 *  - `component-card`:   actions for a component instance (data-component-id)
 *  - `workspace-canvas`: actions for the empty canvas (view mode / layout / appearance / workspace)
 *  - `lane`:             actions for a swimlane (data-lane-id)
 *  - `dockview-panel`:   actions for a dock tab component (data-component-id)
 *  - `flow-node`:        actions for a flow node (data-component-id)
 *  - `bento-cell`:       actions for a bento cell (data-component-id)
 */
export function DefaultContextMenuItems() {
  const actions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const { t } = useTranslation()

  /**
   * 多选批量菜单。当右键的 component 在选中集合中且选中数 > 1 时返回批量操作菜单。
   * 返回 null 表示不适用多选场景，调用方应回退到单组件菜单。
   */
  const buildMultiSelectionMenu = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      const id = ctx.data.componentId
      if (!id) return null

      const state = getWorkspaceState()
      const selected = state.selectedComponentIds
      // 仅当右键目标在选中集合中且多选时才返回批量菜单
      if (selected.length <= 1 || !selected.includes(id)) return null

      const currentMode = state.viewMode as ComponentViewMode

      return [
        {
          id: "multi-selected-count",
          label: t("contextMenu:multiSelected", { count: selected.length }),
          disabled: true,
        },
        { type: "separator" },
        {
          id: "multi-move-to-view",
          label: t("contextMenu:multiMoveToView"),
          icon: <Share2 />,
          children: COMPONENT_VIEW_MODES
            .filter((mode) => mode !== currentMode)
            .map((mode) => ({
              id: `multi-move-to-${mode}`,
              label: t(`topbar:viewMode.${mode}`),
              icon: <ArrowRight />,
              onSelect: () => {
                actions.setComponentsVisibility(selected, currentMode, false)
                actions.setComponentsVisibility(selected, mode, true)
                actions.setViewMode(mode)
              },
            })),
        },
        {
          id: "multi-toggle-collapse",
          label: t("contextMenu:multiToggleCollapse"),
          icon: <ChevronsUpDown />,
          onSelect: () => actions.toggleCollapseComponents(selected),
        },
        {
          id: "multi-duplicate",
          label: t("contextMenu:multiDuplicate"),
          icon: <Copy />,
          onSelect: () => actions.duplicateComponents(selected),
        },
        { type: "separator" },
        {
          id: "multi-delete",
          label: t("contextMenu:multiDelete"),
          icon: <Trash2 />,
          destructive: true,
          confirm: {
            title: t("contextMenu:multiDeleteConfirmTitle", { count: selected.length }),
            confirmLabel: t("common:delete"),
            cancelLabel: t("common:cancel"),
            destructive: true,
          },
          onSelect: () => actions.removeComponents(selected),
        },
        { type: "separator" },
        {
          id: "multi-clear-selection",
          label: t("contextMenu:multiClearSelection"),
          icon: <X />,
          onSelect: () => actions.clearSelection(),
        },
      ]
    },
    [actions, t],
  )

  // ────────────────────────────────────────────────────────────────────────
  // component-card: full component instance menu
  // ────────────────────────────────────────────────────────────────────────
  const componentCardBuilder = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      const id = ctx.data.componentId
      if (!id) return null

      // 多选时返回批量操作菜单
      const multi = buildMultiSelectionMenu(ctx)
      if (multi) return multi

      // Read live component state from the store (not the React hook) so the
      // menu always reflects the latest state at the moment of right-click.
      const state = getWorkspaceState()
      const comp = state.components.find((item) => item.id === id)
      if (!comp) return null

      const isFullscreen = state.fullscreenComponentId === id || comp.state === "fullscreen"
      const isFocused = state.focusedComponentId === id || comp.state === "focused"
      const isCollapsed = !!comp.collapsed
      const moduleName = comp.moduleId

      const items: ContextMenuItemDef[] = [
        {
          type: "label",
          label: moduleName,
        },
      ]

      // Focus / Exit Focus — only show one
      if (isFocused) {
        items.push({
          id: "exit-focus",
          label: t("contextMenu:exitFocus"),
          icon: <Minimize2 />,
          onSelect: () => {
            actions.setCardLayout("grid")
            actions.focusComponent(null)
          },
        })
      } else {
        items.push({
          id: "focus",
          label: t("contextMenu:focus"),
          icon: <FocusIcon />,
          onSelect: () => {
            actions.setCardLayout("focus")
            actions.focusComponent(id)
          },
        })
      }

      // Fullscreen / Exit Fullscreen — only show one
      if (isFullscreen) {
        items.push({
          id: "exit-fullscreen",
          label: t("contextMenu:exitFullscreen"),
          icon: <Minimize2 />,
          onSelect: () => actions.setFullscreen(null),
        })
      } else {
        items.push({
          id: "fullscreen",
          label: t("contextMenu:fullscreen"),
          icon: <Maximize2 />,
          onSelect: () => actions.setFullscreen(id),
        })
      }

      // Collapse / Expand — only show one
      if (isCollapsed) {
        items.push({
          id: "expand",
          label: t("contextMenu:expand"),
          icon: <Expand />,
          onSelect: () => actions.toggleCollapse(id),
        })
      } else {
        items.push({
          id: "collapse",
          label: t("contextMenu:collapse"),
          icon: <Layers />,
          onSelect: () => actions.toggleCollapse(id),
        })
      }

      items.push({ type: "separator" })

      // Open in floating window
      items.push({
        id: "open-window",
        label: t("contextMenu:openWindow"),
        icon: <ExternalLink />,
        onSelect: () => {
          void openComponent({
            componentId: id,
            moduleId: comp.moduleId,
            title: moduleName,
            width: Math.round(comp.size?.w ?? 384),
            height: Math.round(comp.size?.h ?? 320),
          }).then((result) => {
            if (result.success) {
              actions.setComponentState(id, "floating")
            }
          })
        },
      })

      // Raise to front
      items.push({
        id: "raise",
        label: t("contextMenu:raise"),
        icon: <BringToFront />,
        onSelect: () => actions.raiseComponent(id),
      })

      // Duplicate
      items.push({
        id: "duplicate",
        label: t("contextMenu:duplicate"),
        icon: <Copy />,
        onSelect: () => actions.duplicateComponent(id),
      })

      items.push({ type: "separator" })

      // Layout submenu
      items.push({
        id: "layout",
        label: t("contextMenu:layout"),
        children: [
          {
            type: "radio",
            radioGroup: "cardLayout",
            radioValue: state.cardLayout,
            onRadioChange: (value) => actions.setCardLayout(value as CardLayout),
            value: "grid",
            label: t("contextMenu:layoutGrid"),
          },
          {
            type: "radio",
            radioGroup: "cardLayout",
            value: "focus",
            label: t("contextMenu:layoutFocus"),
          },
        ],
      })

      // Copy submenu
      items.push({
        id: "copy",
        label: t("contextMenu:copy"),
        children: [
          {
            id: "copy-component-id",
            label: t("contextMenu:copyComponentId"),
            onSelect: () => void copyToClipboard(id, t("common:copyFailed")),
          },
          {
            id: "copy-module-id",
            label: t("contextMenu:copyModuleId"),
            onSelect: () => void copyToClipboard(comp.moduleId, t("common:copyFailed")),
          },
          {
            id: "copy-data-json",
            label: t("contextMenu:copyDataJson"),
            onSelect: () => void copyToClipboard(JSON.stringify(comp.data ?? {}, null, 2), t("common:copyFailed")),
          },
        ],
      })

      // Reset submenu
      items.push({
        id: "reset",
        label: t("contextMenu:reset"),
        children: [
          {
            id: "clear-data",
            label: t("contextMenu:clearData"),
            destructive: true,
            confirm: {
              title: t("contextMenu:clearDataConfirmTitle"),
              description: t("contextMenu:clearDataConfirmDescription"),
              confirmLabel: t("common:confirm"),
              cancelLabel: t("common:cancel"),
              destructive: true,
            },
            onSelect: () => actions.setComponentData(id, {}),
          },
          {
            id: "reset-position",
            label: t("contextMenu:resetPosition"),
            onSelect: () => {
              actions.setComponentPosition(id, 20, 20)
              actions.setComponentFlowPos(id, 100, 100)
            },
          },
        ],
      })

      items.push({ type: "separator" })

      // Delete duplicates — remove all components sharing the same module id.
      // Hidden when the current card is the only instance of its module.
      const duplicateCount = state.components.filter((c) => c.moduleId === moduleName).length
      items.push({
        id: "delete-duplicates",
        label: t("contextMenu:deleteDuplicates"),
        icon: <CopyX />,
        destructive: true,
        hidden: duplicateCount <= 1,
        confirm: {
          title: t("contextMenu:deleteDuplicatesConfirmTitle"),
          description: t("contextMenu:deleteDuplicatesConfirmDescription", { count: duplicateCount }),
          confirmLabel: t("common:confirm"),
          cancelLabel: t("common:cancel"),
          destructive: true,
        },
        onSelect: () => actions.removeComponentsByModule(moduleName),
      })

      // Delete — with confirmation
      items.push({
        id: "delete",
        label: t("contextMenu:delete"),
        icon: <Trash2 />,
        destructive: true,
        confirm: {
          title: t("contextMenu:deleteConfirmTitle"),
          description: t("contextMenu:deleteConfirmDescription"),
          confirmLabel: t("common:confirm"),
          cancelLabel: t("common:cancel"),
          destructive: true,
        },
        onSelect: () => actions.removeComponent(id),
      })

      return items
    },
    [actions, openComponent, t, buildMultiSelectionMenu],
  )

  // ────────────────────────────────────────────────────────────────────────
  // workspace-canvas: empty canvas actions/ view settings menu
  // ────────────────────────────────────────────────────────────────────────
  const workspaceCanvasBuilder = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      // Skip canvas menu when a more specific scope (component/lane/etc.) is
      // in the event path — those render their own scoped menus.
      const path = ctx.event.composedPath()
      for (const el of path) {
        if (!(el instanceof HTMLElement)) continue
        if (el === ctx.element) break // reached canvas; no nested scope found
        const scope = el.dataset.contextMenu
        if (scope && scope !== "workspace-canvas") return null
      }

      const state = getWorkspaceState()

      const items: ContextMenuItemDef[] = []

      // View Mode submenu (radio group)
      items.push({
        id: "view-mode",
        label: t("contextMenu:viewMode"),
        icon: <LayoutIcon />,
        children: [
          {
            type: "radio",
            radioGroup: "viewMode",
            radioValue: state.viewMode,
            onRadioChange: (value) => actions.setViewMode(value as ViewMode),
            value: "dashboard",
            label: t("topbar:viewMode.dashboard"),
          },
          {
            type: "radio",
            radioGroup: "viewMode",
            value: "cards",
            label: t("topbar:viewMode.cards"),
          },
          {
            type: "radio",
            radioGroup: "viewMode",
            value: "dockview",
            label: t("topbar:viewMode.dockview"),
          },
          {
            type: "radio",
            radioGroup: "viewMode",
            value: "flow",
            label: t("topbar:viewMode.flow"),
          },
          {
            type: "radio",
            radioGroup: "viewMode",
            value: "lane",
            label: t("topbar:viewMode.lane"),
          },
          {
            type: "radio",
            radioGroup: "viewMode",
            value: "bento",
            label: t("topbar:viewMode.bento"),
          },
        ],
      })

      // Card Layout submenu — only relevant in cards view
      items.push({
        id: "card-layout",
        label: t("contextMenu:layout"),
        icon: <Square />,
        hidden: state.viewMode !== "cards",
        children: [
          {
            type: "radio",
            radioGroup: "cardLayout",
            radioValue: state.cardLayout,
            onRadioChange: (value) => actions.setCardLayout(value as CardLayout),
            value: "grid",
            label: t("contextMenu:layoutGrid"),
          },
          {
            type: "radio",
            radioGroup: "cardLayout",
            value: "focus",
            label: t("contextMenu:layoutFocus"),
          },
        ],
      })

      // Appearance submenu
      items.push({
        id: "appearance",
        label: t("contextMenu:appearance"),
        icon: <Palette />,
        children: [
          // Background submenu (radio group)
          {
            id: "background",
            label: t("contextMenu:background"),
            icon: <ImageIcon />,
            children: [
              {
                type: "radio",
                radioGroup: "bgMode",
                radioValue: state.bgMode,
                onRadioChange: (value) =>
                  actions.setBgMode(value as "grid" | "dot-grid" | "image" | "none"),
                value: "grid",
                label: t("settings:background.modes.grid"),
              },
              {
                type: "radio",
                radioGroup: "bgMode",
                value: "dot-grid",
                label: t("settings:background.modes.dot-grid"),
              },
              {
                type: "radio",
                radioGroup: "bgMode",
                value: "image",
                label: t("settings:background.modes.image"),
              },
              {
                type: "radio",
                radioGroup: "bgMode",
                value: "none",
                label: t("settings:background.modes.none"),
              },
            ],
          },
          { type: "separator" },
          {
            type: "checkbox",
            id: "card-elevation",
            checked: state.cardElevation,
            onCheckedChange: (value) => actions.setCardElevation(value),
            label: t("settings:atmospheric.cardElevation"),
          },
          {
            type: "checkbox",
            id: "action-glow",
            checked: state.actionGlow,
            onCheckedChange: (value) => actions.setActionGlow(value),
            label: t("settings:atmospheric.actionGlow"),
          },
        ],
      })

      // Workspace submenu
      items.push({
        id: "workspace",
        label: t("contextMenu:workspace"),
        icon: <Plus />,
        children: [
          {
            id: "new-workspace",
            label: t("contextMenu:newWorkspace"),
            onSelect: () => actions.addWorkspace(),
          },
          { type: "separator" },
          {
            id: "copy-workspace-id",
            label: t("contextMenu:copyWorkspaceId"),
            onSelect: () => void copyToClipboard(state.activeWorkspaceId ?? "", t("common:copyFailed")),
          },
        ],
      })

      return items
    },
    [actions, t],
  )

  // ────────────────────────────────────────────────────────────────────────
  // lane: swimlane actions (data-lane-id)
  // ────────────────────────────────────────────────────────────────────────
  const laneBuilder = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      const laneId = ctx.data.laneId
      if (!laneId) return null

      const state = getWorkspaceState()
      const lane = state.lanes.find((item) => item.id === laneId)
      if (!lane) return null

      const items: ContextMenuItemDef[] = [
        { type: "label", label: lane.label },
      ]

      // Collapse / Expand
      if (lane.collapsed) {
        items.push({
          id: "expand",
          label: t("contextMenu:expand"),
          icon: <Expand />,
          onSelect: () => actions.toggleLaneCollapse(laneId),
        })
      } else {
        items.push({
          id: "collapse",
          label: t("contextMenu:collapse"),
          icon: <Layers />,
          onSelect: () => actions.toggleLaneCollapse(laneId),
        })
      }

      // Hide Lane
      items.push({
        id: "hide-lane",
        label: t("common:hide"),
        icon: <EyeOff />,
        onSelect: () => actions.toggleLaneVisibility(laneId),
      })

      items.push({ type: "separator" })

      // Copy Lane ID
      items.push({
        id: "copy-lane-id",
        label: t("contextMenu:copyLaneId"),
        icon: <Copy />,
        onSelect: () => void copyToClipboard(laneId, t("common:copyFailed")),
      })

      // Delete Lane — with confirmation
      items.push({
        id: "delete-lane",
        label: t("contextMenu:deleteLane"),
        icon: <Trash2 />,
        destructive: true,
        confirm: {
          title: t("contextMenu:deleteLaneConfirmTitle"),
          description: t("contextMenu:deleteLaneConfirmDescription"),
          confirmLabel: t("common:confirm"),
          cancelLabel: t("common:cancel"),
          destructive: true,
        },
        onSelect: () => actions.removeLane(laneId),
      })

      return items
    },
    [actions, t],
  )

  // ────────────────────────────────────────────────────────────────────────
  // dockview-panel: dock tab component actions (data-component-id)
  // ────────────────────────────────────────────────────────────────────────
  const dockviewPanelBuilder = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      const id = ctx.data.componentId
      if (!id) return null

      // 多选时返回批量操作菜单
      const multi = buildMultiSelectionMenu(ctx)
      if (multi) return multi

      const state = getWorkspaceState()
      const comp = state.components.find((item) => item.id === id)
      if (!comp) return null

      return [
        {
          id: "close",
          label: t("common:close"),
          onSelect: () => actions.setComponentVisibility(id, "dockview", false),
        },
        {
          id: "reveal-in-cards",
          label: t("contextMenu:revealInCards"),
          icon: <Eye />,
          onSelect: () => {
            actions.setComponentVisibility(id, "cards", true)
            actions.setViewMode("cards")
          },
        },
        { type: "separator" },
        {
          id: "open-window",
          label: t("contextMenu:openWindow"),
          icon: <ExternalLink />,
          onSelect: () => {
            void openComponent({
              componentId: id,
              moduleId: comp.moduleId,
              title: comp.moduleId,
              width: Math.round(comp.size?.w ?? 384),
              height: Math.round(comp.size?.h ?? 320),
            }).then((result) => {
              if (result.success) {
                actions.setComponentState(id, "floating")
              }
            })
          },
        },
        { type: "separator" },
        {
          id: "copy-component-id",
          label: t("contextMenu:copyComponentId"),
          icon: <Copy />,
          onSelect: () => void copyToClipboard(id, t("common:copyFailed")),
        },
      ]
    },
    [actions, openComponent, t, buildMultiSelectionMenu],
  )

  // ────────────────────────────────────────────────────────────────────────
  // flow-node: flow canvas node actions (data-component-id)
  // ────────────────────────────────────────────────────────────────────────
  const flowNodeBuilder = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      const id = ctx.data.componentId
      if (!id) return null

      // 多选时返回批量操作菜单
      const multi = buildMultiSelectionMenu(ctx)
      if (multi) return multi

      return [
        {
          id: "raise",
          label: t("contextMenu:raise"),
          icon: <BringToFront />,
          onSelect: () => actions.raiseComponent(id),
        },
        {
          id: "reset-flow-size",
          label: t("contextMenu:resetFlowSize"),
          onSelect: () => actions.setComponentFlowSize(id, 320, 200),
        },
        { type: "separator" },
        {
          id: "hide-from-flow",
          label: t("contextMenu:hideFromFlow"),
          icon: <EyeOff />,
          onSelect: () => actions.setComponentVisibility(id, "flow", false),
        },
        { type: "separator" },
        {
          id: "copy-component-id",
          label: t("contextMenu:copyComponentId"),
          icon: <Copy />,
          onSelect: () => void copyToClipboard(id, t("common:copyFailed")),
        },
      ]
    },
    [actions, t, buildMultiSelectionMenu],
  )

  // ────────────────────────────────────────────────────────────────────────
  // bento-cell: bento grid cell actions (data-component-id)
  // ────────────────────────────────────────────────────────────────────────
  const bentoCellBuilder = useCallback(
    (ctx: ContextMenuContext): ContextMenuItemDef[] | null => {
      const id = ctx.data.componentId
      if (!id) return null

      // 多选时返回批量操作菜单
      const multi = buildMultiSelectionMenu(ctx)
      if (multi) return multi

      return [
        {
          id: "reset-bento-layout",
          label: t("contextMenu:resetBentoLayout"),
          onSelect: () => actions.setComponentBentoLayout(id, { x: 0, y: 0, w: 4, h: 4 }),
        },
        { type: "separator" },
        {
          id: "hide-from-bento",
          label: t("contextMenu:hideFromBento"),
          icon: <EyeOff />,
          onSelect: () => actions.setComponentVisibility(id, "bento", false),
        },
        { type: "separator" },
        {
          id: "copy-component-id",
          label: t("contextMenu:copyComponentId"),
          icon: <Copy />,
          onSelect: () => void copyToClipboard(id, t("common:copyFailed")),
        },
      ]
    },
    [actions, t, buildMultiSelectionMenu],
  )

  useContextMenuBuilder("component-card", componentCardBuilder)
  useContextMenuBuilder("workspace-canvas", workspaceCanvasBuilder)
  useContextMenuBuilder("lane", laneBuilder)
  useContextMenuBuilder("dockview-panel", dockviewPanelBuilder)
  useContextMenuBuilder("flow-node", flowNodeBuilder)
  useContextMenuBuilder("bento-cell", bentoCellBuilder)

  return null
}
