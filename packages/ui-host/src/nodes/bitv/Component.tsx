import { tt } from "@/lib/i18nText"
import { useEffect, useRef, useState } from "react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NodeComponentProps, NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import { BITV_DEFAULTS } from "@xiranite/node-bitv/defaults"
import type { BitvAction, BitvData, BitvInput, BitvVideoInfo } from "@xiranite/node-bitv/core"
import { AlertTriangle, BarChart3, Clipboard, Copy, Eye, FileVideo, Folder, FolderOutput, Gauge, RotateCcw, SlidersHorizontal, Terminal, Video, Waypoints } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PathInput, PathTextarea } from "@/components/ui/path-input"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import {
  Md3eActionGroup,
  Md3eBentoStatGrid,
  Md3eConnectedGroup,
  Md3eHeaderBanner,
  Md3eHeroActionBar,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3eSectionCard,
  Md3eShapeBadge,
  Md3eShapePopoverButton,
  Md3eStatusPill,
  Md3eStepperSlider,
  Md3eSwitchRow,
  Md3eWavyProgress,
  useMd3eActive,
} from "@/nodes/shared/controls"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import { ACTIONS, NODE_META, type BitvActionMeta } from "./constants"
import { BitvMd3eView } from "./Md3eView"
import type { BitvCardState, BitvStatusMeta } from "./types"

const CONFIG_FIELDS = ["action", "pathsText", "reportPath", "targetPath", "outputPath", "recursive", "bitrateStepMbps", "maxLevels", "transferMode", "dryRun"] as const

