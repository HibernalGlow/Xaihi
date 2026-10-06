// Thin orchestrator for the Marku card: state wiring, node execution and mode
// switching live here; Normal-mode views sit in normal-views.tsx and the
// Workflow mode is lazy-loaded so React Flow never enters the Normal bundle.
import { Suspense, lazy, useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import type { MarkuAction, MarkuData, MarkuInput, MarkuWorkflowLibrary } from "@xiranite/node-marku/core"
import { normalizeMarkuWorkflowLibrary } from "@xiranite/node-marku/workflow"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { findModuleMeta } from "./constants"
import { actionLabel, buildInput, parseConfig, splitPaths, statusFromState } from "./model"
import { CollapsedView, CompactView, FullView, PortraitCompactView } from "./normal-views"
import type { MarkuCardState } from "./types"
import { CONFIG_FIELDS } from "./types"
import { enterWorkflowMode, exitWorkflowMode } from "./workflow-state"

const WorkflowPanel = lazy(() => import("./WorkflowPanel"))

type MarkuNodeConfig = Partial<MarkuCardState> & { workflowLibrary?: unknown }

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const data = host.getData<MarkuCardState>(compId) ?? {}
  const dataRef = useRef<MarkuCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<MarkuCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)
  const [library, setLibrary] = useState<MarkuWorkflowLibrary>(() => normalizeMarkuWorkflowLibrary(undefined))
  const librarySaveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const logs = data.logs ?? []
  const result = data.result ?? null
  const moduleMeta = findModuleMeta(data.module)
  const hasText = Boolean(data.inputText?.trim())
  const paths = splitPaths(data.pathText)
  const dryRun = data.dryRun ?? true
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const workflowMode = data.mode === "workflow"
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<MarkuNodeConfig>()
      .then((response) => {
        const { workflowLibrary, ...cardDefaults } = response.config ?? {}
        const nextLibrary = normalizeMarkuWorkflowLibrary(workflowLibrary)
        if (response.config) setDefaults(cardDefaults)
        setLibrary(nextLibrary)
        const current = dataRef.current
        if (current.mode === "workflow" && !current.workflowDraft) {
          const currentModule = findModuleMeta(current.module)
          patch(enterWorkflowMode(current, nextLibrary, {
            module: currentModule.id,
            config: parseConfig(current.configText),
          }))
        }
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.inputText,
    data.pathText,
    data.module,
    data.configText,
    data.recursive,
    data.dryRun,
    data.enableUndo,
    data.historyPath,
    defaults,
  ])

  function patch(patchData: Partial<MarkuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function pasteText() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ inputText: text })
  }

  async function pastePath() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathText: text.trim() })
  }

  async function copyOutput() {
    const text = result?.outputText || result?.diffText || result?.diffs.map((item) => item.diff).join("\n") || ""
    if (text) await host.clipboard?.writeText?.(text)
  }

  async function copyLogs() {
    if (logs.length) await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function copyText(text: string) {
    if (text) await host.clipboard?.writeText?.(text)
  }

  async function execute(action: MarkuAction) {
    if (running) return
    const current = dataRef.current
    const input = buildInput(action, current)

    if ((action === "run" || action === "text" || action === "workflow") && !input.inputText && !input.paths?.length) {
      patch({ phase: "error", progress: 0, progressText: "请先输入 Markdown 文本或扫描路径。" })
      return
    }
    if (action === "workflow" && !current.workflowDraft?.steps.length) {
      patch({ phase: "error", progress: 0, progressText: "工作流至少需要一个步骤。" })
      return
    }
    if (action === "undo" && !current.result?.undoId && !current.result?.history.length) {
      patch({ phase: "error", progress: 0, progressText: "没有可撤销的历史记录。" })
      return
    }

    const run = host.actions?.run
    if (!run) {
      patch({ phase: "error", progress: 0, progressText: "当前环境没有本地运行能力，请使用桌面模式或 CLI。" })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    try {
      patch({ phase: "running", progress: 0, progressText: `${actionLabel(action)}开始` })
      const response = await run<MarkuInput, MarkuData>("marku", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<MarkuData>

      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: response.data ?? null,
        ...(action === "workflow" ? { workflowRun: response.data?.workflow ?? null } : {}),
      })
      pushLog(response.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
    } finally {
      setRunning(false)
    }
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<MarkuCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = dataRef.current[field]
      if (value !== undefined && value !== "") (config as Record<string, unknown>)[field] = value
    }
    await host.saveNodeConfig?.(config)
    setDefaults(config)
    setConfigDirty(false)
  }

  function restoreDefault() {
    if (defaults) patch(defaults)
  }

  function resetOverride() {
    patch({
      inputText: undefined,
      pathText: undefined,
      module: undefined,
      configText: undefined,
      recursive: undefined,
      dryRun: undefined,
      enableUndo: undefined,
      historyPath: undefined,
    })
  }

  function enterWorkflow() {
    const current = dataRef.current
    patch(enterWorkflowMode(current, library, { module: moduleMeta.id, config: parseConfig(current.configText) }))
  }

  function exitWorkflow() {
    patch(exitWorkflowMode())
  }

  /** Persists the library via the config service (shallow merge keeps other keys). */
  async function saveLibrary(next: MarkuWorkflowLibrary) {
    setLibrary(next)
    const persist = async () => {
      await host.saveNodeConfig?.({ workflowLibrary: next })
    }
    const pending = librarySaveQueueRef.current.catch(() => undefined).then(persist)
    librarySaveQueueRef.current = pending
    try {
      await pending
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patch({ phase: "error", progressText: `保存工作流失败：${message}` })
      pushLog(`Workflow library save failed: ${message}`)
    }
  }

  const viewProps = {
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    hasText,
    logs,
    moduleMeta,
    pathCount: paths.length,
    progress,
    result,
    running,
    status,
    onCopyLogs: copyLogs,
    onCopyOutput: copyOutput,
    onEnterWorkflow: enterWorkflow,
    onExecute: execute,
    onModuleChange: (value: string) => patch({ module: value }),
    onOpenConfigFile: host.openConfigFile,
    onPastePath: pastePath,
    onPasteText: pasteText,
    onPatch: patch,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/marku relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow />
        <div className="relative flex min-h-0 w-full flex-col">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...viewProps} />
          ) : workflowMode ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">正在加载工作流编辑器…</div>}>
              <WorkflowPanel
                compact={compactSurface}
                data={data}
                library={library}
                progress={progress}
                running={running}
                status={status}
                onCopyText={copyText}
                onExecute={execute}
                onExitWorkflow={exitWorkflow}
                onPastePath={pastePath}
                onPasteText={pasteText}
                onPatch={patch}
                onSaveLibrary={saveLibrary}
              />
            </Suspense>
          ) : compactSurface ? (
            portraitCompact ? <PortraitCompactView {...viewProps} /> : <CompactView {...viewProps} />
          ) : (
            <FullView {...viewProps} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
