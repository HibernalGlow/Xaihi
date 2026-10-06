import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react"
import { useTranslation } from "react-i18next"
import { DESIGN_DIM_ATTR_PREFIX, DESIGN_DIMENSIONS } from "@/lib/design-theme/contract"
import {
  HTMLContainer,
  DefaultStylePanel,
  Rectangle2d,
  ShapeUtil,
  Tldraw,
  createShapeId,
  createTLStore,
  defaultShapeUtils,
  loadSnapshot,
  useEditor,
  type TLBaseShape,
  type TLIndicatorPath,
  type TLResizeInfo,
  type TLStore,
  type TLStoreSnapshot,
  type TLUiStylePanelProps,
} from "tldraw"
import "tldraw/tldraw.css"
import { Palette } from "lucide-react"
import { AppleResizeHandle } from "@/components/ui/apple-resize-handle"
import { ModuleRenderer } from "@/components/modules/ModuleRenderer"
import { getModule } from "@/components/modules/registry"
import { NodeSurfaceChrome, type NodeSurfaceChromeAction } from "@/components/workspace/NodeSurfaceChrome"
import { createSurfaceCommonActions } from "@/components/workspace/createSurfaceCommonActions"
import { useTheme } from "@/components/use-theme"
import { useWindowControls } from "@/hooks/useWindowControls"
import { isComponentVisibleInView } from "@/lib/componentVisibility"
import { useWorkspaceActions, useWorkspaceComponent, useWorkspaceShallowSelector, useWorkspaceVisibleComponents } from "@/store/workspaceStore"
import type { ComponentInstance, FlowCanvasCamera, FlowCanvasSnapshot } from "@/types/workspace"
// Patched zh-cn translation including the 4 keys missing from tldraw's official CDN
// (action.copy-hovered-styles, action.frame-selection, page-menu.max-pages-reached,
//  page-menu.resize). Served locally to silence the "missing messages" dev warning.
import zhCnTranslationUrl from "@/assets/tldraw-zh-cn.json?url"

// assetUrls must be memoized or defined outside of any React component (per tldraw docs).
const tldrawAssetUrls = { translations: { "zh-cn": zhCnTranslationUrl } }
const FLOW_CANVAS_SAVE_DELAY_MS = 900
const FLOW_CAMERA_SAVE_DELAY_MS = 300

type FlowCanvasRecord = {
  typeName?: string
  type?: string
}

function isFlowCanvasRecord(value: unknown): value is FlowCanvasRecord {
  return typeof value === "object" && value !== null
}

function isModuleShapeRecord(value: unknown): boolean {
  return isFlowCanvasRecord(value) && value.typeName === "shape" && value.type === ModuleShapeUtil.type
}

function getPersistableFlowCanvasSnapshot(snapshot: FlowCanvasSnapshot | undefined): FlowCanvasSnapshot | undefined {
  if (!snapshot || typeof snapshot !== "object") return snapshot
  const store = (snapshot as { store?: unknown }).store
  if (!store || typeof store !== "object") return snapshot

  let changed = false
  const persistableStore = Object.fromEntries(
    Object.entries(store as Record<string, unknown>).filter(([, record]) => {
      const keep = !isModuleShapeRecord(record)
      if (!keep) changed = true
      return keep
    }),
  )

  return changed ? { ...snapshot, store: persistableStore } : snapshot
}

function getSnapshotSignature(snapshot: FlowCanvasSnapshot | undefined): string {
  if (!snapshot) return ""
  try {
    return JSON.stringify(snapshot)
  } catch {
    return ""
  }
}

function getPersistableSnapshotSignature(snapshot: FlowCanvasSnapshot | undefined): string {
  return getSnapshotSignature(getPersistableFlowCanvasSnapshot(snapshot))
}

function normalizeFlowCanvasCamera(value: unknown): FlowCanvasCamera | undefined {
  if (!value || typeof value !== "object") return undefined
  const camera = value as Partial<Record<keyof FlowCanvasCamera, unknown>>
  if (
    typeof camera.x !== "number" ||
    typeof camera.y !== "number" ||
    typeof camera.z !== "number" ||
    !Number.isFinite(camera.x) ||
    !Number.isFinite(camera.y) ||
    !Number.isFinite(camera.z) ||
    camera.z <= 0
  ) {
    return undefined
  }

  return {
    x: Math.round(camera.x * 1000) / 1000,
    y: Math.round(camera.y * 1000) / 1000,
    z: Math.round(camera.z * 10000) / 10000,
  }
}

