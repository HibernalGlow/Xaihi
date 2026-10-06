import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { ArchiveEntry, MvzAction, MvzData, MvzInput } from "@xiranite/node-mvz/core"
// 「N 个压缩包」的分组能力不迁走，只是换了取法：实现仍只有一份，住在 `packages/nodes/mvz/src/archive-entries.ts`
// （core 只是再导出）。GUI 走这条非 core 子路径，不值导入 `.../core`——那是往面进程放第二份执行宿主（ADR-0074 §5）。
import { parseMvzEntries } from "@xiranite/node-mvz/archive-entries"
import { Copy, Package, Play, RotateCcw, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { findActionMeta } from "./constants"
import {
  ActionIconButton,
  ActionPicker,
  AdvancedOptionsPopover,
  EntryInput,
  OutputInput,
  PrimarySwitches,
  RenameFields,
  ResultTabs,
  StatusStrip,
} from "./controls"
import type { MvzCardState, MvzPhase, MvzStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const data = host.getData<MvzCardState>(compId) ?? {}
  const dataRef = useRef<MvzCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<MvzCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const logs = data.logs ?? []
  const result = data.result ?? null
  const action = data.action ?? "extract"
  const actionMeta = findActionMeta(action)
  const separator = data.separator || "//"
  const entries = parseMvzEntries(data.entryText ?? "", separator)
  const archiveCount = new Set(entries.map((entry) => entry.archivePath)).size
  const dryRun = data.dryRun ?? true
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)
  const pathOptionsDisabled = action === "delete" || action === "rename"
  const outputDisabled = pathOptionsDisabled || (data.near ?? true)

  useEffect(() => {
    host.getNodeConfig?.<Partial<MvzCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [
    data.action,
    data.entryText,
    data.output,
    data.pattern,
    data.replacement,
    data.separator,
    data.near,
    data.autoDir,
    data.flatten,
    data.dryRun,
    defaults,
  ])

  function patch(patchData: Partial<MvzCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function pasteEntries() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ entryText: text })
  }

  async function pasteOutput() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ output: text.trim() })
  }

  async function copyLogs() {
    if (logs.length) await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function copyResults() {
    const lines = [
      ...(result?.preview ?? []).map((item) => item.command ?? `${item.action} ${item.archive}`),
      ...(result?.results ?? []).map((item) => `${item.success ? "ok" : "fail"} ${item.action} ${item.archive} (${item.count}) ${item.message}`),
    ]
    if (lines.length) await host.clipboard?.writeText?.(lines.join("\n"))
  }

  async function execute(executeAction: MvzAction) {
    if (running) return
    const current = dataRef.current
    const input = buildInput(executeAction, current)

    if (!entries.length) {
      patch({ phase: "error", progress: 0, progressText: "请先粘贴归档条目。" })
      return
    }
    if (executeAction === "rename" && !input.pattern?.trim()) {
      patch({ phase: "error", progress: 0, progressText: "重命名需要填写正则模式。" })
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
      patch({ phase: "running", progress: 0, progressText: `${actionMeta.label}开始` })
      const response = await run<MvzInput, MvzData>("mvz", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<MvzData>

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
    const config: Partial<MvzCardState> = {}
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
      action: undefined,
      entryText: undefined,
      output: undefined,
      pattern: undefined,
      replacement: undefined,
      separator: undefined,
      near: undefined,
      autoDir: undefined,
      flatten: undefined,
      dryRun: undefined,
    })
  }

  const commonProps = createViewProps({
    action,
    actionMeta,
    archiveCount,
    configDirty,
    configFilePath,
    data,
    defaults,
    dryRun,
    entryCount: entries.length,
    host,
    logs,
    outputDisabled,
    pathOptionsDisabled,
    phase,
    progress,
    result,
    running,
    status,
    onActionChange: (value: MvzAction) => patch({ action: value }),
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onOpenConfigFile: host.openConfigFile,
    onPasteEntries: pasteEntries,
    onPasteOutput: pasteOutput,
    onPatch: patch,
    onReset: reset,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/mvz relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-3" />
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
  action: MvzAction
  actionMeta: ReturnType<typeof findActionMeta>
  archiveCount: number
  configDirty: boolean
  configFilePath?: string
  data: MvzCardState
  defaults?: Partial<MvzCardState>
  dryRun: boolean
  entryCount: number
  host: NodeComponentProps["host"]
  logs: string[]
  outputDisabled: boolean
  pathOptionsDisabled: boolean
  phase: MvzPhase
  progress: number
  result: MvzData | null
  running: boolean
  status: MvzStatusMeta
  onActionChange: (value: MvzAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: MvzAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPasteEntries: () => void
  onPasteOutput: () => void
  onPatch: (patch: Partial<MvzCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="mvz-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Package />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>MVZ</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryActionButton compact props={props} />
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="mvz-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
        <EntryInput compact disabled={props.running} entryCount={props.entryCount} archiveCount={props.archiveCount} value={props.data.entryText ?? ""} onChange={(entryText) => props.onPatch({ entryText })} onClear={() => props.onPatch({ entryText: "" })} onPaste={props.onPasteEntries} />
        {props.action === "rename" && (
          <RenameFields compact disabled={props.running} pattern={props.data.pattern} replacement={props.data.replacement} onPatternChange={(pattern) => props.onPatch({ pattern })} onReplacementChange={(replacement) => props.onPatch({ replacement })} />
        )}
        {!props.pathOptionsDisabled && (
          <OutputInput compact disabled={props.running || props.outputDisabled} value={props.data.output ?? ""} onChange={(output) => props.onPatch({ output })} onPaste={props.onPasteOutput} />
        )}
        <PrimarySwitches compact data={props.data} disabled={props.running} action={props.action} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="mvz-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
        <EntryInput compact disabled={props.running} entryCount={props.entryCount} archiveCount={props.archiveCount} value={props.data.entryText ?? ""} onChange={(entryText) => props.onPatch({ entryText })} onClear={() => props.onPatch({ entryText: "" })} onPaste={props.onPasteEntries} />
        {props.action === "rename" && (
          <RenameFields compact disabled={props.running} pattern={props.data.pattern} replacement={props.data.replacement} onPatternChange={(pattern) => props.onPatch({ pattern })} onReplacementChange={(replacement) => props.onPatch({ replacement })} />
        )}
        {!props.pathOptionsDisabled && (
          <OutputInput compact disabled={props.running || props.outputDisabled} value={props.data.output ?? ""} onChange={(output) => props.onPatch({ output })} onPaste={props.onPasteOutput} />
        )}
        <PrimarySwitches compact data={props.data} disabled={props.running} action={props.action} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
      </div>
      <div className="min-h-0 flex-1">
        <ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  if (!props.result) return <FullViewLegacy {...props} />

  const entries = parseMvzEntries(props.data.entryText ?? "", props.data.separator || "//")
  const selected = entries[0]

  return (
    <div data-testid="mvz-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/mvz:flex-row @4xl/mvz:items-center @4xl/mvz:justify-between">
        <HeaderLine status={props.status} subtitle={props.data.progressText || `${props.archiveCount} archives / ${props.entryCount} entries`} />
        <div data-testid="mvz-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
          <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
          <ToolbarActions {...props} hidePrimary />
        </div>
        <StatsPanel progress={props.progress} result={props.result} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @5xl/mvz:grid-cols-[minmax(360px,1.65fr)_minmax(250px,.8fr)]">
        <Card className="min-h-0 gap-0 overflow-hidden py-0">
          <CardHeader className="shrink-0 border-b bg-muted/20 px-3 py-2.5 !pb-2.5">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Archive explorer</CardTitle>
              <Badge variant="outline">{props.entryCount} selected</Badge>
            </div>
            <CardDescription className="text-[11px]">Browse archive entries before the operation is committed.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <EntryInput compact disabled={props.running} entryCount={props.entryCount} archiveCount={props.archiveCount} value={props.data.entryText ?? ""} onChange={(entryText) => props.onPatch({ entryText })} onClear={() => props.onPatch({ entryText: "" })} onPaste={props.onPasteEntries} />
            <ArchiveExplorer entries={entries} />
          </CardContent>
        </Card>

        <Card className="min-h-0 gap-0 overflow-hidden py-0">
          <CardHeader className="shrink-0 border-b bg-muted/20 px-3 py-2.5 !pb-2.5">
            <CardTitle className="text-sm">Commit preview</CardTitle>
            <CardDescription className="text-[11px]">Review destination and write protection before execution.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <CommitPreview action={props.actionMeta.label} entry={selected} output={props.data.output} />
            {!props.pathOptionsDisabled && <OutputInput disabled={props.running || props.outputDisabled} value={props.data.output ?? ""} onChange={(output) => props.onPatch({ output })} onPaste={props.onPasteOutput} />}
            <PrimarySwitches data={props.data} disabled={props.running} action={props.action} onPatch={props.onPatch} />
            <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
            <div className="mt-auto"><PrimaryActionButton props={props} /></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ArchiveExplorer({ entries }: { entries: ArchiveEntry[] }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-background/60">
      <Table className="min-w-[360px] text-xs">
        <TableHeader className="sticky top-0 z-10 bg-muted/70 backdrop-blur-sm">
          <TableRow><TableHead>Internal path</TableHead><TableHead>Archive</TableHead><TableHead className="text-right">State</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.rawLine} data-state={entry === entries[0] ? "selected" : undefined}>
              <TableCell className="max-w-0 truncate font-mono" title={entry.internalPath}>{entry.internalPath}</TableCell>
              <TableCell className="max-w-32 truncate font-mono text-muted-foreground" title={entry.archivePath}>{entry.archivePath}</TableCell>
              <TableCell className="text-right"><Badge variant="outline">ready</Badge></TableCell>
            </TableRow>
          ))}
          {!entries.length && <TableRow><TableCell className="h-32 text-center text-muted-foreground" colSpan={3}>Paste archive entries to build the explorer.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  )
}

function CommitPreview({ action, entry, output }: { action: string; entry?: ArchiveEntry; output?: string }) {
  return (
    <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs">
      <div className="flex items-center justify-between gap-2"><span className="font-medium text-muted-foreground">Pending operation</span><Badge>{action}</Badge></div>
      <div className="grid gap-1 font-mono"><span className="text-muted-foreground">Target</span><span className="truncate" title={entry?.internalPath}>{entry?.internalPath || "No entry selected"}</span></div>
      <div className="grid gap-1 font-mono"><span className="text-muted-foreground">Destination</span><span className="truncate" title={output}>{output || "Near archive / automatic directory"}</span></div>
    </div>
  )
}

function FullViewLegacy(props: ViewProps) {
  return (
    <div data-testid="mvz-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/mvz:flex-row @4xl/mvz:items-center @4xl/mvz:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/mvz:flex-row @4xl/mvz:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || `${props.actionMeta.label} / ${props.dryRun ? "预演" : "真实执行"} / ${props.archiveCount} 包 / ${props.entryCount} 条`} />
          <div data-testid="mvz-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ToolbarActions {...props} />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @5xl/mvz:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
          <div className="grid gap-3 border-b pb-3">
            <div>
              <div className="text-sm font-semibold">动作</div>
              <div className="text-xs text-muted-foreground">选择对压缩包内文件执行的操作，危险操作默认以预演保护。</div>
            </div>
            <ActionPicker disabled={props.running} value={props.action} onChange={props.onActionChange} />
            {props.action === "rename" && (
              <RenameFields disabled={props.running} pattern={props.data.pattern} replacement={props.data.replacement} onPatternChange={(pattern) => props.onPatch({ pattern })} onReplacementChange={(replacement) => props.onPatch({ replacement })} />
            )}
          </div>
          <div className="grid gap-3 border-b pb-3">
            <div>
              <div className="text-sm font-semibold">条目</div>
              <div className="text-xs text-muted-foreground">每行一个 archive//internal 格式条目，支持从 findz 输出粘贴。</div>
            </div>
            <EntryInput disabled={props.running} entryCount={props.entryCount} archiveCount={props.archiveCount} value={props.data.entryText ?? ""} onChange={(entryText) => props.onPatch({ entryText })} onClear={() => props.onPatch({ entryText: "" })} onPaste={props.onPasteEntries} />
            {!props.pathOptionsDisabled && (
              <OutputInput disabled={props.running || props.outputDisabled} value={props.data.output ?? ""} onChange={(output) => props.onPatch({ output })} onPaste={props.onPasteOutput} />
            )}
          </div>
          <div className="grid gap-3 border-b pb-3">
            <div className="text-sm font-semibold">关键开关</div>
            <PrimarySwitches data={props.data} disabled={props.running} action={props.action} onPatch={props.onPatch} />
          </div>
          <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
        </section>

        <div className="h-[clamp(12rem,32vh,20rem)] min-h-0 overflow-hidden @5xl/mvz:h-full">
          <ResultTabs logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} />
        </div>
      </div>
    </div>
  )
}

function ToolbarActions(props: ViewProps & { compact?: boolean; hidePrimary?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", props.compact && "justify-between")}>
      {!props.compact && !props.hidePrimary && <PrimaryActionButton props={props} />}
      <ActionIconButton disabled={props.running || !props.result?.results.length} icon={Copy} label="复制结果" onClick={props.onCopyResults} />
      <ActionIconButton disabled={!props.logs.length} icon={Copy} label="复制日志" onClick={props.onCopyLogs} />
      <ActionIconButton icon={RotateCcw} label="清空状态" onClick={props.onReset} />
      {!props.compact && (
          <NodeConfigButton nodeKey="mvz"
          configDirty={props.configDirty}
          configFilePath={props.configFilePath}
          defaults={props.defaults}
          disabled={props.running}
          onOpenConfigFile={props.onOpenConfigFile}
          onResetOverride={props.onResetOverride}
          onRestoreDefault={props.onRestoreDefault}
          onSaveDefault={props.onSaveDefault}
        />
      )}
    </div>
  )
}

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const disabled = !props.entryCount || (props.action === "rename" && !props.data.pattern?.trim())
  const label = props.dryRun ? `预演${props.actionMeta.shortLabel}` : `真实${props.actionMeta.shortLabel}`
  const action: MvzAction = props.action

  return (
    <ExecuteButton
      dangerous={!props.dryRun}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={props.dryRun ? <Play /> : <ShieldAlert />}
      onExecute={() => props.onExecute(action)}
    />
  )
}

