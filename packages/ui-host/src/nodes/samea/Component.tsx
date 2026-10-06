import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { SameaAction, SameaData, SameaInput, SameaPlanItem } from "@xiranite/node-samea/core"
import { FloatingWindowCaptionControls, useFloatingWindowFrame } from "@/components/workspace/FloatingWindowFrame"
import { AlertTriangle, Archive, Bot, Clipboard, FolderInput, RotateCcw, ScanSearch, ShieldAlert, SlidersHorizontal, Terminal, UserRound, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldContent, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PathTextarea } from "@/components/ui/path-input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import type { SameaCardState, SameaFilterTab } from "./types"
import { RunStateIcon } from "@/nodes/shared/controls"

const FILTERS: Array<{ id: SameaFilterTab; label: string; key: keyof Pick<SameaCardState, "artistBlacklist" | "pathBlacklist" | "regexBlacklist"> }> = [
  { id: "artist", label: "Artists", key: "artistBlacklist" },
  { id: "path", label: "Paths", key: "pathBlacklist" },
  { id: "regex", label: "Regex", key: "regexBlacklist" },
]
const CONFIG_FIELDS = ["action", "pathsText", "ignorePathBlacklist", "minOccurrences", "centralize", "dryRun", "artistBlacklist", "pathBlacklist", "regexBlacklist"] as const

export function Component({ compId, host }: NodeComponentProps<SameaCardState, Partial<SameaCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("samea")
  const data = getHostData(host, compId)
  const dataRef = useRef(data)
  dataRef.current = data
  const [running, setRunning] = useState(false)
  const [filterTab, setFilterTab] = useState<SameaFilterTab>("artist")
  const [draftFilter, setDraftFilter] = useState("")
  const [defaults, setDefaults] = useState<Partial<SameaCardState>>()
  const paths = splitLines(data.pathsText)
  const result = data.result ?? null
  const action = data.action ?? "plan"
  const compact = surface.mode === "compact" || surface.mode === "portrait"
  const configDirty = Boolean(defaults && CONFIG_FIELDS.some((field) => JSON.stringify(data[field]) !== JSON.stringify(defaults[field])))

  useEffect(() => { (host.config?.get?.() ?? host.getNodeConfig?.())?.then((response) => setDefaults(response.config)).catch(() => undefined) }, [host])

  function patch(next: Partial<SameaCardState>) {
    dataRef.current = { ...dataRef.current, ...next }
    if (host.state?.patchData) host.state.patchData(next)
    else host.patchData(compId, next)
  }
  function log(message: string) { patch({ logs: [...(dataRef.current.logs ?? []), message].slice(-120) }) }
  async function paste() { const text = await host.clipboard?.readText?.(); if (text) patch({ pathsText: text.trim() }) }
  async function execute(nextAction: SameaAction) {
    if (running) return
    if (!splitLines(dataRef.current.pathsText).length) { patch({ phase: "error", progressText: t("errors.noPaths", "扫描前请至少添加一个归档根目录。") }); return }
    const run = host.runner?.run ?? host.actions?.run
    if (!run) { patch({ phase: "error", progressText: t("errors.noRunEnv", "当前环境没有本地运行能力。") }); return }
    setRunning(true)
    patch({ action: nextAction, phase: "running", progress: 0, progressText: t("progress.init", "正在初始化 SameA 提取器。"), result: null })
    try {
      const response = await run<SameaInput, SameaData>("samea", buildInput(nextAction, dataRef.current), (event: NodeRunEvent) => {
        if (event.type === "progress") patch({ progress: event.progress ?? 0, progressText: event.message })
        log(`[${event.progress ?? 0}%] ${event.message}`)
      }) as NodeRunResult<SameaData>
      patch({ phase: response.success ? "completed" : "error", progress: response.success ? 100 : 0, progressText: response.message, result: response.data ?? null })
      log(response.message)
    } catch (error) { const message = error instanceof Error ? error.message : String(error); patch({ phase: "error", progressText: message }); log(message) }
    finally { setRunning(false) }
  }
  function addFilter() {
    const value = draftFilter.trim()
    const meta = FILTERS.find((filter) => filter.id === filterTab)!
    if (!value || (data[meta.key] ?? []).includes(value)) return
    patch({ [meta.key]: [...(data[meta.key] ?? []), value] })
    setDraftFilter("")
  }
  function removeFilter(value: string) {
    const meta = FILTERS.find((filter) => filter.id === filterTab)!
    patch({ [meta.key]: (data[meta.key] ?? []).filter((item) => item !== value) })
  }
  async function saveDefaults() { const next = Object.fromEntries(CONFIG_FIELDS.flatMap((field) => dataRef.current[field] === undefined ? [] : [[field, dataRef.current[field]]])) as Partial<SameaCardState>; if (host.config?.save) await host.config.save(next); else await host.saveNodeConfig?.(next); setDefaults(next) }
  const props = { action, compact, configDirty, data, defaults, filterTab, paths, result, running, onAction: execute, onAddFilter: addFilter, onDraftFilter: setDraftFilter, onFilterTab: setFilterTab, onPatch: patch, onPaste: paste, onRemoveFilter: removeFilter, onRestoreDefaults: () => defaults && patch(defaults), onSaveDefaults: saveDefaults, draftFilter }
  return <TooltipProvider><div ref={surface.ref} data-testid="samea-surface" className="@container/samea flex h-full min-h-0 w-full overflow-hidden">
    {surface.mode === "collapsed" ? <Collapsed {...props} /> : compact ? <Compact {...props} /> : <Full {...props} />}
  </div></TooltipProvider>
}