function getFlowCanvasCameraSignature(camera: FlowCanvasCamera | undefined): string {
  return camera ? `${camera.x}:${camera.y}:${camera.z}` : ""
}

function isCameraRecord(value: unknown): boolean {
  return isFlowCanvasRecord(value) && value.typeName === "camera"
}

function hasCameraChange(entry: unknown): boolean {
  const changes = (entry as { changes?: { added?: unknown; updated?: unknown; removed?: unknown } }).changes
  if (!changes) return false

  if (Object.values((changes.added ?? {}) as Record<string, unknown>).some(isCameraRecord)) return true
  if (Object.values((changes.removed ?? {}) as Record<string, unknown>).some(isCameraRecord)) return true
  return Object.values((changes.updated ?? {}) as Record<string, unknown>).some((value) =>
    Array.isArray(value) && (isCameraRecord(value[0]) || isCameraRecord(value[1]))
  )
}

function resolveRootColor(cssValue: string, fallback: string) {
  if (typeof document === "undefined") return fallback

  const probe = document.createElement("span")
  probe.style.color = cssValue
  probe.style.position = "fixed"
  probe.style.pointerEvents = "none"
  probe.style.opacity = "0"
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved || fallback
}

function syncTldrawThemeWithApp(editor: ReturnType<typeof useEditor>, signatureRef: { current: string }) {
  if (typeof editor.updateTheme !== "function" || typeof editor.getCurrentTheme !== "function") return

  const defaultTheme = "getTheme" in editor
    ? editor.getTheme("default") ?? editor.getCurrentTheme()
    : editor.getCurrentTheme()
  const selectionStroke = resolveRootColor("var(--primary)", "hsl(214, 84%, 56%)")
  const selectedContrast = resolveRootColor("var(--primary-foreground)", "#ffffff")
  const background = resolveRootColor("var(--background)", "#ffffff")
  const selectionFill = resolveRootColor(
    "color-mix(in oklch, var(--primary) 24%, transparent)",
    "rgba(68, 101, 233, 0.24)",
  )
  const signature = `${selectionStroke}|${selectionFill}|${selectedContrast}|${background}`
  if (signature === signatureRef.current) return
  signatureRef.current = signature

  editor.updateTheme({
    ...defaultTheme,
    colors: {
      light: {
        ...defaultTheme.colors.light,
        background,
        negativeSpace: background,
        selectionStroke,
        selectionFill,
        selectedContrast,
      },
      dark: {
        ...defaultTheme.colors.dark,
        background,
        negativeSpace: background,
        selectionStroke,
        selectionFill,
        selectedContrast,
      },
    },
  })
}

function useTldrawAppThemeBridge(editor: ReturnType<typeof useEditor>) {
  const signatureRef = useRef("")

  useEffect(() => {
    syncTldrawThemeWithApp(editor, signatureRef)

    const root = document.documentElement
    const observer = new MutationObserver(() => {
      syncTldrawThemeWithApp(editor, signatureRef)
    })
    observer.observe(root, {
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-app-theme",
        "data-theme-family",
        "data-theme-density",
        "data-theme-radius",
        "data-theme-border",
        "data-theme-motion",
        "data-theme-surface",
        "data-theme-depth",
        "data-theme-node-interior",
        "data-custom-theme",
        "data-custom-theme-name",
        // 高级主题（设计语言）可以只改维度开关而不碰任何 CSS 变量，
        // 那种变更在 style/class 上看不见，必须显式进这只眼睛。
        "data-app-design",
        ...DESIGN_DIMENSIONS.map((dimension) => `${DESIGN_DIM_ATTR_PREFIX}${dimension}`),
      ],
    })
    return () => observer.disconnect()
  }, [editor])
}

function isFlowCanvasVisible(component: ComponentInstance) {
  return isComponentVisibleInView(component, "flow")
}

type ModuleShapeProps = {
  w: number
  h: number
  moduleId: string
  compId: string
}