function HeaderLine({ status, subtitle }: {
  status: MvzStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <Package />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">MVZ</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function StatsPanel(props: {
  progress: number
  result: MvzData | null
}) {
  const stats = [
    ["总计", props.result?.totalFiles ?? 0],
    ["压缩包", props.result?.totalArchives ?? 0],
    ["成功", props.result?.successCount ?? 0],
    ["失败", props.result?.failedCount ?? 0],
    ["结果", props.result?.results.length ?? 0],
    ["进度", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/mvz:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "失败" && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function buildInput(action: MvzAction, data: MvzCardState): MvzInput {
  return {
    action,
    fileText: data.entryText,
    output: data.output,
    near: data.near ?? true,
    autoDir: data.autoDir ?? true,
    flatten: data.flatten ?? false,
    pattern: data.pattern,
    replacement: data.replacement ?? "",
    separator: data.separator || "//",
    dryRun: data.dryRun ?? true,
  }
}

function statusFromState(data: MvzCardState, running: boolean): MvzStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: data.progressText || "MVZ 正在处理压缩包条目。",
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || (data.result?.failedCount ?? 0) > 0) {
    return {
      label: "失败",
      description: data.progressText || data.result?.results.find((item) => !item.success)?.message || "上次任务存在失败项，请查看结果和日志。",
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: "完成",
      description: data.progressText || "上次任务已完成。",
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  return {
    label: "就绪",
    description: "粘贴归档条目后预演或执行。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: MvzCardState, running: boolean): MvzPhase {
  if (running) return "running"
  return data.phase ?? "idle"
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.successCount) return `${props.result.successCount} 项成功`
  if (props.result?.totalArchives) return `${props.result.totalArchives} 包 / ${props.result.totalFiles} 条`
  if (props.entryCount) return `${props.entryCount} 条 / ${props.archiveCount} 包 / ${props.actionMeta.shortLabel}`
  return "粘贴归档条目后开始"
}
