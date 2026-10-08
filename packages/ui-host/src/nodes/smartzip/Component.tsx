import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { SmartZipAction, SmartZipData, SmartZipInput } from "@xiranite/node-smartzip/core"
import { FileArchive, LoaderCircle, Play, RotateCcw, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { tNode, useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { ACTIONS, actionI18nKey, isDestructiveAction } from "./constants"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import {
  ActionIconButton,
  OptionsPopover,
  PathFields,
  PathsInput,
  RuntimeOptions,
  StatusStrip,
} from "./controls"
import { SmartZipResultTabs, SmartZipStatsPanel } from "./results"
import type { SmartZipCardState, SmartZipStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"
import { RunStateIcon } from "@/nodes/shared/controls"

export function Component({ compId, host }: NodeComponentProps<SmartZipCardState, Partial<SmartZipCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("smartzip")
  const data = getHostData(host, compId)
  const dataRef = useRef<SmartZipCardState>(data)
  dataRef.current = data
  const passwordSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const passwordSaveChainRef = useRef<Promise<void>>(Promise.resolve())

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<SmartZipCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)
  const resolvedData = resolveCardData(data, defaults)

  const action = data.action ?? "status"
  const actionMeta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[0]!
  const result = data.result ?? null
  const logs = data.logs ?? []
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    const loadConfig = host.config?.get?.() ?? host.getNodeConfig?.()
    loadConfig
      ?.then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => () => {
    if (passwordSaveTimerRef.current) clearTimeout(passwordSaveTimerRef.current)
  }, [])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => data[field] !== undefined && String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.iniPath,
    data.passwords,
    data.codePage,
    data.databasePath,
    data.dryRun,
    data.recordRun,
    defaults,
  ])

  function patch(patchData: Partial<SmartZipCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    if (host.state?.patchData) host.state.patchData(patchData)
    else host.patchData(compId, patchData)
  }

  function patchWithPasswordAutosave(patchData: Partial<SmartZipCardState>) {
    patch(patchData)
    if (!Object.prototype.hasOwnProperty.call(patchData, "passwords") || !patchData.passwords) return
    if (passwordSaveTimerRef.current) clearTimeout(passwordSaveTimerRef.current)
    const passwords = [...patchData.passwords]
    passwordSaveTimerRef.current = setTimeout(() => {
      passwordSaveTimerRef.current = undefined
      passwordSaveChainRef.current = passwordSaveChainRef.current
        .catch(() => undefined)
        .then(() => persistPasswords(passwords))
    }, 250)
  }

  async function persistPasswords(passwords: string[]) {
    const resolved = resolveCardData(dataRef.current, defaults)
    const config: Partial<SmartZipCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = field === "passwords" ? passwords : resolved[field]
      if (value !== undefined) (config as Record<string, unknown>)[field] = value
    }
    if (host.config?.save) await host.config.save(config)
    else await host.saveNodeConfig?.(config)
    setDefaults(config)
    setConfigDirty(false)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function pastePaths() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ pathsText: text.trim() })
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function copyResults() {
    const current = dataRef.current.result
    if (!current) return
    const lines: string[] = []
    if (current.command) lines.push(`${current.command.label}\t${current.command.command}\t${current.command.args.join(" ")}`)
    if (current.commandResult) lines.push(`code=${current.commandResult.code}\tstderr=${current.commandResult.stderr}`)
    for (const operation of current.operations ?? []) lines.push(`${operation.status}\t${operation.sourcePath}\t${operation.outputPath ?? operation.message}`)
    if (current.config) lines.push(`ext=${current.config.archiveExtensions.join(",")}`)
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  function reset() {
    patch({ logs: [], phase: "idle", progress: 0, progressText: "", result: null })
  }

  async function saveAsDefault() {
    const config: Partial<SmartZipCardState> = {}
    const resolved = resolveCardData(dataRef.current, defaults)
    for (const field of CONFIG_FIELDS) {
      const value = resolved[field]
      if (value !== undefined) (config as Record<string, unknown>)[field] = value
    }
    if (host.config?.save) await host.config.save(config)
    else await host.saveNodeConfig?.(config)
    setDefaults(config)
    setConfigDirty(false)
  }

  function restoreDefault() {
    if (defaults) patch(defaults)
  }

  function resetOverride() {
    const empty: Partial<SmartZipCardState> = {}
    for (const field of CONFIG_FIELDS) empty[field] = undefined
    patch(empty)
  }

  async function execute(nextAction: SmartZipAction = action) {
    if (running) return
    const current = dataRef.current
    if (nextAction !== "status" && !clean(current.pathsText)) {
      const message = t("error.noPaths", "请先输入至少一个归档或目录路径。")
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
      return
    }

    const run = host.runner?.run ?? host.actions?.run
    if (!run) {
      const message = t("error.noRunEnv", "当前环境没有本地运行能力，请使用桌面模式或 CLI。")
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog("Native action is unavailable in this host.")
      return
    }

    setRunning(true)
    patch({ action: nextAction, phase: "running", progress: 0, progressText: t("progress.start", "{{action}}开始", { action: actionLabel(nextAction) }), result: null })
    try {
      const response = await run<SmartZipInput, SmartZipData>("smartzip", buildInput(nextAction, current, defaults), (event: NodeRunEvent) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
          return
        }
        pushLog(event.message)
      }) as NodeRunResult<SmartZipData>

      for (const error of response.data?.errors ?? []) pushLog(`[error] ${error}`)

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

  const commonProps = {
    action,
    actionMeta,
    configDirty,
    configFilePath,
    data: resolvedData,
    defaults,
    logs,
    progress,
    result,
    running,
    status,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.config?.openFile ?? host.openConfigFile,
    onPastePaths: pastePaths,
    onPatch: patchWithPasswordAutosave,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/smartzip relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow primaryAt={[16, 0]} primaryStrength={14} accentAt={[86, 8]} />
        <div className="relative flex min-h-0 w-full flex-col">
          {surface.mode === "collapsed" || forceCollapsedSurface ? (
            <CollapsedView {...commonProps} />
          ) : compactSurface ? (
            portraitCompact ? <PortraitCompactView {...commonProps} /> : <CompactView {...commonProps} />
          ) : (
            <FullView {...commonProps} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

type ViewProps = ReturnType<typeof createViewProps>

function createViewProps(props: {
  action: SmartZipAction
  actionMeta: typeof ACTIONS[number]
  configDirty: boolean
  configFilePath?: string
  data: SmartZipCardState
  defaults?: Partial<SmartZipCardState>
  logs: string[]
  progress: number
  result: SmartZipData | null
  running: boolean
  status: SmartZipStatusMeta
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: SmartZipAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePaths: () => void
  onPatch: (patch: Partial<SmartZipCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  const Icon = props.actionMeta.icon
  return (
    <div data-testid="smartzip-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <FileArchive />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>SmartZip</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{summaryText(props)}</span>
        </div>
      </div>
      <RunActionButton compact props={props} />
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="smartzip-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine actionMeta={props.actionMeta} status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <PathsInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
        <ActionDeck compact props={props} />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <SmartZipResultTabs compact logs={props.logs} result={props.result} running={props.running} selectedCodePage={props.data.codePage} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} onSelectCodePage={(codePage) => props.onPatch({ codePage })} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="smartzip-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine actionMeta={props.actionMeta} status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <PathsInput compact data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
        <ActionDeck compact props={props} />
      </div>
      <div className="min-h-0 flex-1">
        <SmartZipResultTabs compact logs={props.logs} result={props.result} running={props.running} selectedCodePage={props.data.codePage} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} onSelectCodePage={(codePage) => props.onPatch({ codePage })} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  const { t } = useNodeI18n("smartzip")
  return (
    <div data-testid="smartzip-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-2 @4xl/smartzip:flex-row @4xl/smartzip:items-center @4xl/smartzip:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/smartzip:flex-row @4xl/smartzip:items-center">
          <HeaderLine actionMeta={props.actionMeta} status={props.status} subtitle={props.data.progressText || summaryText(props)} />
          <div data-testid="smartzip-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ActionIconButton disabled={props.running} icon={RotateCcw} label={t("actions.clear", "清空状态")} onClick={props.onReset} />
            <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <NodeConfigButton nodeKey="smartzip"
              configDirty={props.configDirty}
              configFilePath={props.configFilePath}
              defaults={props.defaults}
              disabled={props.running}
              onOpenConfigFile={props.onOpenConfigFile}
              onResetOverride={props.onResetOverride}
              onRestoreDefault={props.onRestoreDefault}
              onSaveDefault={props.onSaveDefault}
            />
          </div>
        </div>
        <SmartZipStatsPanel result={props.result} />
      </div>

      <div data-testid="smartzip-wide-layout" className="grid min-h-0 flex-1 gap-3 @[760px]/smartzip:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <section data-testid="smartzip-control-panel" className="flex min-h-0 flex-col gap-3 overflow-auto rounded-xl border bg-card/90 p-3 shadow-sm">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("fields.workbench", "归档工作台")}</div>
              <div className="truncate text-xs text-muted-foreground">{t("hints.directActions", "输入路径后直接选择动作，不需要先切换模式。")}</div>
            </div>
            <Badge className="shrink-0" variant="outline">7-Zip · auto</Badge>
          </div>
          <PathsInput data={props.data} disabled={props.running} onPaste={props.onPastePaths} onPatch={props.onPatch} />
          <ActionDeck props={props} />
          <RuntimeOptions data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PathFields data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <div className="mt-auto">
            <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
          </div>
        </section>
        <div className="min-h-0">
          <SmartZipResultTabs logs={props.logs} result={props.result} running={props.running} selectedCodePage={props.data.codePage} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} onSelectCodePage={(codePage) => props.onPatch({ codePage })} />
        </div>
      </div>
    </div>
  )
}

function ActionDeck({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <div
      data-testid="smartzip-action-deck"
      className={compact
        ? "flex min-w-0 gap-1.5 overflow-x-auto pb-0.5"
        : "grid min-w-0 grid-cols-2 gap-2 @5xl/smartzip:grid-cols-3"}
    >
      {ACTIONS.map((action) => (
        <DirectActionButton key={action.value} action={action.value} compact={compact} props={props} />
      ))}
    </div>
  )
}

function DirectActionButton({ action, compact, props }: {
  action: SmartZipAction
  compact?: boolean
  props: ViewProps
}) {
  const { t } = useNodeI18n("smartzip")
  const meta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[0]!
  const label = actionLabel(action)
  const shortLabel = t(`actions.${actionI18nKey(action)}.shortLabel`, meta.shortLabel)
  const destructive = isDestructiveAction(action) && !(props.data.dryRun ?? false)
  const activeRunning = props.running && props.action === action
  const Icon = activeRunning ? LoaderCircle : meta.icon

  if (!destructive) {
    return (
      <Button
        aria-label={label}
        className={cn(
          compact && "h-8 shrink-0 px-2.5",
          !compact && "h-auto min-h-10 min-w-0 justify-start px-3 py-2",
        )}
        disabled={props.running}
        size="sm"
        variant={activeRunning ? "secondary" : "outline"}
        onClick={() => props.onExecute(action)}
      >
        <RunStateIcon icon={Icon} running={activeRunning} />
        <span className="truncate">{compact ? shortLabel : label}</span>
        {!compact && action === "extract_codepage" && (
          <Badge className="ml-auto shrink-0 px-1.5 font-mono text-[10px]" variant="secondary">{props.data.codePage ? `CP${props.data.codePage}` : "AUTO"}</Badge>
        )}
      </Button>
    )
  }

  // 危险且 Hazard 未上膛时由 ExecuteButton 的引信取代确认弹窗。引信按钮没有徽标
  // 插槽，因此 extract_codepage 的 CP 徽标只在未点亮闸门的那条分支里渲染。
  return (
    <ExecuteButton
      className={compact ? "shrink-0" : undefined}
      compact={compact}
      dangerous
      disabled={props.running}
      idleIcon={<RunStateIcon icon={Icon} running={activeRunning} />}
      label={label}
      size="sm"
      onExecute={() => props.onExecute(action)}
    />
  )
}

function RunActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const { t } = useNodeI18n("smartzip")
  if (props.running) {
    return (
      <Button aria-label="smartzip running" disabled size={compact ? "icon-sm" : "sm"} variant="secondary">
        <Square />
        {!compact && <span>{t("status.running", "运行中")}</span>}
      </Button>
    )
  }

  const label = actionLabel(props.action)
  return (
    <ExecuteButton
      compact={compact}
      dangerous={isDestructiveAction(props.action) && !(props.data.dryRun ?? false)}
      disabled={props.running}
      idleIcon={<Play />}
      label={label}
      onExecute={() => props.onExecute(props.action)}
    />
  )
}

function HeaderLine({ actionMeta, status, subtitle }: {
  actionMeta: typeof ACTIONS[number]
  status: SmartZipStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <actionMeta.icon />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">SmartZip</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function buildInput(action: SmartZipAction, data: SmartZipCardState, defaults?: Partial<SmartZipCardState>): SmartZipInput {
  const resolved = resolveCardData(data, defaults)
  const pathsText = clean(resolved.pathsText)
  const paths = pathsText ? pathsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : []
  return {
    action,
    paths,
    iniPath: clean(resolved.iniPath),
    passwords: resolved.passwords ?? [],
    codePage: resolved.codePage ?? 0,
    databasePath: clean(resolved.databasePath),
    dryRun: resolved.dryRun ?? false,
    recordRun: resolved.recordRun ?? false,
  }
}

function resolveCardData(data: SmartZipCardState, defaults?: Partial<SmartZipCardState>): SmartZipCardState {
  if (!defaults) return data
  const resolved: SmartZipCardState = { ...defaults }
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) (resolved as Record<string, unknown>)[key] = value
  }

  return resolved
}

function statusFromState(data: SmartZipCardState, running: boolean): SmartZipStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: tNode("smartzip", "status.running", "运行中"),
      description: data.progressText || tNode("smartzip", "status.runningDesc", "SmartZip 正在加载配置或执行命令。"),
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: tNode("smartzip", "status.completed", "完成"),
      description: data.progressText || tNode("smartzip", "status.completedDesc", "上次任务已完成。"),
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error") {
    return {
      label: tNode("smartzip", "status.error", "失败"),
      description: data.progressText || tNode("smartzip", "status.errorDesc", "上次任务失败，请查看日志。"),
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  return {
    label: tNode("smartzip", "status.idle", "就绪"),
    description: tNode("smartzip", "status.idleDesc", "选择动作后查看状态、智能解压、打包或打开。"),
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.selectedPaths.length) {
    return tNode("smartzip", "summary.stats", "{{paths}} 路径 / {{archives}} 归档 / {{errors}} 错误", {
      paths: props.result.selectedPaths.length,
      archives: props.result.archiveCount,
      errors: props.result.errors.length,
    })
  }
  return tNode("smartzip", `actions.${actionI18nKey(props.actionMeta.value)}.description`, props.actionMeta.description)
}

function actionLabel(action: SmartZipAction): string {
  const meta = ACTIONS.find((item) => item.value === action)
  if (!meta) return action
  return tNode("smartzip", `actions.${actionI18nKey(action)}.label`, meta.label)
}

function clean(value: unknown): string | undefined {
  const text = String(value ?? "").trim()
  return text || undefined
}

function getHostData(host: NodeComponentProps<SmartZipCardState, Partial<SmartZipCardState>>["host"], compId: string): SmartZipCardState {
  return host.state?.getData?.() ?? host.getData<SmartZipCardState>(compId) ?? {}
}