type ModuleShape = TLBaseShape<"module", ModuleShapeProps>

declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    module: ModuleShapeProps
  }
}

class ModuleShapeUtil extends ShapeUtil<ModuleShape> {
  static override type = "module" as const

  override getDefaultProps(): ModuleShape["props"] {
    return { w: 384, h: 320, moduleId: "", compId: "" }
  }

  override getGeometry(shape: ModuleShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      x: 0,
      y: 0,
      isFilled: true,
    })
  }

  override component(shape: ModuleShape) {
    return <ModuleShapeComponent shape={shape} />
  }

  override getIndicatorPath(shape: ModuleShape): TLIndicatorPath {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 6)
    return { path }
  }

  override canEdit() {
    return false
  }

  override isAspectRatioLocked() {
    return false
  }

  override canResize() {
    return true
  }

  override hideResizeHandles() {
    return true
  }

  override hideRotateHandle() {
    return true
  }

  // Module shapes are full interactive UIs. Selection background sits above the
  // HTML layer (z-index 500 > shapes 300) with pointer-events:all and would
  // swallow button/dropdown clicks once the shape is selected.
  override hideSelectionBoundsBg() {
    return true
  }

  override canBind() {
    return false
  }

  override onResize(shape: ModuleShape, info: TLResizeInfo<ModuleShape>): ModuleShape {
    const minW = 240
    const minH = 160
    const newW = Math.max(minW, info.initialBounds.width * info.scaleX)
    const newH = Math.max(minH, info.initialBounds.height * info.scaleY)
    return {
      ...shape,
      x: info.newPoint.x,
      y: info.newPoint.y,
      props: {
        ...shape.props,
        w: newW,
        h: newH,
      },
    }
  }
}

/** Controls that must keep their own pointer gesture (not become a tldraw drag). */
const FLOW_NODE_INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='option']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='slider']",
  "[contenteditable='true']",
  "[data-radix-collection-item]",
  "[data-slot='select-trigger']",
  "[data-slot='popover-trigger']",
  "[data-slot='dropdown-menu-trigger']",
].join(", ")

function isFlowNodeInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(FLOW_NODE_INTERACTIVE_SELECTOR))
}

/** Keep tldraw from turning control clicks into shape select/drag gestures. */
function stopFlowNodeControlPointer(event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>) {
  if (!isFlowNodeInteractiveTarget(event.target)) return
  event.stopPropagation()
}

