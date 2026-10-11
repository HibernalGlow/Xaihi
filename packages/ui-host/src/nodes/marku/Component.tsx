// Thin orchestrator for the Marku card: state wiring and node execution live
// here; the Normal-mode views sit in normal-views.tsx.
import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import type { MarkuAction, MarkuData, MarkuInput } from "@xiranite/node-marku/core"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { findModuleMeta } from "./constants"
import { actionLabel, buildInput, splitPaths, statusFromState } from "./model"
import { CollapsedView, CompactView, FullView, PortraitCompactView } from "./normal-views"
import type { MarkuCardState } from "./types"
import { CONFIG_FIELDS } from "./types"

type MarkuNodeConfig = Partial<MarkuCardState>

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

  const logs = data.logs ?? []
  const result = data.result ?? null
  const moduleMeta = findModuleMeta(data.module)
  const hasText = Boolean(data.inputText?.trim())
  const paths = splitPaths(data.pathText)
  const dryRun = data.dryRun ?? true
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<MarkuNodeConfig>()
      .then((response) => {
        if (response.config) setDefaults(response.config)
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

  async function execute(action: MarkuAction) {
    if (running) return
    const current = dataRef.current
    const input = buildInput(action, current)

    if ((action === "run" || action === "text") && !input.inputText && !input.paths?.length) {
      patch({ phase: "error", progress: 0, progressText: "请先输入 Markdown 文本或扫描路径。" })
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