type ViewProps = {
  action: SameaAction; compact: boolean; configDirty: boolean; data: SameaCardState; defaults?: Partial<SameaCardState>; filterTab: SameaFilterTab; paths: string[]; result: SameaData | null; running: boolean; draftFilter: string
  onAction: (action: SameaAction) => void; onAddFilter: () => void; onDraftFilter: (value: string) => void; onFilterTab: (tab: SameaFilterTab) => void; onPatch: (patch: Partial<SameaCardState>) => void; onPaste: () => Promise<void>; onRemoveFilter: (value: string) => void; onRestoreDefaults: () => void; onSaveDefaults: () => Promise<void>
}

function Full(props: ViewProps) {
  return <div data-testid="samea-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
    <Header {...props} />
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(210px,0.75fr)_minmax(360px,1.55fr)_minmax(210px,0.75fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-3"><SourceControl {...props} /><OperationGate {...props} /></div>
      <Analysis {...props} />
      <FilterProtocols {...props} />
    </div>
    <LogConsole {...props} />
  </div>
}
function Compact(props: ViewProps) {
  const { t } = useNodeI18n("samea")
  return <div data-testid="samea-compact-view" className="flex min-h-0 flex-1 flex-col gap-2 p-2"><Header {...props} />
    <Tabs value={props.filterTab} onValueChange={(value) => props.onFilterTab(value as SameaFilterTab)} className="flex min-h-0 flex-1 flex-col">
      <TabsList variant="line" className="grid grid-cols-3"><TabsTrigger value="artist">{t("compact.input", "输入")}</TabsTrigger><TabsTrigger value="path">{t("compact.analysis", "分析")}</TabsTrigger><TabsTrigger value="regex">{t("compact.filters", "过滤")}</TabsTrigger></TabsList>
      <div className="min-h-0 flex-1 overflow-auto pt-2">{props.filterTab === "artist" ? <div className="grid gap-2"><SourceControl {...props} /><OperationGate {...props} /></div> : props.filterTab === "path" ? <Analysis {...props} /> : <FilterProtocols {...props} />}</div>
    </Tabs>
  </div>
}
function Collapsed(props: ViewProps) {
  const { t } = useNodeI18n("samea")
  const count = props.result?.readyCount ?? props.paths.length
  return <div data-testid="samea-collapsed-view" className="flex h-full w-full items-center gap-2 rounded-lg border bg-card px-3"><ScanSearch className="size-5 text-primary" /><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{t("name", "SameA")}</div><div className="truncate text-xs text-muted-foreground">{props.data.progressText || t("collapsed.archiveCandidates", "{{count}} 个归档候选", { count })}</div></div><Badge variant={props.data.phase === "error" ? "destructive" : "outline"}>{props.data.phase ?? "idle"}</Badge><ActionButton {...props} compact /></div>
}
function Header(props: ViewProps) {
  const { t } = useNodeI18n("samea")
  const floatingFrame = useFloatingWindowFrame()
  const phase = props.running ? "running" : props.data.phase ?? "idle"
  return <header data-floating-window-titlebar={floatingFrame ? "true" : undefined} onDoubleClick={floatingFrame?.handleTitlebarDoubleClick} className="flex shrink-0 items-end justify-between gap-3 border-b-2 border-primary pb-2"><div className={cn("flex min-w-0 flex-1 items-center", floatingFrame && "xiranite-app-region-drag select-none")}><div className="flex items-center gap-2"><ScanSearch className="size-5 text-primary" /><h3 className="text-xl font-semibold tracking-tight">{t("header.title", "SameA：提取器协议")}</h3></div><p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">{t("header.sessionLabel", "工作区会话：")}<span className="text-primary">{phase.toUpperCase()}</span> | {t("header.targetLabel", "目标：归档分诊")}</p></div><div className="xiranite-app-region-no-drag flex items-center gap-2"><Badge variant={phase === "error" ? "destructive" : "outline"} className="font-mono uppercase">{phase}</Badge><NodeConfigButton nodeKey="samea" configDirty={props.configDirty} defaults={props.defaults} disabled={props.running} onResetOverride={props.onRestoreDefaults} onRestoreDefault={props.onRestoreDefaults} onSaveDefault={props.onSaveDefaults} /><Button aria-label={t("actions.reset", "重置")} size="icon-sm" variant="outline" onClick={() => props.onPatch({ phase: "idle", progress: 0, progressText: "", logs: [], result: null })}><RotateCcw /></Button><ActionButton {...props} />{floatingFrame ? <FloatingWindowCaptionControls integrated /> : null}</div></header>
}
function SourceControl(props: ViewProps) {
  const { t } = useNodeI18n("samea")
  return <section className="flex min-h-0 flex-1 flex-col border bg-card p-3"><SectionTitle icon={FolderInput} title={t("sections.sourceControl", "来源控制")} /><label className="mt-3 text-xs text-muted-foreground">{t("source.ingestionLabel", "摄入路径（按行分隔）")}</label><div className="mt-1 flex min-h-24 flex-1 gap-1"><PathTextarea aria-label="samea paths" className="min-h-24 resize-none font-mono text-xs" placeholder={t("source.placeholder", "D:/Archives/Unsorted\nE:/Staging/New")} value={props.data.pathsText ?? ""} onValueChange={(pathsText) => props.onPatch({ pathsText })} /><Tooltip><TooltipTrigger asChild><Button aria-label={t("source.pastePaths", "粘贴路径")} size="icon-sm" variant="outline" onClick={props.onPaste}><Clipboard /></Button></TooltipTrigger><TooltipContent>{t("source.pastePaths", "粘贴路径")}</TooltipContent></Tooltip></div><Field className="mt-3 border px-2 py-1.5"><FieldContent><FieldTitle className="text-xs">{t("source.ignorePathBlacklist", "忽略路径黑名单")}</FieldTitle></FieldContent><Switch checked={props.data.ignorePathBlacklist ?? false} size="sm" onCheckedChange={(ignorePathBlacklist) => props.onPatch({ ignorePathBlacklist })} /></Field></section>
}
function OperationGate(props: ViewProps) {
  const { t } = useNodeI18n("samea")
  const min = props.data.minOccurrences ?? 1
  return <section className="border bg-card p-3"><SectionTitle icon={SlidersHorizontal} title={t("sections.operationGate", "操作门")} /><div className="mt-3 flex items-center justify-between text-xs"><span>{t("operation.minOccurrences", "最小出现次数")}</span><strong className="font-mono text-primary">{min}</strong></div><Slider className="mt-3" min={1} max={10} step={1} value={[min]} onValueChange={([minOccurrences]) => props.onPatch({ minOccurrences })} /><Separator className="my-3" /><ToggleField label={t("operation.centralizeLabel", "集中输出")} description={t("operation.centralizeDesc", "移动到 [00画师分类]")} checked={props.data.centralize ?? false} onChange={(centralize) => props.onPatch({ centralize })} /><Separator className="my-3" /><ToggleField label={t("operation.dryRunLabel", "预演模式")} description={t("operation.dryRunDesc", "模拟而不移动")} checked={props.data.dryRun ?? true} danger onChange={(dryRun) => props.onPatch({ dryRun })} /><div className="mt-4"><ActionButton {...props} full /></div></section>
}
function Analysis(props: ViewProps) {
  const { t } = useNodeI18n("samea")
  const items = props.result?.items ?? []
  return <section className="flex min-h-0 flex-col border bg-card"><div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2"><SectionTitle icon={Bot} title={t("sections.analysisChamber", "分析舱")} noBorder /><Badge variant="outline">{props.result?.scannedCount ?? props.paths.length} {t("analysis.scanned", "已扫描")}</Badge></div><div className="m-3 flex items-center gap-2 border border-dashed p-2 text-xs text-muted-foreground"><RunStateIcon className="size-4" icon={ScanSearch} running={props.running} />{props.data.progressText || t("analysis.ready", "准备好扫描归档命名模式。")}</div><ScrollArea className="min-h-0 flex-1"><Table className="text-xs"><TableHeader><TableRow><TableHead>{t("analysis.entityColumn", "检测到的实体")}</TableHead><TableHead className="w-20 text-right">{t("analysis.countColumn", "数量")}</TableHead><TableHead className="w-24 text-center">{t("analysis.actionColumn", "操作")}</TableHead></TableRow></TableHeader><TableBody>{items.length ? items.slice(0, 160).map((item, index) => <AnalysisRow item={item} key={`${item.sourcePath}:${index}`} />) : <TableRow><TableCell colSpan={3} className="h-36 text-center text-muted-foreground">{t("analysis.empty", "运行预演扫描以填充画师矩阵。")}</TableCell></TableRow>}</TableBody></Table></ScrollArea></section>
}
function AnalysisRow({ item }: { item: SameaPlanItem }) { const ignored = item.status === "ignored" || item.status === "skipped"; const Icon = ignored ? AlertTriangle : item.artistName.includes("(") ? Archive : UserRound; return <TableRow data-state={item.status === "conflict" || item.status === "error" ? "selected" : undefined}><TableCell><div className="flex items-center gap-2"><Icon className={cn("size-4", ignored ? "text-muted-foreground" : "text-primary")} /><div className={cn("max-w-56 truncate border px-1.5 py-0.5 font-mono", ignored && "line-through text-muted-foreground")}>{item.artistName || item.sourceName}</div></div></TableCell><TableCell className="text-right font-mono font-semibold">{item.status === "ready" || item.status === "moved" ? "1" : "—"}</TableCell><TableCell className="text-center"><StatusBadge status={item.status} /></TableCell></TableRow> }
function FilterProtocols(props: ViewProps) { const { t } = useNodeI18n("samea"); const meta = FILTERS.find((filter) => filter.id === props.filterTab)!; const values = props.data[meta.key] ?? []; return <section className="flex min-h-0 flex-col border bg-card"><div className="border-b bg-muted/30 px-3 py-2"><SectionTitle icon={ShieldAlert} title={t("sections.filterProtocols", "过滤协议")} noBorder danger /></div><Tabs value={props.filterTab} onValueChange={(value) => props.onFilterTab(value as SameaFilterTab)} className="flex min-h-0 flex-1 flex-col"><TabsList variant="line" className="grid grid-cols-3"><TabsTrigger value="artist">{t("filters.artists", "画师")}</TabsTrigger><TabsTrigger value="path">{t("filters.paths", "路径")}</TabsTrigger><TabsTrigger value="regex">{t("filters.regex", "正则")}</TabsTrigger></TabsList><div className="p-3"><div className="flex gap-1"><Input aria-label="samea exclusion" value={props.draftFilter} placeholder={t("filters.addExclusion", "添加排除项…")} className="font-mono text-xs" onChange={(event) => props.onDraftFilter(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); props.onAddFilter() } }} /><Button aria-label="add exclusion" size="icon-sm" variant="outline" onClick={props.onAddFilter}>+</Button></div><div className="mt-3 flex flex-wrap gap-1.5">{values.map((value) => <Badge key={value} variant="secondary" className="gap-1 font-mono"><span>{value}</span><button aria-label={`remove ${value}`} onClick={() => props.onRemoveFilter(value)}><X className="size-3" /></button></Badge>)}</div></div></Tabs></section> }
function LogConsole(props: ViewProps) { const { t } = useNodeI18n("samea"); const lines = props.data.logs ?? []; return <section className="flex h-48 shrink-0 flex-col border bg-muted/30"><div className="flex items-center justify-between border-b bg-card px-3 py-1.5"><span className="flex items-center gap-2 font-mono text-xs tracking-wide text-muted-foreground"><Terminal className="size-4" />{t("logs.title", "系统日志 // 标准输出")}</span><div className="flex gap-1"><Button size="xs" variant="ghost" onClick={() => props.onPatch({ logs: [] })}>{t("logs.clear", "清空")}</Button><Button size="xs" variant="ghost" onClick={() => void props.onPaste()}>{t("logs.copy", "复制")}</Button></div></div><ScrollArea className="min-h-0 flex-1"><pre className="p-3 font-mono text-xs leading-5 text-muted-foreground">{lines.length ? lines.join("\n") : t("logs.idle", "[空闲] SameA 已就绪。默认启用预演模式。")}</pre></ScrollArea></section> }
function ActionButton(props: ViewProps & { full?: boolean }) { const { t } = useNodeI18n("samea"); const classify = props.action === "classify"; const label = classify ? t("actions.executeScan", "执行扫描") : t("actions.planScan", "规划扫描"); return <ExecuteButton size="default" className={cn(props.full && "w-full")} running={props.running} dangerous={classify && props.data.dryRun === false} label={label} onExecute={() => props.onAction(classify ? "classify" : "plan")} /> }
function ToggleField({ label, description, checked, danger, onChange }: { label: string; description: string; checked: boolean; danger?: boolean; onChange: (value: boolean) => void }) { return <Field><FieldContent><FieldLabel className={cn("text-xs", danger && "text-destructive")}>{label}</FieldLabel><div className="text-[11px] text-muted-foreground">{description}</div></FieldContent><Switch checked={checked} size="sm" onCheckedChange={onChange} /></Field> }
function SectionTitle({ icon: Icon, title, noBorder, danger }: { icon: typeof FolderInput; title: string; noBorder?: boolean; danger?: boolean }) { return <div className={cn("flex items-center gap-2 pb-2 text-xs font-semibold uppercase tracking-wider", !noBorder && "border-b")}><Icon className={cn("size-4", danger ? "text-destructive" : "text-primary")} />{title}</div> }
function StatusBadge({ status }: { status: SameaPlanItem["status"] }) { const variant = status === "error" || status === "conflict" ? "destructive" : status === "ready" || status === "moved" ? "default" : "outline"; return <Badge variant={variant} className="text-[10px] uppercase">{status}</Badge> }
function buildInput(action: SameaAction, data: SameaCardState): SameaInput { return { action, paths: splitLines(data.pathsText), ignorePathBlacklist: data.ignorePathBlacklist ?? false, minOccurrences: data.minOccurrences ?? 1, centralize: data.centralize ?? false, dryRun: data.dryRun ?? true, artistBlacklist: data.artistBlacklist, pathBlacklist: data.pathBlacklist, regexBlacklist: data.regexBlacklist } }
function splitLines(value: unknown): string[] { return String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean) }
function getHostData(host: NodeComponentProps<SameaCardState, Partial<SameaCardState>>["host"], compId: string): SameaCardState { return host.state?.getData?.() ?? host.getData<SameaCardState>(compId) ?? {} }