function ModuleShapeComponent({ shape }: { shape: ModuleShape }) {
  const editor = useEditor()
  const resizingRef = useRef(false)
  const workspaceActions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const { t, i18n } = useTranslation()
  const { moduleId, compId, w, h } = shape.props
  const component = useWorkspaceComponent(compId)
  const mod = getModule(moduleId)
  const moduleName = i18n.exists(`module:${moduleId}.name`) ? t(`module:${moduleId}.name`) : (mod?.name ?? moduleId)

  const actions: NodeSurfaceChromeAction[] = createSurfaceCommonActions({
    componentId: compId,
    componentData: component?.data,
    currentMode: "flow",
    height: Math.round(h),
    moduleId,
    moduleName,
    openComponent,
    t,
    width: Math.round(w),
    workspaceActions,
  })
  const startResize = (target: HTMLDivElement, originX: number, originY: number, pointerId?: number) => {
    if (resizingRef.current) return
    resizingRef.current = true

    const startW = w
    const startH = h
    const zoom = typeof editor.getZoomLevel === "function" ? editor.getZoomLevel() : 1

    if (pointerId !== undefined) {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // Pointer capture can fail if the event was already released by the host browser.
      }
    }

    const onResizeMove = (moveEvent: globalThis.PointerEvent | globalThis.MouseEvent) => {
      const nextW = Math.max(240, startW + (moveEvent.clientX - originX) / zoom)
      const nextH = Math.max(160, startH + (moveEvent.clientY - originY) / zoom)
      editor.updateShape({
        id: shape.id,
        type: "module",
        props: {
          ...shape.props,
          w: nextW,
          h: nextH,
        },
      })
    }

    const stopResize = () => {
      resizingRef.current = false
      if (pointerId !== undefined) {
        try {
          target.releasePointerCapture(pointerId)
        } catch {
          // The browser may release capture before our cleanup path runs.
        }
      }
      window.removeEventListener("pointermove", onResizeMove)
      window.removeEventListener("mousemove", onResizeMove)
      window.removeEventListener("pointerup", stopResize)
      window.removeEventListener("pointercancel", stopResize)
      window.removeEventListener("mouseup", stopResize)
    }

    window.addEventListener("pointermove", onResizeMove)
    window.addEventListener("mousemove", onResizeMove)
    window.addEventListener("pointerup", stopResize, { once: true })
    window.addEventListener("pointercancel", stopResize, { once: true })
    window.addEventListener("mouseup", stopResize, { once: true })
  }

  const handleResizePointerStart = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    startResize(event.currentTarget, event.clientX, event.clientY, event.pointerId)
  }

  const handleResizeMouseStart = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    startResize(event.currentTarget, event.clientX, event.clientY)
  }

  return (
    <HTMLContainer
      data-component-id={compId}
      data-context-menu="flow-node"
      className="xiranite-component-surface group relative flex flex-col overflow-visible rounded-md bg-card/72 text-card-foreground outline outline-1 outline-transparent shadow-[0_18px_50px_-36px_oklch(0_0_0/0.42)] backdrop-blur-md transition-[background-color,box-shadow,outline-color] hover:bg-card/82 hover:outline-border/35 hover:shadow-[0_22px_58px_-34px_oklch(0_0_0/0.5)]"
      // tldraw sets .tl-html-container { pointer-events: none }; opt into real UI hits.
      style={{ width: w, height: h, pointerEvents: "all" }}
      onPointerDownCapture={stopFlowNodeControlPointer}
      onMouseDownCapture={stopFlowNodeControlPointer}
    >
      <NodeSurfaceChrome actions={actions} moduleId={moduleId} moduleName={moduleName} version={mod?.version} />
      <div className="min-h-0 flex-1 overflow-hidden rounded-b-md pointer-events-auto">
        {moduleId && compId && (
          <ModuleRenderer moduleId={moduleId} compId={compId} />
        )}
      </div>
      <AppleResizeHandle
        interactive
        outside
        onMouseDown={handleResizeMouseStart}
        onPointerDown={handleResizePointerStart}
      />
    </HTMLContainer>
  )
}

function useSyncShapesFromStore(
  editor: ReturnType<typeof useEditor> | null,
  syncingShapeDeletesRef: { current: boolean },
) {
  const visibleComponents = useWorkspaceVisibleComponents()
  const lastSigRef = useRef<string>("")

  useEffect(() => {
    if (!editor) return

    const flowComps = visibleComponents.filter(isFlowCanvasVisible)
    const desired = flowComps.map((comp, index) => ({
      id: createShapeId(comp.id),
      type: "module" as const,
      x: comp.flowPosition?.x ?? 100 + (index % 3) * 440,
      y: comp.flowPosition?.y ?? 100 + Math.floor(index / 3) * 380,
      props: {
        w: comp.flowSize?.width ?? 384,
        h: comp.flowSize?.height ?? 320,
        moduleId: comp.moduleId,
        compId: comp.id,
      },
    })) as ModuleShape[]

    const sig = JSON.stringify(desired)
    if (sig === lastSigRef.current) return
    lastSigRef.current = sig

    const currentModuleShapes = editor.getCurrentPageShapes().filter((shape): shape is ModuleShape => shape.type === ModuleShapeUtil.type)
    const currentIds = new Set(currentModuleShapes.map((shape) => shape.id))
    const desiredIds = new Set(desired.map((shape) => shape.id))

    const toRemove = currentModuleShapes.filter((shape) => !desiredIds.has(shape.id)).map((shape) => shape.id)
    if (toRemove.length) {
      syncingShapeDeletesRef.current = true
      try {
        editor.deleteShapes(toRemove)
      } finally {
        syncingShapeDeletesRef.current = false
      }
    }

    const missingDesired = desired.filter((shape) => !currentIds.has(shape.id))
    const toUpdate = desired.filter((shape) => currentIds.has(shape.id))

    if (missingDesired.length) editor.createShapes(missingDesired)
    if (toUpdate.length) editor.updateShapes(toUpdate)
  }, [editor, syncingShapeDeletesRef, visibleComponents])
}

