import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NodeComponentProps } from "@xiranite/contract"
import type { LinedupFilterInput, LinedupFilterResult } from "@xiranite/node-linedup/core"
import type { LucideIcon } from "lucide-react"
import { Clipboard, Copy, Eraser, Filter, RotateCcw, Settings2, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { LinedupDisplayTabs, StatsPanel } from "./ResultPanels"
import { linedupCountedLines, linedupWireLines } from "./model"
import type { LinedupCardState, LinedupPhase, LinedupStatusMeta } from "./types"

const CONFIG_FIELDS = ["caseSensitive", "sort"] as const satisfies ReadonlyArray<keyof LinedupCardState>

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("linedup")
  const data = host.getData<LinedupCardState>(compId) ?? {}
  const dataRef = useRef<LinedupCardState>(data)
  dataRef.current = data
  const [defaults, setDefaults] = useState<Partial<LinedupCardState> | undefined>()
  const [configPath, setConfigPath] = useState<string | undefined>()
  const [configLoading, setConfigLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const sourceText = data.sourceText ?? ""
  const filterText = data.filterText ?? ""
  const logs = data.logs ?? []
  const result = data.result ?? null
  const phase = data.phase ?? "idle"
  const caseSensitive = data.caseSensitive ?? true
  const sort = data.sort ?? true
  // 条数徽标与按钮禁用用的展示投影；发给宿主的是未过滤的行数组（./model.ts）。
  const sourceLines = linedupCountedLines(sourceText)
  const filterTokens = linedupCountedLines(filterText)
  const status = statusFromState(phase, result, sourceLines.length, filterTokens.length)
  const progress = phase === "completed" ? 100 : result ? 100 : 0
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)
  const configDirty = defaults !== undefined && CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? ""))

  useEffect(() => {
    void loadDefaults()
  }, [host])

  function patch(patchData: Partial<LinedupCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  /** 日志上限 120 条；读 dataRef 而不是渲染闭包里的 `logs`，因为 await 之后那份可能已经不是最新的。 */
  function appendLog(message: string): string[] {
    return [...(dataRef.current.logs ?? []), message].slice(-120)
  }

  function pickConfig(source: LinedupCardState): Partial<LinedupCardState> {
    return Object.fromEntries(CONFIG_FIELDS.flatMap((field) => source[field] === undefined ? [] : [[field, source[field]]])) as Partial<LinedupCardState>
  }

  async function loadDefaults() {
    const pending = host.config?.get?.<Partial<LinedupCardState>>() ?? host.getNodeConfig?.<Partial<LinedupCardState>>()
    if (!pending) return
    setConfigLoading(true)
    try {
      const response = await pending
      setDefaults(response.config)
      setConfigPath(response.path)
    } finally {
      setConfigLoading(false)
    }
  }

  async function saveAsDefault() {
    const save = host.config?.save ?? host.saveNodeConfig
    if (!save) return
    setConfigLoading(true)
    try {
      const config = pickConfig(dataRef.current)
      await save(config)
      setDefaults(config)
    } finally {
      setConfigLoading(false)
    }
  }

  function restoreDefaults() {
    if (defaults) patch(defaults)
  }

  async function openConfigFile() {
    await (host.config?.openFile?.() ?? host.openConfigFile?.())
  }

  async function paste(field: "sourceText" | "filterText") {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ [field]: text })
  }

  /**
   * 运行一次过滤 —— 判定只有一份，而它在宿主里。
   *
   * 发出去的是 `LinedupFilterInput` 文档，走 `host.runner.run` → `src/lib/nodeOperationTransport.ts` →
   * `POST /nodes/linedup/operations`；收回来的是 `{ success, message, data }`，`data` 就是
   * `LinedupFilterResult`（宿主对 linedup 只注册了 `filterLines` 这一个入口，见
   * `crates/xiranite-scripted-nodes/src/registration.rs`）。不传 `onEvent`：pure 节点的入口是
   * `run(input)`，宿主对这个节点没有事件可发（同 `packages/nodes/linedup/src/cli.ts` 的 `runLinedupOnHost`）。
   *
   * 附不上宿主就明确失败并留下可见错误，绝不回落到浏览器里本地算 —— 那条回落正是 ADR-0074 §5 删掉的
   * 第二个执行宿主，配方 §4 只允许「可见错误 + 不回落」。
   */
  async function execute() {
    if (!sourceLines.length) {
      patch({ phase: "error", logs: appendLog("请先粘贴源文本。") })
      return
    }
    const run = host.runner?.run ?? host.actions?.run
    if (!run) {
      const message = "当前环境没有本地运行能力，请使用桌面模式或 CLI。"
      patch({ phase: "error", result: null, logs: appendLog(message) })
      return
    }

    setRunning(true)
    try {
      const input: LinedupFilterInput = {
        sourceLines: linedupWireLines(sourceText),
        filterLines: linedupWireLines(filterText),
        caseSensitive,
        sort,
      }
      const response = await run<LinedupFilterInput, LinedupFilterResult>("linedup", input)
      const next = response.data ?? null
      if (response.success && next) {
        patch({
          phase: "completed",
          result: next,
          logs: appendLog(`保留 ${next.keptCount} 行，移除 ${next.removedCount} 行。`),
        })
      } else {
        patch({ phase: "error", result: null, logs: appendLog(response.message || "宿主未返回过滤结果。") })
      }
    } catch (error) {
      patch({ phase: "error", result: null, logs: appendLog(error instanceof Error ? error.message : String(error)) })
    } finally {
      setRunning(false)
    }
  }

  function reset() {
    patch({ phase: "idle", result: null, logs: [] })
  }

  async function copyLines(lines: string[]) {
    await host.clipboard?.writeText?.(lines.join("\n"))
  }

  function download() {
    host.downloadText?.("linedup-output.txt", result?.filteredLines.join("\n") ?? "")
  }

  const commonProps = {
    configDirty,
    configLoading,
    configPath,
    caseSensitive,
    filterCount: filterTokens.length,
    filterText,
    logs,
    phase,
    progress,
    result,
    running,
    sort,
    sourceCount: sourceLines.length,
    sourceText,
    status,
    t,
    defaults: defaults as Record<string, unknown> | undefined,
    onCopyKept: () => copyLines(result?.filteredLines ?? []),
    onCopyRemoved: () => copyLines(result?.removedLines ?? []),
    onDownload: download,
    onLoadDefaults: loadDefaults,
    onOpenConfigFile: openConfigFile,
    onRestoreDefaults: restoreDefaults,
    onSaveDefault: saveAsDefault,
    onExecute: execute,
    onPasteFilter: () => paste("filterText"),
    onPasteSource: () => paste("sourceText"),
    onPatch: patch,
    onReset: reset,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/linedup relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-3" accentStrength={12} />
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

type ViewProps = {
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  caseSensitive: boolean
  defaults?: Record<string, unknown>
  filterCount: number
  filterText: string
  logs: string[]
  phase: LinedupPhase
  progress: number
  result: LinedupFilterResult | null
  running: boolean
  sort: boolean
  sourceCount: number
  sourceText: string
  status: LinedupStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onCopyKept: () => void
  onCopyRemoved: () => void
  onDownload: () => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onRestoreDefaults: () => void
  onSaveDefault: () => Promise<void>
  onExecute: () => void
  onPasteFilter: () => void
  onPasteSource: () => void
  onPatch: (patch: Partial<LinedupCardState>) => void
  onReset: () => void
}

function ConfigManagement(props: ViewProps) {
  return <NodeConfigPopover configPath={props.configPath} defaults={props.defaults} dirty={props.configDirty} loading={props.configLoading} t={props.t} onOpenFile={props.onOpenConfigFile} onReload={props.onLoadDefaults} onRestore={props.onRestoreDefaults} onSave={props.onSaveDefault} />
}

function CollapsedView(props: ViewProps) {
  return (
    <div data-testid="linedup-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <div className={cn("absolute inset-0 opacity-70 transition-opacity", props.status.tone === "error" && "bg-destructive/10", props.status.tone === "success" && "bg-primary/10")} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Filter />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Linedup</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <div className="relative flex shrink-0 items-center gap-1"><ConfigManagement {...props} /><ActionIconButton disabled={!props.sourceCount || props.running} icon={Zap} label="运行过滤" onClick={props.onExecute} /></div>
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="linedup-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <ConfigManagement {...props} />
          <OptionsPopover {...props} />
          <ActionIconButton disabled={!props.sourceCount || props.running} icon={Zap} label="运行过滤" onClick={props.onExecute} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <TextAreas compact {...props} />
        <div className="min-h-0 flex-1">
          <LinedupDisplayTabs
            compact
            logs={props.logs}
            phase={props.phase}
            result={props.result}
            sourceText={props.sourceText}
            onCopyKept={props.onCopyKept}
            onCopyRemoved={props.onCopyRemoved}
            onDownload={props.onDownload}
          />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="linedup-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <ConfigManagement {...props} />
          <OptionsPopover {...props} />
          <ActionIconButton disabled={!props.sourceCount || props.running} icon={Zap} label="运行过滤" onClick={props.onExecute} />
        </div>
      </div>
      <TextAreas compact {...props} />
      <div className="min-h-0 flex-1">
        <LinedupDisplayTabs
          compact
          logs={props.logs}
          phase={props.phase}
          result={props.result}
          sourceText={props.sourceText}
          onCopyKept={props.onCopyKept}
          onCopyRemoved={props.onCopyRemoved}
          onDownload={props.onDownload}
        />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  return (
    <div data-testid="linedup-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/linedup:flex-row @4xl/linedup:items-center @4xl/linedup:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/linedup:flex-row @4xl/linedup:items-center">
          <HeaderLine status={props.status} subtitle={summaryText(props)} />
          <div data-testid="linedup-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ActionIconButton disabled={!props.result} icon={Copy} label="复制保留结果" onClick={props.onCopyKept} />
            <ActionIconButton disabled={!props.result} icon={RotateCcw} label="清空状态" onClick={props.onReset} />
            <ConfigManagement {...props} />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} sourceCount={props.sourceCount} filterCount={props.filterCount} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @5xl/linedup:grid-cols-[minmax(250px,1fr)_minmax(220px,0.72fr)_minmax(280px,1fr)]">
        <WorkbenchPanel description="粘贴待处理文本；每行都会保留原始顺序与差分位置。" eyebrow="RAW INPUT" title="源文本">
          <TextAreaField
            label="源文本"
            placeholder="每行一条"
            value={props.sourceText}
            onChange={(sourceText) => props.onPatch({ sourceText })}
            onClear={() => props.onPatch({ sourceText: "" })}
            onPaste={props.onPasteSource}
          />
        </WorkbenchPanel>
        <FilterLogicPanel {...props} />
        <WorkbenchPanel description="切换预览、保留、移除和日志，检查每条文本的最终去向。" eyebrow="FILTERED OUTPUT" title="处理输出" flush>
          <LinedupDisplayTabs
            logs={props.logs}
            phase={props.phase}
            result={props.result}
            sourceText={props.sourceText}
            onCopyKept={props.onCopyKept}
            onCopyRemoved={props.onCopyRemoved}
            onDownload={props.onDownload}
          />
        </WorkbenchPanel>
      </div>
    </div>
  )
}

function WorkbenchPanel(props: {
  children: ReactNode
  description: string
  eyebrow: string
  flush?: boolean
  title: string
}) {
  return (
    <Card className="min-h-0 gap-0 overflow-hidden py-0">
      <CardHeader className="shrink-0 border-b bg-muted/20 px-3 py-2.5 !pb-2.5">
        <div className="flex items-center justify-between gap-2"><CardTitle className="text-sm">{props.title}</CardTitle><span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">{props.eyebrow}</span></div>
        <CardDescription className="text-[11px]">{props.description}</CardDescription>
      </CardHeader>
      <CardContent className={cn("min-h-0 flex-1", props.flush ? "p-0" : "p-3")}>{props.children}</CardContent>
    </Card>
  )
}

function FilterLogicPanel(props: ViewProps) {
  return (
    <WorkbenchPanel description="每个过滤词单独一行。命中词的源行会移入“移除”结果。" eyebrow="FILTER LOGIC" title="过滤逻辑">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <TextAreaField
          compact
          label="过滤词"
          placeholder="移除包含这些词的源行"
          value={props.filterText}
          onChange={(filterText) => props.onPatch({ filterText })}
          onClear={() => props.onPatch({ filterText: "" })}
          onPaste={props.onPasteFilter}
        />
        <div className="grid gap-2 border-y py-3">
          <SwitchRow checked={props.caseSensitive} description="beta 不会匹配 Beta" label="区分大小写" onCheckedChange={(caseSensitive) => props.onPatch({ caseSensitive })} />
          <SwitchRow checked={props.sort} description="保留与移除的结果按自然顺序排列" label="结果排序" onCheckedChange={(sort) => props.onPatch({ sort })} />
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-xs"><Metric label="保留" value={props.result?.keptCount ?? 0} /><Metric destructive label="移除" value={props.result?.removedCount ?? 0} /></div>
          <Button disabled={!props.sourceCount || props.running} size="sm" onClick={props.onExecute}><Zap data-icon="inline-start" />运行过滤</Button>
        </div>
      </div>
    </WorkbenchPanel>
  )
}

function Metric(props: { destructive?: boolean; label: string; value: number }) {
  return <div className="rounded-md bg-muted/40 px-2 py-1.5"><div className="text-[11px] text-muted-foreground">{props.label}</div><div className={cn("text-base font-semibold tabular-nums", props.destructive && props.value > 0 && "text-destructive")}>{props.value}</div></div>
}

function TextAreas(props: ViewProps & { compact?: boolean }) {
  return (
    <div className={cn("grid min-h-0 gap-2", props.compact ? "grid-cols-2" : "flex-1 grid-rows-2")}>
      <TextAreaField
        compact={props.compact}
        label="源文本"
        placeholder="每行一个条目"
        value={props.sourceText}
        onChange={(sourceText) => props.onPatch({ sourceText })}
        onClear={() => props.onPatch({ sourceText: "" })}
        onPaste={props.onPasteSource}
      />
      <TextAreaField
        compact={props.compact}
        label="过滤词"
        placeholder="包含这些词的行会被移除"
        value={props.filterText}
        onChange={(filterText) => props.onPatch({ filterText })}
        onClear={() => props.onPatch({ filterText: "" })}
        onPaste={props.onPasteFilter}
      />
    </div>
  )
}

function TextAreaField(props: {
  compact?: boolean
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onPaste: () => void
}) {
  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{props.label}</Label>
        <div className="flex shrink-0 items-center gap-1">
          <ActionIconButton icon={Clipboard} label={`粘贴${props.label}`} onClick={props.onPaste} />
          <ActionIconButton disabled={!props.value} icon={Eraser} label={`清空${props.label}`} onClick={props.onClear} />
        </div>
      </div>
      <Textarea
        aria-label={props.label}
        className={cn("min-h-0 flex-1 resize-none font-mono text-xs", props.compact ? "h-24" : "h-full")}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  )
}