export function Component({ compId, host }: NodeComponentProps<BitvCardState, Partial<BitvCardState>>) {
  "use no memo"
  const surface = useNodeSurface()
  const md3e = useMd3eActive()
  const data = getHostData(host, compId)
  const dataRef = useRef(data)
  dataRef.current = data
  const [running, setRunning] = useState(false)
  const [resultTab, setResultTab] = useState("tree")
  const [defaults, setDefaults] = useState<Partial<BitvCardState>>()
  const action = data.action ?? "analyze"
  const result = data.result ?? null
  const logs = data.logs ?? []
  const progress = data.progress ?? 0
  const status = statusFromState(data, running)
  const compact = surface.mode === "compact" || surface.mode === "portrait"
  const configDirty = Boolean(defaults && CONFIG_FIELDS.some((field) => JSON.stringify(data[field]) !== JSON.stringify(defaults[field])))

  useEffect(() => { (host.config?.get?.() ?? host.getNodeConfig?.())?.then((response) => setDefaults(response.config)).catch(() => undefined) }, [host])

  function patch(patchData: Partial<BitvCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    if ("pathsText" in patchData) setResultTab("tree")
    if (host.state?.patchData) host.state.patchData(patchData)
    else host.patchData(compId, patchData)
  }
  function pushLog(message: string) { patch({ logs: [...(dataRef.current.logs ?? []), message].slice(-120) }) }
  async function pastePaths() { const text = await host.clipboard?.readText?.(); if (text?.trim()) patch({ pathsText: text.trim() }) }
  async function copyResults() {
    const current = dataRef.current.result
    if (!current) return
    await host.clipboard?.writeText?.([
      ...current.videos.map((item) => `${item.filename}\t${item.bitrateMbps.toFixed(2)} Mbps\t${item.resolution}\t${item.bitrateLevel}`),
      ...current.operations.map((item) => `${item.mode}\t${item.sourcePath}\t${item.targetPath}`),
      ...current.errors,
    ].join("\n"))
  }
  async function saveDefaults() { const next = Object.fromEntries(CONFIG_FIELDS.flatMap((field) => dataRef.current[field] === undefined ? [] : [[field, dataRef.current[field]]])) as Partial<BitvCardState>; if (host.config?.save) await host.config.save(next); else await host.saveNodeConfig?.(next); setDefaults(next) }
  async function execute(nextAction = action) {
    if (running) return
    const input = buildInput(nextAction, dataRef.current)
    const error = validateInput(input)
    if (error) { patch({ phase: "error", progress: 0, progressText: error }); pushLog(error); return }
    const run = host.runner?.run ?? host.actions?.run
    if (!run) { const message = tt("module:bitv.hostUnsupported", "当前宿主不支持本地 BitV 运行。请在桌面模式或 CLI 中执行。"); patch({ phase: "error", progressText: message }); pushLog(message); return }
    setRunning(true)
    patch({ action: nextAction, phase: "running", progress: 0, progressText: `${actionMeta(nextAction).label}开始`, result: null })
    try {
      const response = await run<BitvInput, BitvData>(NODE_META.id, input, (event: NodeRunEvent) => {
        if (event.type === "progress") { patch({ progress: event.progress ?? 0, progressText: event.message }); pushLog(`[${event.progress ?? 0}%] ${event.message}`) }
        else pushLog(event.message)
      }) as NodeRunResult<BitvData>
      patch({ phase: response.success ? "completed" : "error", progress: response.success ? 100 : 0, progressText: response.message, result: response.data ?? null })
      if (nextAction === "analyze") setResultTab("videos")
      pushLog(response.message)
    } catch (runError) { const message = runError instanceof Error ? runError.message : String(runError); patch({ phase: "error", progress: 0, progressText: message }); pushLog(message) }
    finally { setRunning(false) }
  }
  const props: ViewProps = { action, configDirty, data, defaults, logs, progress, result, resultTab, running, status, onCopyLogs: () => host.clipboard?.writeText?.(logs.join("\n")), onCopyResults: copyResults, onExecute: execute, onPastePaths: pastePaths, onPatch: patch, onReset: () => { patch({ logs: [], phase: "idle", progress: 0, progressText: "", result: null }); setResultTab("tree") }, onRestoreDefaults: () => defaults && patch(defaults), onSaveDefaults: saveDefaults, onResultTabChange: setResultTab }
  if (md3e) {
    return (
      <TooltipProvider>
        <BitvMd3eView surface={surface} compact={compact} {...props} />
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider>
      <Md3eNodeSurface
        nodeId="bitv"
        surface={surface}
        className="@container/bitv flex h-full min-h-0 w-full overflow-hidden rounded-[28px]"
      >
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden">
          {surface.mode === "collapsed" || (compact && surface.height > 0 && surface.height < 150) ? (
            <CollapsedView {...props} />
          ) : surface.mode === "portrait" ? (
            <PortraitView {...props} />
          ) : surface.mode === "compact" ? (
            <CompactView {...props} />
          ) : (
            <FullView {...props} />
          )}
        </div>
      </Md3eNodeSurface>
    </TooltipProvider>
  )
}

type ViewProps = { action: BitvAction; configDirty: boolean; data: BitvCardState; defaults?: Partial<BitvCardState>; logs: string[]; progress: number; result: BitvData | null; resultTab: string; running: boolean; status: BitvStatusMeta; onCopyLogs: () => Promise<void> | void; onCopyResults: () => Promise<void> | void; onExecute: (action?: BitvAction) => void; onPastePaths: () => void; onPatch: (patch: Partial<BitvCardState>) => void; onReset: () => void; onRestoreDefaults: () => void; onSaveDefaults: () => Promise<void>; onResultTabChange: (value: string) => void }

function CollapsedView(props: ViewProps) {
  const Icon = NODE_META.icon
  return (
    <div data-testid="bitv-collapsed-view" className="flex h-full min-h-0 w-full items-center gap-3 rounded-[26px] bg-[var(--md3e-surface,var(--card))] px-4 py-3">
      <Md3eShapeBadge icon={Icon} seed="bitv-collapsed" tone="primary" active size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-black tracking-tight">
          BitV <Md3eStatusPill label={props.status.label} tone={props.status.tone} compact />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{props.data.progressText || actionMeta(props.action).description}</p>
      </div>
      <RunButton compact props={props} />
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="bitv-compact-view" className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-[22px] bg-[var(--md3e-surface,var(--card))] px-3.5 py-2.5">
        <Header {...props} />
        <Md3eActionGroup className="shrink-0">
          <Md3eShapePopoverButton nodeId="bitv" />
          <NodeConfigButton nodeKey="bitv" configDirty={props.configDirty} defaults={props.defaults} disabled={props.running} onResetOverride={props.onRestoreDefaults} onRestoreDefault={props.onRestoreDefaults} onSaveDefault={props.onSaveDefaults} />
        </Md3eActionGroup>
      </div>
      <Metrics progress={props.progress} result={props.result} />
      <OperationDesk compact props={props} />
      <ResultDesk compact props={props} />
    </div>
  )
}

function PortraitView(props: ViewProps) {
  return (
    <div data-testid="bitv-portrait-view" className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-[22px] bg-[var(--md3e-surface,var(--card))] px-3.5 py-2.5">
        <Header {...props} />
        <Md3eActionGroup className="shrink-0">
          <Md3eShapePopoverButton nodeId="bitv" />
          <NodeConfigButton nodeKey="bitv" configDirty={props.configDirty} defaults={props.defaults} disabled={props.running} onResetOverride={props.onRestoreDefaults} onRestoreDefault={props.onRestoreDefaults} onSaveDefault={props.onSaveDefaults} />
        </Md3eActionGroup>
      </div>
      <Metrics progress={props.progress} result={props.result} />
      <OperationDesk compact props={props} />
      <ResultDesk compact props={props} />
    </div>
  )
}

function FullView(props: ViewProps) {
  const meta = actionMeta(props.action)
  return (
    <div data-testid="bitv-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
      <FloatingWindowNodeHeader>
        <Md3eHeaderBanner
          icon={meta.icon}
          title="BitV"
          eyebrow="节点 / 视频码率分级"
          subtitle={props.data.progressText || meta.description}
          status={props.status}
          pills={
            <Md3eStatusPill
              label={`${props.data.bitrateStepMbps ?? BITV_DEFAULTS.bitrateStepMbps} Mbps · ${props.data.maxLevels ?? BITV_DEFAULTS.maxLevels} 级`}
              tone="secondary"
              compact
              dot={false}
            />
          }
          testId="bitv-header-toolbar"
          actions={
            <>
              <Md3eShapePopoverButton nodeId="bitv" />
              <NodeConfigButton nodeKey="bitv" configDirty={props.configDirty} defaults={props.defaults} disabled={props.running} onResetOverride={props.onRestoreDefaults} onRestoreDefault={props.onRestoreDefaults} onSaveDefault={props.onSaveDefaults} />
              <IconButton disabled={props.running} icon={RotateCcw} label={tt("module:bitv.clearResults", "清空结果")} onClick={props.onReset} />
            </>
          }
        />
      </FloatingWindowNodeHeader>
      <Metrics progress={props.progress} result={props.result} />
      <div data-slot="md3e-workbench-grid">
        <OperationDesk props={props} />
        <ResultDesk props={props} />
      </div>
    </div>
  )
}

function Header(props: ViewProps) {
  const meta = actionMeta(props.action)
  const Icon = meta.icon
  return (
    <FloatingWindowNodeHeader>
      <div className="flex min-w-0 items-center gap-2.5">
        <Md3eShapeBadge icon={Icon} seed={`bitv-${props.action}`} tone="primary" active size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate text-base font-black tracking-tight leading-none">BitV</h3>
            <Md3eStatusPill label={props.status.label} tone={props.status.tone} compact />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{props.data.progressText || meta.description}</p>
        </div>
      </div>
    </FloatingWindowNodeHeader>
  )
}

function OperationDesk({ compact, props }: { compact?: boolean; props: ViewProps }) {
  return (
    <Md3eSectionCard
      seed="bitv-operation-desk"
      title={!compact ? "视频码率工作台" : undefined}
      badge={!compact ? `${props.data.bitrateStepMbps ?? BITV_DEFAULTS.bitrateStepMbps} Mbps` : undefined}
      icon={!compact ? Gauge : undefined}
      className={cn(!compact && "flex min-h-0 flex-col")}
    >
      <Tabs value={props.action} onValueChange={(value) => props.onPatch({ action: value as BitvAction })} className="min-h-0">
        <TabsList className="grid w-full grid-cols-4">
          {ACTIONS.map((item) => (
            <TabsTrigger key={item.value} disabled={props.running} value={item.value} className="gap-1.5 px-2 text-xs">
              <item.icon className="size-3.5 shrink-0" />
              <span className="truncate">{item.shortLabel}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {ACTIONS.map((item) => (
          <TabsContent key={item.value} value={item.value} className="min-h-0 pt-2.5">
            <OperationForm compact={compact} item={item} props={props} />
          </TabsContent>
        ))}
      </Tabs>
    </Md3eSectionCard>
  )
}

function OperationForm({ compact, item, props }: { compact?: boolean; item: BitvActionMeta; props: ViewProps }) {
  const sourceAction = item.value === "analyze"
  const targetAction = item.value === "classify" || item.value === "report"
  const isDryRun = props.data.dryRun ?? true
  return (
    <div className="grid gap-2.5">
      <Md3eHeroActionBar
        primary={<RunButton compact={compact} props={{ ...props, action: item.value }} />}
        secondary={
          targetAction ? (
            <Button
              type="button"
              size="icon-sm"
              variant={isDryRun ? "secondary" : "outline"}
              shapeRole="secondary"
              disabled={props.running}
              aria-label={isDryRun ? "当前为预演模式" : "当前为真实执行模式"}
              onClick={() => props.onPatch({ dryRun: !isDryRun })}
            >
              <Eye className="size-4" />
            </Button>
          ) : undefined
        }
      />

      {sourceAction && (
        <PathWorkbench
          compact={compact}
          data={props.data}
          disabled={props.running}
          onPaste={props.onPastePaths}
          onPatch={props.onPatch}
        />
      )}

      {item.value === "report" && (
        <Input
          aria-label={tt("module:bitv.reportPlaceholder", "bitv 分析报告")}
          disabled={props.running}
          placeholder={tt("module:bitv.reportJsonPath", "BitV 分析报告 JSON 路径")}
          value={props.data.reportPath ?? ""}
          className="h-9 rounded-[14px] border-0 bg-[var(--md3e-surface-high,var(--muted))] font-mono text-xs"
          onChange={(event) => props.onPatch({ reportPath: event.currentTarget.value })}
        />
      )}

      {item.value === "analyze" && (
        <Input
          aria-label={tt("module:bitv.reportOutputPlaceholder", "bitv 报告输出路径")}
          disabled={props.running}
          placeholder={tt("module:bitv.saveReportHint", "可选：保存分析报告到 .json")}
          value={props.data.outputPath ?? ""}
          className="h-9 rounded-[14px] border-0 bg-[var(--md3e-surface-high,var(--muted))] font-mono text-xs"
          onChange={(event) => props.onPatch({ outputPath: event.currentTarget.value })}
        />
      )}

      {targetAction && (
        <Input
          aria-label={tt("module:bitv.classifyTargetPlaceholder", "bitv 分类目标目录")}
          disabled={props.running}
          placeholder={tt("module:bitv.classifyTarget", "分类目标目录")}
          value={props.data.targetPath ?? ""}
          className="h-9 rounded-[14px] border-0 bg-[var(--md3e-surface-high,var(--muted))] font-mono text-xs"
          onChange={(event) => props.onPatch({ targetPath: event.currentTarget.value })}
        />
      )}

      {item.value !== "status" && (
        <Settings action={item.value} data={props.data} disabled={props.running} onPatch={props.onPatch} />
      )}
    </div>
  )
}

function PathWorkbench(props: { compact?: boolean; data: BitvCardState; disabled: boolean; onPaste: () => void; onPatch: (patch: Partial<BitvCardState>) => void }) {
  const shared = {
    "aria-label": tt("module:bitv.videoPathPlaceholder", "bitv 视频路径"),
    disabled: props.disabled,
    value: props.data.pathsText ?? "",
    onValueChange: (pathsText: string) => props.onPatch({ pathsText }),
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[18px] bg-[var(--md3e-surface-high,var(--muted))]/65 p-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="truncate text-xs font-extrabold tracking-tight">{tt("module:bitv.videoInputLabel", "视频源路径")}</span>
        <IconButton disabled={props.disabled} icon={Clipboard} label={tt("module:shared.ui.pastePath", "粘贴路径")} onClick={props.onPaste} />
      </div>
      {props.compact ? (
        <PathInput {...shared} dropMode="append" className="h-9 rounded-[12px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] font-mono text-xs" placeholder={tt("module:bitv.videoPathHint", "视频文件或目录路径，每行一个")} />
      ) : (
        <PathTextarea {...shared} className="min-h-16 rounded-[12px] border-0 bg-[var(--md3e-surface-lowest,var(--card))] font-mono text-xs" placeholder={"每行一个视频文件或目录\nD:/Videos/clip.mp4\nD:/Videos/Season 1"} />
      )}
    </div>
  )
}

function Settings(props: { action: BitvAction; data: BitvCardState; disabled: boolean; onPatch: (patch: Partial<BitvCardState>) => void }) {
  const targetAction = props.action === "classify" || props.action === "report"
  const stepMbps = props.data.bitrateStepMbps ?? BITV_DEFAULTS.bitrateStepMbps
  const maxLevels = props.data.maxLevels ?? BITV_DEFAULTS.maxLevels
  return (
    <Md3eConnectedGroup className="w-full">
      <Md3eStepperSlider
        icon={Gauge}
        label={tt("module:bitv.bitrateStep", "码率步长 (Mbps)")}
        value={stepMbps}
        min={0.5}
        max={20}
        step={0.5}
        disabled={props.disabled}
        onChange={(bitrateStepMbps) => props.onPatch({ bitrateStepMbps })}
        className="bg-[var(--md3e-surface-high,var(--muted))]/65"
      >
        <NumberInput label={tt("module:bitv.bitrateStep", "码率步长 (Mbps)")} value={stepMbps} disabled={props.disabled} onChange={(bitrateStepMbps) => props.onPatch({ bitrateStepMbps })} />
      </Md3eStepperSlider>

      <Md3eStepperSlider
        icon={SlidersHorizontal}
        label={tt("module:bitv.levelCount", "分级数量")}
        value={maxLevels}
        min={1}
        max={16}
        step={1}
        disabled={props.disabled}
        onChange={(nextLevels) => props.onPatch({ maxLevels: nextLevels })}
        className="bg-[var(--md3e-surface-high,var(--muted))]/65"
      >
        <NumberInput label={tt("module:bitv.levelCount", "分级数量")} value={maxLevels} disabled={props.disabled} onChange={(nextLevels) => props.onPatch({ maxLevels: nextLevels })} />
      </Md3eStepperSlider>

      {(props.action === "analyze" || props.action === "classify") && (
        <Md3eSwitchRow
          icon={Folder}
          label={tt("module:shared.ui.scanRecursive", "递归扫描")}
          ariaLabel={tt("module:shared.ui.scanRecursive", "递归扫描")}
          description={tt("module:bitv.includeSubfolders", "目录包含子文件夹")}
          checked={props.data.recursive ?? BITV_DEFAULTS.recursive}
          disabled={props.disabled}
          onCheckedChange={(recursive) => props.onPatch({ recursive })}
          className="bg-[var(--md3e-surface-high,var(--muted))]/65"
        />
      )}

      {targetAction && (
        <>
          <div className="grid grid-cols-2 gap-1.5 bg-[var(--md3e-surface-high,var(--muted))]/65 p-2">
            <Button disabled={props.disabled} size="sm" className="rounded-full font-bold" variant={(props.data.transferMode ?? "copy") === "copy" ? "default" : "ghost"} onClick={() => props.onPatch({ transferMode: "copy" })}>{tt("module:shared.ui.copy", "复制")}</Button>
            <Button disabled={props.disabled} size="sm" className="rounded-full font-bold" variant={props.data.transferMode === "move" ? "default" : "ghost"} onClick={() => props.onPatch({ transferMode: "move" })}>{tt("module:shared.ui.move", "移动")}</Button>
          </div>
          <Md3eSwitchRow
            icon={Eye}
            label={tt("module:shared.ui.dryRunMode", "预演模式")}
            ariaLabel={tt("module:shared.ui.dryRunMode", "预演模式")}
            description={tt("module:bitv.writeOnDisable", "关闭后执行文件操作")}
            checked={props.data.dryRun ?? true}
            disabled={props.disabled}
            onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
            className="bg-[var(--md3e-surface-high,var(--muted))]/65"
          />
        </>
      )}
    </Md3eConnectedGroup>
  )
}

function NumberInput(props: { disabled: boolean; label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Input
      aria-label={`bitv ${props.label}`}
      disabled={props.disabled}
      min={0.1}
      step={props.label.includes(tt("module:bitv.quantity", "数量")) ? 1 : 0.5}
      type="number"
      value={props.value}
      className="sr-only"
      onChange={(event) => props.onChange(Number(event.currentTarget.value))}
    />
  )
}

type TreeNode = { name: string; path: string; kind: "directory" | "video"; children: TreeNode[] }
function PathTree({ pathsText }: { compact?: boolean; pathsText?: string }) {
  const roots = buildPathTree(pathsText)
  return (
    <div data-testid="bitv-path-tree" className="rounded-[20px] bg-[var(--md3e-surface-low,var(--background))]/75 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-extrabold text-muted-foreground">
        <FolderOutput className="size-3.5 text-primary" />
        <span>{tt("module:bitv.analysisInput", "视频分析输入")}</span>
        <Md3eStatusPill label={`${roots.length} 项`} tone={roots.length > 0 ? "primary" : "neutral"} compact dot={false} className="ml-auto" />
      </div>
      <ScrollArea className="max-h-40">
        <div className="p-1">
          {roots.length ? roots.map((node) => <TreeRow key={node.path} node={node} />) : <div className="px-1 py-4 text-center text-xs text-muted-foreground">{tt("module:bitv.addedHere", "添加文件或目录后会显示在这里。")}</div>}
        </div>
      </ScrollArea>
    </div>
  )
}
function TreeRow({ depth = 0, node }: { depth?: number; node: TreeNode }) { const Icon = node.kind === "video" ? FileVideo : Folder; return <div><div className="flex min-w-0 items-center gap-1.5 rounded-[10px] px-2 py-1 text-xs" style={{ paddingLeft: `${depth * 12 + 4}px` }} title={node.path}><Icon className="size-3.5 shrink-0 text-primary" /><span className="truncate font-mono">{node.name}</span>{node.kind === "directory" && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{tt("module:shared.ui.scan", "扫描")}</span>}</div>{node.children.map((child) => <TreeRow key={child.path} depth={depth + 1} node={child} />)}</div> }
function buildPathTree(pathsText?: string): TreeNode[] { const roots: TreeNode[] = []; for (const raw of pathsText?.split(/\r?\n/) ?? []) { const path = raw.trim().replace(/^['"]|['"]$/g, ""); if (!path) continue; const parts = path.replaceAll("\\", "/").split("/").filter(Boolean); let nodes = roots; let joined = path.startsWith("/") ? "/" : ""; for (let index = 0; index < parts.length; index += 1) { const name = parts[index]!; joined = joined ? `${joined}/${name}` : name; const last = index === parts.length - 1; const kind = last && /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v|mpg|mpeg|ogv|ts|mts|m2ts)$/i.test(name) ? "video" : "directory"; let node = nodes.find((item) => item.name === name && item.kind === kind); if (!node) { node = { name, path: joined, kind, children: [] }; nodes.push(node) } nodes = node.children } } return roots }

function Metrics({ progress, result }: { progress: number; result: BitvData | null }) {
  const stats = result?.stats
  return (
    <div data-testid="bitv-stats-dashboard" className="grid shrink-0 gap-2">
      <Md3eBentoStatGrid
        items={[
          { label: tt("module:shared.ui.video", "视频"), value: stats?.totalVideos ?? 0, icon: Video, tone: "primary" },
          { label: "平均码率", value: stats ? `${stats.averageBitrateMbps.toFixed(1)} Mbps` : "—", icon: Gauge, tone: "secondary" },
          { label: "分类操作", value: result?.operations.length ?? 0, icon: FolderOutput, tone: "tertiary" },
          { label: tt("module:shared.ui.issues", "问题"), value: result?.errors.length ?? 0, icon: AlertTriangle, tone: (result?.errors.length ?? 0) > 0 ? "error" : "default" },
        ]}
      />
      {progress > 0 && (
        <div className="rounded-[18px] bg-[var(--md3e-surface,var(--card))] p-2.5">
          <Md3eWavyProgress value={progress} running />
          <Progress className="sr-only h-1.5" value={progress} />
        </div>
      )}
    </div>
  )
}

function ResultDesk({ compact, props }: { compact?: boolean; props: ViewProps }) {
  const errors = props.result?.errors ?? []
  return (
    <Md3eSectionCard
      seed="bitv-result-desk"
      className="flex min-h-0 flex-1 flex-col p-3"
    >
      <Tabs value={props.resultTab} onValueChange={props.onResultTabChange} className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <TabsList className="flex-wrap">
            <TabsTrigger value="tree"><FolderOutput />{tt("module:shared.ui.fileTree", "文件树")}</TabsTrigger>
            <TabsTrigger value="videos"><Video />{tt("module:shared.ui.video", "视频")}</TabsTrigger>
            <TabsTrigger value="plan"><Waypoints />{tt("module:shared.ui.plan", "计划")}</TabsTrigger>
            <TabsTrigger value="issues"><AlertTriangle />{tt("module:shared.ui.issues", "问题")}</TabsTrigger>
            <TabsTrigger value="logs"><Terminal />{tt("module:shared.ui.log", "日志")}</TabsTrigger>
            <TabsTrigger value="shapes">形状</TabsTrigger>
          </TabsList>
          <Md3eActionGroup>
            <IconButton disabled={!(props.result?.videos.length || props.result?.operations.length)} icon={Copy} label="复制结果" onClick={props.onCopyResults} />
            <IconButton disabled={!props.logs.length} icon={Clipboard} label={tt("module:shared.ui.copyLog", "复制日志")} onClick={props.onCopyLogs} />
          </Md3eActionGroup>
        </div>
        <TabsContent value="tree" className="min-h-0 flex-1"><PathTree compact={compact} pathsText={props.data.pathsText} /></TabsContent>
        <TabsContent value="videos" className="min-h-0 flex-1"><VideoTable compact={compact} videos={props.result?.videos ?? []} /></TabsContent>
        <TabsContent value="plan" className="min-h-0 flex-1"><PlanList compact={compact} operations={props.result?.operations ?? []} /></TabsContent>
        <TabsContent value="issues" className="min-h-0 flex-1"><TextPanel compact={compact} empty="未发现问题。" icon={AlertTriangle} lines={errors} /></TabsContent>
        <TabsContent value="logs" className="min-h-0 flex-1"><TextPanel compact={compact} empty="运行事件会显示在这里。" icon={Terminal} lines={props.logs} /></TabsContent>
        <TabsContent value="shapes" className="min-h-0 flex-1 overflow-auto"><Md3eNodeShapePolicyPanel nodeId="bitv" /></TabsContent>
      </Tabs>
    </Md3eSectionCard>
  )
}

function VideoTable({ compact, videos }: { compact?: boolean; videos: BitvVideoInfo[] }) { return <ScrollArea className={cn("h-full", compact ? "min-h-28" : "min-h-0 flex-1")}><div className="min-w-[480px] space-y-1.5 p-2"><div className="grid grid-cols-[minmax(180px,1fr)_90px_80px_110px] gap-2 px-3 pb-1 text-[11px] font-bold text-muted-foreground"><span>{tt("module:shared.ui.video", "视频")}</span><span>{tt("module:shared.ui.bitrate", "码率")}</span><span>{tt("module:shared.ui.resolution", "分辨率")}</span><span>{tt("module:bitv.level", "级别")}</span></div>{videos.length ? videos.map((video) => <div key={video.path} className="grid grid-cols-[minmax(180px,1fr)_90px_80px_110px] items-center gap-2 rounded-[14px] bg-[var(--md3e-surface-high,var(--muted))]/65 px-3 py-2 text-xs"><span className="truncate font-mono" title={video.path}>{video.filename}</span><span className="font-mono font-bold text-primary">{video.bitrateMbps.toFixed(2)} Mbps</span><span>{video.resolution}</span><Badge variant="secondary" className="w-fit rounded-full border-0">{video.bitrateLevel}</Badge></div>) : <Empty icon={BarChart3} title="等待分析结果" description="执行分析后，这里会列出视频码率和分级。" />}</div></ScrollArea> }
function PlanList({ compact, operations }: { compact?: boolean; operations: BitvData["operations"] }) { return <ScrollArea className={cn("h-full", compact ? "min-h-28" : "min-h-0 flex-1")}><div className="grid gap-2 p-2">{operations.length ? operations.map((item) => <div key={`${item.sourcePath}-${item.targetPath}`} className={cn("grid gap-1 rounded-[18px] bg-[var(--md3e-surface-high,var(--muted))]/65 p-3 text-xs", !item.success && "bg-destructive/15")}><div className="flex justify-between gap-2"><Badge variant={item.success ? "secondary" : "destructive"} className="rounded-full border-0">{item.dryRun ? tt("module:shared.ui.dryRun", "预演") : item.mode === "move" ? tt("module:shared.ui.move", "移动") : tt("common:duplicate", "复制")}</Badge><span className="truncate font-bold text-muted-foreground">{item.bitrateLevel}</span></div><div className="truncate font-mono" title={item.sourcePath}>{item.sourcePath}</div><div className="truncate font-mono font-semibold text-primary" title={item.targetPath}>→ {item.targetPath}</div>{item.error && <div className="text-destructive">{item.error}</div>}</div>) : <Empty icon={Waypoints} title="暂无分类计划" description="选择分类工作流并运行预演，目标文件会显示在这里。" />}</div></ScrollArea> }
function TextPanel({ compact, empty, icon: Icon, lines }: { compact?: boolean; empty: string; icon: LucideIcon; lines: string[] }) { return <ScrollArea className={cn("h-full", compact ? "min-h-28" : "min-h-0 flex-1")}><div className="p-2">{lines.length ? <pre className="whitespace-pre-wrap break-words rounded-[18px] bg-[var(--md3e-surface-low,var(--background))]/70 p-3 font-mono text-xs leading-5 text-muted-foreground">{lines.join("\n")}</pre> : <Empty icon={Icon} title={empty} description="" />}</div></ScrollArea> }
function Empty({ description, icon: Icon, title }: { description: string; icon: LucideIcon; title: string }) { return <div className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-[20px] bg-[var(--md3e-surface-low,var(--background))]/60 p-4 text-center text-xs text-muted-foreground"><Md3eShapeBadge icon={Icon} seed={`bitv-empty-${title}`} tone="neutral" size="md" /><span className="font-bold text-foreground/85">{title}</span>{description && <span>{description}</span>}</div> }
function RunButton({ compact, props }: { compact?: boolean; props: ViewProps }) { const dangerous = (props.action === "classify" || props.action === "report") && props.data.dryRun === false; const label = props.action === "status" ? tt("module:bitv.runStatus", "检查环境") : props.action === "analyze" ? tt("module:bitv.runAnalyze", "开始分析") : (props.data.dryRun ?? true) ? tt("module:bitv.runPlan", "生成分类计划") : `${props.data.transferMode === "move" ? tt("module:shared.ui.move", "移动") : tt("module:shared.ui.copy", "复制")}并分类`; return <ExecuteButton size={compact ? "xs" : "default"} running={props.running} dangerous={dangerous} label={label} onExecute={() => props.onExecute(props.action)} /> }
function IconButton(props: { disabled?: boolean; icon: LucideIcon; label: string; onClick: () => void }) { const Icon = props.icon; return <Tooltip><TooltipTrigger asChild><Button aria-label={props.label} disabled={props.disabled} size="icon-sm" shapeRole="toolbar" variant="outline" onClick={props.onClick}><Icon /><span className="sr-only">{props.label}</span></Button></TooltipTrigger><TooltipContent>{props.label}</TooltipContent></Tooltip> }

function getHostData(host: NodeComponentProps<BitvCardState, Partial<BitvCardState>>["host"], compId: string): BitvCardState { return host.state?.getData?.() ?? host.getData<BitvCardState>(compId) ?? {} }
function actionMeta(action: BitvAction): BitvActionMeta { return ACTIONS.find((item) => item.value === action) ?? ACTIONS[0]! }
function buildInput(action: BitvAction, data: BitvCardState): BitvInput { const paths = (data.pathsText ?? "").split(/\r?\n/).map((line) => line.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean); return { action, paths: action === "analyze" || (action === "classify" && !data.reportPath?.trim()) ? paths : undefined, reportPath: action === "report" || (action === "classify" && data.reportPath?.trim()) ? data.reportPath?.trim() : undefined, targetPath: action === "classify" || action === "report" ? data.targetPath?.trim() : undefined, outputPath: action === "analyze" && data.outputPath?.trim() ? data.outputPath.trim() : undefined, recursive: data.recursive ?? BITV_DEFAULTS.recursive, bitrateStepMbps: data.bitrateStepMbps ?? BITV_DEFAULTS.bitrateStepMbps, maxLevels: data.maxLevels ?? BITV_DEFAULTS.maxLevels, transferMode: data.transferMode ?? BITV_DEFAULTS.transferMode, dryRun: data.dryRun ?? BITV_DEFAULTS.dryRun } }
function validateInput(input: BitvInput): string | null { if (input.action === "analyze" && !input.paths?.length) return tt("module:bitv.pathRequired", "请先输入至少一个视频文件或目录路径。"); if (input.action === "report" && !input.reportPath) return tt("module:bitv.reportPathRequired", "请先输入 BitV 分析报告 JSON 路径。"); if ((input.action === "classify" || input.action === "report") && !input.targetPath) return tt("module:bitv.targetPathRequired", "请先输入分类目标目录。"); if (input.action === "classify" && !input.paths?.length && !input.reportPath) return tt("module:bitv.classifySourceRequired", "分类需要视频路径或分析报告路径。"); return null }
function statusFromState(data: BitvCardState, running: boolean): BitvStatusMeta { if (running || data.phase === "running") return { get label() { return tt("module:shared.ui.running", "运行中") }, get description() { return data.progressText || tt("module:bitv.processingStatus", "正在调用 ffprobe 处理视频码率。") }, tone: "running", badgeVariant: "secondary", iconClass: "bg-primary text-primary-foreground" }; if (data.phase === "error" || data.result?.errors.length) return { get label() { return tt("common:failed", "失败") }, get description() { return data.progressText || data.result?.errors[0] || tt("module:bitv.checkPathOrFfprobe", "请检查路径或 ffprobe 环境。") }, tone: "error", badgeVariant: "destructive", iconClass: "bg-destructive/15 text-destructive" }; if (data.phase === "completed") return { get label() { return tt("module:shared.ui.completed", "完成") }, get description() { return data.progressText || tt("module:bitv.taskComplete", "BitV 任务已完成。") }, tone: "success", badgeVariant: "default", iconClass: "bg-primary/15 text-primary" }; return { get label() { return tt("module:shared.ui.ready", "就绪") }, get description() { return tt("module:bitv.readyDescription", "扫描视频或目录，计算码率、时长与分级。") }, tone: "idle", badgeVariant: "outline", iconClass: "bg-[var(--md3e-primary-container,var(--secondary))] text-[var(--md3e-on-primary-container,var(--primary))]" } }