function useSyncChangesToStore(editor: ReturnType<typeof useEditor> | null) {
  const workspaceActions = useWorkspaceActions()

  useEffect(() => {
    if (!editor) return
    return editor.sideEffects.registerAfterChangeHandler(
      "shape",
      (prev, next) => {
        if (next.type !== "module") return
        const shape = next as ModuleShape
        const { compId, w, h } = shape.props
        if (!compId) return

        if (prev?.x !== next.x || prev?.y !== next.y) {
          workspaceActions.setComponentFlowPos(compId, next.x, next.y)
        }
        if (prev?.type === "module") {
          const previousShape = prev as ModuleShape
          if (previousShape.props.w !== w || previousShape.props.h !== h) {
            workspaceActions.setComponentFlowSize(compId, w, h)
          }
        }
      },
    )
  }, [editor, workspaceActions])
}

function useSyncDeletedShapesToStore(
  editor: ReturnType<typeof useEditor> | null,
  syncingShapeDeletesRef: { current: boolean },
) {
  const workspaceActions = useWorkspaceActions()

  useEffect(() => {
    if (!editor) return
    return editor.sideEffects.registerAfterDeleteHandler(
      "shape",
      (deleted) => {
        if (syncingShapeDeletesRef.current) return
        if (deleted.type !== "module") return

        const compId = (deleted as ModuleShape).props.compId
        if (!compId) return

        workspaceActions.setComponentVisibility(compId, "flow", false)
      },
    )
  }, [editor, syncingShapeDeletesRef, workspaceActions])
}

function useSyncSelectionWithStore(editor: ReturnType<typeof useEditor> | null) {
  const workspaceActions = useWorkspaceActions()
  const selectedComponentIds = useWorkspaceShallowSelector((state) => state.selectedComponentIds)
  const syncingRef = useRef(false)

  // tldraw → store：监听 tldraw 框选/点击选中变化，同步到 workspace store
  useEffect(() => {
    if (!editor) return

    return editor.sideEffects.registerAfterChangeHandler(
      "instance_page_state",
      (prev, next) => {
        // 正在由 store → tldraw 同步时跳过，避免循环更新
        if (syncingRef.current) return
        // 选中集合未变化时跳过
        if (prev?.selectedShapeIds === next.selectedShapeIds) return

        const compIds = editor
          .getSelectedShapes()
          .filter((shape): shape is ModuleShape => shape.type === ModuleShapeUtil.type)
          .map((shape) => shape.props.compId)
          .filter((id): id is string => Boolean(id))

        syncingRef.current = true
        workspaceActions.setSelection(compIds)
        syncingRef.current = false
      },
    )
  }, [editor, workspaceActions])

  // store → tldraw：当 store 选中变化时，同步到 tldraw
  useEffect(() => {
    if (!editor) return
    if (syncingRef.current) return

    const desiredShapeIds = selectedComponentIds.map((compId) => createShapeId(compId))
    const currentShapeIds = editor.getSelectedShapeIds()
    // 比较是否一致，一致则跳过，避免循环更新
    const sameSelection =
      desiredShapeIds.length === currentShapeIds.length &&
      desiredShapeIds.every((id) => currentShapeIds.includes(id))
    if (sameSelection) return

    syncingRef.current = true
    editor.setSelectedShapes(desiredShapeIds)
    syncingRef.current = false
  }, [editor, selectedComponentIds])
}