function OptionsPopover(props: ViewProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button aria-label="linedup options" size="icon-sm" variant="outline">
              <Settings2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>过滤选项</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72">
        <div className="mb-3">
          <div className="text-sm font-semibold">过滤选项</div>
          <p className="text-xs text-muted-foreground">控制匹配大小写和结果排序，适合处理路径、标签或清单文本。</p>
        </div>
        <div className="grid gap-3">
          <SwitchRow
            checked={props.caseSensitive}
            description="开启后 beta 不会匹配 Beta。"
            label="区分大小写"
            onCheckedChange={(caseSensitive) => props.onPatch({ caseSensitive })}
          />
          <SwitchRow
            checked={props.sort}
            description="开启后保留和移除结果按自然顺序排序。"
            label="结果排序"
            onCheckedChange={(sort) => props.onPatch({ sort })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SwitchRow(props: {
  checked: boolean
  description: string
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{props.label}</div>
        <div className="text-xs text-muted-foreground">{props.description}</div>
      </div>
      <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </div>
  )
}

function ActionIconButton(props: {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  const Icon = props.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={props.label} disabled={props.disabled} size="icon-sm" variant="outline" onClick={props.onClick}>
          <Icon />
          <span className="sr-only">{props.label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

function HeaderLine({ status, subtitle }: {
  status: LinedupStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <Filter />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Linedup</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function statusFromState(phase: LinedupPhase, result: LinedupFilterResult | null, sourceCount: number, filterCount: number): LinedupStatusMeta {
  if (phase === "error") {
    return {
      label: "失败",
      // 失败现在有三种成因（缺源文本、宿主不可达、宿主拒绝），具体那句在日志页，这里不许替宿主编一个原因。
      description: "运行未完成，原因见日志。",
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  if (phase === "completed" && result) {
    return {
      label: "完成",
      description: `保留 ${result.keptCount} 行，移除 ${result.removedCount} 行。`,
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (sourceCount || filterCount) {
    return {
      label: "待过滤",
      description: `${sourceCount} 源 / ${filterCount} 过滤词`,
      tone: "idle",
      badgeVariant: "outline",
      iconClass: "bg-secondary text-secondary-foreground",
    }
  }
  return {
    label: "就绪",
    description: "粘贴源文本和过滤词后运行。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function summaryText(props: ViewProps): string {
  if (props.result) return `保留 ${props.result.keptCount} / 移除 ${props.result.removedCount}`
  if (props.sourceCount || props.filterCount) return `${props.sourceCount} 源 / ${props.filterCount} 过滤词`
  return "粘贴文本后移除匹配行"
}
