import { useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { useNodeSurface } from "./useNodeSurface"

/** 节点 card state 的运行时字段，由 controller 内部维护 */
export interface NodeCardRuntimeState<TData = unknown> {
  phase?: string
  progress?: number
  progressText?: string
  result?: TData | null
  logs?: string[]
}

export interface NodeCardControllerOptions<TState, TInput> {
  /** 节点 ID，如 "trename" */
  nodeId: string
  /** 从 card state 构建 runner input */
  buildInput: (data: TState) => TInput
  /** 可保存到 TOML 的配置字段名列表 */
  configFields?: Array<keyof TState>
  /** 日志缓冲区上限，默认 120 */
  logLimit?: number
}

export interface NodeCardController<TState, TInput, TData> {
  surface: ReturnType<typeof useNodeSurface>
  data: TState
  dataRef: RefObject<TState>
  running: boolean
  defaults: Partial<TState> | undefined
  configFilePath: string | undefined
  configDirty: boolean
  compactSurface: boolean
  forceCollapsedSurface: boolean
  portraitCompact: boolean
  patch: (patchData: Partial<TState>) => void
  pushLog: (message: string) => void
  paste: (field: keyof TState) => Promise<void>
  execute: (
    input: TInput,
    onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void,
  ) => Promise<NodeRunResult<TData> | undefined>
  reset: (resetData?: Partial<TState>) => void
  saveAsDefault: () => Promise<void>
  restoreDefault: () => void
  resetOverride: () => void
  copyToClipboard: (text: string) => Promise<void>
}

export function useNodeCardController<TState extends NodeCardRuntimeState<TData>, TInput, TData>(
  compId: string,
  host: NodeComponentProps["host"],
  options: NodeCardControllerOptions<TState, TInput>,
): NodeCardController<TState, TInput, TData> {
  const { nodeId, configFields, logLimit = 120 } = options

  const surface = useNodeSurface()
  const data = host.getData<TState>(compId) ?? ({} as TState)
  const dataRef = useRef<TState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<TState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact =
    surface.mode === "portrait" ||
    (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<TState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  const configFieldsKey = configFields?.join(",") ?? ""
  const configValuesKey = (configFields ?? [])
    .map((field) => String(data[field] ?? ""))
    .join("\u0001")
  useEffect(() => {
    if (!defaults || !configFields?.length) return
    setConfigDirty(
      configFields.some(
        (field) => String(data[field] ?? "") !== String(defaults[field] ?? ""),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configValuesKey, configFieldsKey, defaults])

  function patch(patchData: Partial<TState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData as Record<string, unknown>)
  }

  /**
   * Internal writes that only touch the runtime subset of the card state. TState is
   * constrained to NodeCardRuntimeState<TData>, so these keys always exist with these
   * types, but TS cannot prove a literal satisfies the unresolved Partial<TState> — the
   * single cast below is that gap, not an unchecked escape hatch for callers.
   */
  function patchRuntime(patchData: Partial<NodeCardRuntimeState<TData>>) {
    patch(patchData as Partial<TState>)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-logLimit)
    patchRuntime({ logs: nextLogs })
  }

  async function paste(field: keyof TState) {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ [field]: text.trim() } as Partial<TState>)
  }

  async function execute(
    input: TInput,
    onEvent?: (event: { type: "progress" | "log"; progress?: number; message: string }) => void,
  ): Promise<NodeRunResult<TData> | undefined> {
    if (running) return undefined
    const run = host.actions?.run
    if (!run) {
      patchRuntime({
        phase: "error",
        progress: 0,
        progressText: "当前环境没有本地运行能力，请使用桌面模式或 CLI。",
      })
      pushLog("Native action is unavailable in this host.")
      return undefined
    }

    setRunning(true)
    try {
      patchRuntime({ phase: "running", progress: 0 })
      const response = (await run<TInput, TData>(nodeId, input, (event) => {
        if (event.type === "progress") {
          patchRuntime({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
        onEvent?.(event)
      })) as NodeRunResult<TData>

      patchRuntime({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: response.data ?? null,
      })
      pushLog(response.message)
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patchRuntime({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
      return undefined
    } finally {
      setRunning(false)
    }
  }

  function reset(resetData?: Partial<TState>) {
    patchRuntime({
      phase: "idle",
      progress: 0,
      progressText: "",
      result: null,
      logs: [],
      ...resetData,
    })
  }

  async function saveAsDefault() {
    const config: Record<string, unknown> = {}
    for (const field of configFields ?? []) {
      const value = dataRef.current[field]
      if (value !== undefined) config[String(field)] = value
    }
    const saved = config as Partial<TState>
    await host.saveNodeConfig?.(saved)
    setDefaults(saved)
    setConfigDirty(false)
  }

  function restoreDefault() {
    if (defaults) patch(defaults)
  }

  function resetOverride() {
    if (!configFields?.length) return
    const reset: Record<string, unknown> = {}
    for (const field of configFields) {
      reset[String(field)] = undefined
    }
    patch(reset as Partial<TState>)
  }

  async function copyToClipboard(text: string) {
    await host.clipboard?.writeText?.(text)
  }

  return {
    surface,
    data,
    dataRef,
    running,
    defaults,
    configFilePath,
    configDirty,
    compactSurface,
    forceCollapsedSurface,
    portraitCompact,
    patch,
    pushLog,
    paste,
    execute,
    reset,
    saveAsDefault,
    restoreDefault,
    resetOverride,
    copyToClipboard,
  }
}