function usePersistFlowCanvasToWorkspace(
  editor: ReturnType<typeof useEditor> | null,
  workspaceId: string,
  flowCanvas: FlowCanvasSnapshot | undefined,
  localPersistedSignatureRef: { current: string },
) {
  const workspaceActions = useWorkspaceActions()
  const persistedSignatureRef = useRef(getPersistableSnapshotSignature(flowCanvas))

  useEffect(() => {
    persistedSignatureRef.current = getPersistableSnapshotSignature(flowCanvas)
  }, [flowCanvas])

  useEffect(() => {
    if (!editor) return undefined

    let saveTimer: ReturnType<typeof setTimeout> | undefined
    if (!persistedSignatureRef.current) {
      persistedSignatureRef.current = getPersistableSnapshotSignature(
        editor.store.getStoreSnapshot("document") as FlowCanvasSnapshot,
      )
    }

    const persistSnapshot = () => {
      saveTimer = undefined
      const snapshot = getPersistableFlowCanvasSnapshot(
        editor.store.getStoreSnapshot("document") as FlowCanvasSnapshot,
      )
      const signature = getSnapshotSignature(snapshot)
      if (!signature || signature === persistedSignatureRef.current) return

      persistedSignatureRef.current = signature
      localPersistedSignatureRef.current = signature
      workspaceActions.setWorkspaceFlowCanvas(workspaceId, snapshot)
    }

    const schedulePersist = () => {
      if (saveTimer !== undefined) clearTimeout(saveTimer)
      saveTimer = setTimeout(persistSnapshot, FLOW_CANVAS_SAVE_DELAY_MS)
    }

    const disposeStoreListener = editor.store.listen(() => {
      schedulePersist()
    })
    const disposeCreateShapeListener = editor.sideEffects.registerAfterCreateHandler("shape", schedulePersist)
    const disposeChangeShapeListener = editor.sideEffects.registerAfterChangeHandler("shape", schedulePersist)
    const disposeDeleteShapeListener = editor.sideEffects.registerAfterDeleteHandler("shape", schedulePersist)

    return () => {
      disposeStoreListener()
      disposeCreateShapeListener()
      disposeChangeShapeListener()
      disposeDeleteShapeListener()
      if (saveTimer === undefined) return
      clearTimeout(saveTimer)
      persistSnapshot()
    }
  }, [editor, localPersistedSignatureRef, workspaceActions, workspaceId])
}

function usePersistFlowCameraToWorkspace(
  editor: ReturnType<typeof useEditor> | null,
  workspaceId: string,
  flowCamera: FlowCanvasCamera | undefined,
) {
  const workspaceActions = useWorkspaceActions()
  const persistedSignatureRef = useRef(getFlowCanvasCameraSignature(normalizeFlowCanvasCamera(flowCamera)))

  useEffect(() => {
    persistedSignatureRef.current = getFlowCanvasCameraSignature(normalizeFlowCanvasCamera(flowCamera))
  }, [flowCamera])

  useEffect(() => {
    if (!editor) return
    const camera = normalizeFlowCanvasCamera(flowCamera)
    if (!camera) return

    const signature = getFlowCanvasCameraSignature(camera)
    const currentSignature = getFlowCanvasCameraSignature(normalizeFlowCanvasCamera(editor.getCamera()))
    if (signature === currentSignature) return

    editor.setCamera(camera, { immediate: true, force: true })
  }, [editor, flowCamera, workspaceId])

  useEffect(() => {
    if (!editor) return undefined

    let saveTimer: ReturnType<typeof setTimeout> | undefined

    const persistCamera = () => {
      saveTimer = undefined
      const camera = normalizeFlowCanvasCamera(editor.getCamera())
      const signature = getFlowCanvasCameraSignature(camera)
      if (!camera || !signature || signature === persistedSignatureRef.current) return

      persistedSignatureRef.current = signature
      workspaceActions.setWorkspaceFlowCamera(workspaceId, camera)
    }

    const schedulePersist = () => {
      if (saveTimer !== undefined) clearTimeout(saveTimer)
      saveTimer = setTimeout(persistCamera, FLOW_CAMERA_SAVE_DELAY_MS)
    }

    const disposeCameraListener = editor.store.listen((entry) => {
      if (hasCameraChange(entry)) schedulePersist()
    }, { scope: "session" })

    return () => {
      disposeCameraListener()
      if (saveTimer === undefined) return
      clearTimeout(saveTimer)
      persistCamera()
    }
  }, [editor, workspaceActions, workspaceId])
}

const customShapeUtils = [...defaultShapeUtils, ModuleShapeUtil]

function createFlowCanvasStore(flowCanvas: FlowCanvasSnapshot | undefined): TLStore {
  return createTLStore({
    shapeUtils: customShapeUtils,
    snapshot: flowCanvas as TLStoreSnapshot | undefined,
  })
}

function useFlowCanvasStore(
  workspaceId: string,
  flowCanvas: FlowCanvasSnapshot | undefined,
  localPersistedSignatureRef: { current: string },
) {
  const flowCanvasSignature = getSnapshotSignature(flowCanvas)
  const [storeState, setStoreState] = useState(() => ({
    workspaceId,
    loadedSignature: flowCanvasSignature,
    store: createFlowCanvasStore(flowCanvas),
  }))

  if (storeState.workspaceId !== workspaceId) {
    const nextState = {
      workspaceId,
      loadedSignature: flowCanvasSignature,
      store: createFlowCanvasStore(flowCanvas),
    }
    setStoreState(nextState)
    return nextState.store
  }

  useEffect(() => {
    if (!flowCanvas || !flowCanvasSignature) return
    if (storeState.loadedSignature === flowCanvasSignature) return

    if (localPersistedSignatureRef.current === flowCanvasSignature) {
      setStoreState((state) =>
        state.workspaceId === workspaceId
          ? { ...state, loadedSignature: flowCanvasSignature }
          : state
      )
      return
    }

    loadSnapshot(storeState.store, flowCanvas as TLStoreSnapshot)
    setStoreState((state) =>
      state.workspaceId === workspaceId
        ? { ...state, loadedSignature: flowCanvasSignature }
        : state
    )
  }, [flowCanvas, flowCanvasSignature, localPersistedSignatureRef, storeState.loadedSignature, storeState.store, workspaceId])

  return storeState.store
}

function FlowCanvas({
  workspaceId,
  flowCanvas,
  flowCamera,
  localPersistedSignatureRef,
}: {
  workspaceId: string
  flowCanvas?: FlowCanvasSnapshot
  flowCamera?: FlowCanvasCamera
  localPersistedSignatureRef: { current: string }
}) {
  const editor = useEditor()
  const syncingShapeDeletesRef = useRef(false)

  useTldrawAppThemeBridge(editor)
  useSyncShapesFromStore(editor, syncingShapeDeletesRef)
  useSyncChangesToStore(editor)
  useSyncDeletedShapesToStore(editor, syncingShapeDeletesRef)
  useSyncSelectionWithStore(editor)
  usePersistFlowCanvasToWorkspace(editor, workspaceId, flowCanvas, localPersistedSignatureRef)
  usePersistFlowCameraToWorkspace(editor, workspaceId, flowCamera)

  return null
}

function CollapsibleStylePanel(props: TLUiStylePanelProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        className="xiranite-tldraw-style-panel-toggle"
        aria-label="展开画布调色盘"
        title="展开画布调色盘"
        onClick={() => setOpen(true)}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="xiranite-tldraw-style-panel">
      <button
        type="button"
        className="xiranite-tldraw-style-panel-toggle xiranite-tldraw-style-panel-toggle--open"
        aria-label="收起画布调色盘"
        title="收起画布调色盘"
        onClick={() => setOpen(false)}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
      </button>
      <DefaultStylePanel {...props} />
    </div>
  )
}

export function FlowCanvasView() {
  const { theme } = useTheme()
  const localPersistedSignatureRef = useRef("")
  const { activeWorkspaceId, flowCanvas, flowCamera } = useWorkspaceShallowSelector((state) => {
    const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)
    return {
      activeWorkspaceId: state.activeWorkspaceId,
      flowCanvas: activeWorkspace?.flowCanvas,
      flowCamera: activeWorkspace?.flowCamera,
    }
  })
  const store = useFlowCanvasStore(activeWorkspaceId, flowCanvas, localPersistedSignatureRef)

  return (
    <div className="xiranite-flow-canvas h-full min-h-0 w-full">
      <Tldraw
        key={activeWorkspaceId}
        store={store}
        shapeUtils={customShapeUtils}
        colorScheme={theme}
        assetUrls={tldrawAssetUrls}
        options={{ maxPages: 1 }}
        components={{ PageMenu: () => null, MainMenu: () => null, StylePanel: CollapsibleStylePanel }}
      >
        <FlowCanvas
          workspaceId={activeWorkspaceId}
          flowCanvas={flowCanvas}
          flowCamera={flowCamera}
          localPersistedSignatureRef={localPersistedSignatureRef}
        />
      </Tldraw>
    </div>
  )
}
