import { useEffect, useRef, useState } from "react"
import type { NodeComponentProps } from "@xiranite/contract"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type {
  RepackuAction,
  RepackuData,
  RepackuInput,
  RepackuResult,
} from "@xiranite/node-repacku/core"
import { ArrowRight, Check, Copy, FileImage, FileText, Film, ListTodo, Package, Play, RotateCcw, Settings2, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { RunningTint } from "@/nodes/shared/controls"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { NodeRunHistoryPopover } from "@/nodes/shared/NodeRunHistoryPopover"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { ACTIONS, CONFIG_FIELDS } from "./constants"
import {
  ConfigFilePanel,
  CompactOptionsPanel,
  OptionsPanel,
  PathInput,
  RepackWorkflowTabs,
  StatusStrip,
} from "./controls"
import { FileTreePreview } from "./FileTreePreview"
import type { RepackuCardState, RepackuStatusMeta } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("repacku")
  const data = host.getData<RepackuCardState>(compId) ?? {}
  const dataRef = useRef<RepackuCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<RepackuCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const result = data.result ?? null
  const logs = data.logs ?? []
  const action = data.action ?? "full"
  const progress = data.progress ?? 0
  const modeMeta = ACTIONS.find((item) => item.value === action) ?? ACTIONS[1]!
  const types = parseTypes(data.typesText)
  const status = statusFromState(data, running)
  const operationPreview = result?.operations.slice(0, 120) ?? []

  async function loadDefaults() {
    await host.getNodeConfig?.<Partial<RepackuCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    void loadDefaults()
  }, [host])

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.action, data.configPath, data.deleteAfter, data.dryRun, data.minCount, data.path, data.typesText, defaults])

  function patch(patchData: Partial<RepackuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-80)
    patch({ logs: nextLogs })
  }

  async function pastePath() {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ path: text.trim() })
  }

  async function copyResults() {
    const text = [
      result?.configPath ? `config=${result.configPath}` : "",
      ...operationPreview.map((item) => `${item.status} ${item.mode} ${item.sourcePath} -> ${item.targetPath}`),
    ].filter(Boolean).join("\n")
    if (text) await host.clipboard?.writeText?.(text)
  }

  async function copyLogs() {
    if (logs.length) await host.clipboard?.writeText?.(logs.join("\n"))
  }

  function reset() {
    patch({ phase: "idle", progress: 0, progressText: "", result: null, logs: [] })
  }

  async function saveAsDefault() {
    const config: Partial<RepackuCardState> = {}
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
    patch({ path: undefined, configPath: undefined, typesText: undefined, minCount: undefined, deleteAfter: undefined, dryRun: undefined, action: undefined })
  }

  function restoreFromHistory(input: unknown) {
    patch(restoreFromHistoryInput(input))
    pushLog("已从历史记录恢复参数。")
  }

  async function execute(nextAction = action) {
    if (running) return
    const input = buildInput(nextAction, data)
    if (nextAction !== "compress" && !input.path && !input.paths?.length) {
      const message = "请先选择文件夹路径。"
      patch({ progressText: message })
      pushLog(message)
      return
    }
    if (nextAction === "compress" && !input.configPath && !input.path && !input.paths?.length) {
      const message = "按配置压缩需要配置路径或文件夹路径。"
      patch({ progressText: message })
      pushLog(message)
      return
    }

    const runAction = host.actions?.run
    if (!runAction) {
      const message = "Local Backend 暂不可用，无法运行 repacku。"
      patch({ phase: "error", progress: 0, progressText: message })
      pushLog(message)
      return
    }

    setRunning(true)
    patch({ action: nextAction, phase: "running", progress: 0, progressText: "正在启动 repacku。", result: null })
    try {
      const response = await runAction<RepackuInput, RepackuData>("repacku", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          return
        }
        pushLog(event.message)
      }) as RepackuResult

      patch({
        phase: response.success ? "completed" : "error",
        progress: response.success ? 100 : 0,
        progressText: response.message,
        result: response.data ?? null,
        configPath: response.data?.configPath || dataRef.current.configPath,
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
    configDirty,
    configFilePath,
    data,
    defaults,
    running,
    onActionChange: (value: RepackuAction) => patch({ action: value }),
    onExecute: (value?: RepackuAction) => execute(value),
    onPaste: pastePath,
    onPatch: patch,
    onReset: reset,
    onRestoreDefault: restoreDefault,
    onSaveDefault: saveAsDefault,
    onResetOverride: resetOverride,
    onOpenConfigFile: host.openConfigFile,
    onLoadDefaults: loadDefaults,
    t,
  }

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/repacku relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="accent" height="sm" primaryAt={[20, 0]} primaryStrength={16} primaryStop={34} accentAt={[80, 10]} accentStrength={42} accentStop={30} />
        <div className="relative flex min-h-0 w-full flex-col">
          {surface.mode === "collapsed" ? (
            <CollapsedView
              {...commonProps}
              actionLabel={modeMeta.label}
              modeIcon={modeMeta.icon}
              progress={progress}
              result={result}
              status={status}
            />
          ) : surface.mode === "compact" ? (
            <CompactView
              {...commonProps}
              modeIcon={modeMeta.icon}
              modeDescription={modeMeta.description}
              progress={progress}
              status={status}
            />
          ) : surface.mode === "portrait" ? (
            <PortraitCompactView
              {...commonProps}
              logs={logs}
              modeIcon={modeMeta.icon}
              modeDescription={modeMeta.description}
              operationPreview={operationPreview}
              progress={progress}
              result={result}
              status={status}
              onCopyLogs={copyLogs}
              onCopyResults={copyResults}
            />
          ) : (
            <FullView
              {...commonProps}
              componentId={compId}
              logs={logs}
              operationPreview={operationPreview}
              progress={progress}
              result={result}
              status={status}
              types={types}
              onCopyLogs={copyLogs}
              onCopyResults={copyResults}
              onRestoreHistory={restoreFromHistory}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

function CollapsedView(props: {
  action: RepackuAction
  actionLabel: string
  data: RepackuCardState
  modeIcon: typeof Play
  progress: number
  result: RepackuData | null
  running: boolean
  status: RepackuStatusMeta
  onExecute: (action?: RepackuAction) => void
}) {
  const text = summarize(props.data, props.result)
  const ModeIcon = props.modeIcon
  return (
    <div className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/80 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Package />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Repacku</span>
          <Badge variant={props.status.badgeVariant}>{props.actionLabel}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{text}</div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{compactOptionSummary(props.data)}</div>
      </div>
      <div className="relative flex shrink-0 items-center gap-1">
        <ExecuteButton
          compact
          dangerous={Boolean(props.data.deleteAfter) && !(props.data.dryRun ?? true)}
          disabled={props.running}
          idleIcon={<ModeIcon />}
          label="快速启动"
          size="icon-xs"
          onExecute={() => props.onExecute(props.action)}
        />
      </div>
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: {
  action: RepackuAction
  configDirty: boolean
  configFilePath?: string
  data: RepackuCardState
  defaults?: Partial<RepackuCardState>
  modeIcon: typeof Play
  modeDescription: string
  progress: number
  running: boolean
  status: RepackuStatusMeta
  onActionChange: (value: RepackuAction) => void
  onExecute: (action?: RepackuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<RepackuCardState>) => void
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onResetOverride: () => void
}) {
  const ModeIcon = props.modeIcon
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || props.modeDescription} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-h-0 flex-col gap-2 px-3 pb-3">
          <PathInput compact data={props.data} disabled={props.running} onPaste={props.onPaste} onPatch={props.onPatch} />
          <RepackExecutionBar action={props.action} data={props.data} disabled={props.running} modeIcon={ModeIcon} onActionChange={props.onActionChange} onExecute={props.onExecute} />
          {(props.status.tone === "running" || props.status.tone === "error") && (
            <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
          )}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t bg-background/80 p-2">
        <CompactOptionsPanel data={props.data} disabled={props.running} onPatch={props.onPatch} />
      </div>
    </div>
  )
}

function PortraitCompactView(props: {
  action: RepackuAction
  configDirty: boolean
  configFilePath?: string
  data: RepackuCardState
  defaults?: Partial<RepackuCardState>
  logs: string[]
  modeDescription: string
  modeIcon: typeof Play
  operationPreview: RepackuData["operations"]
  progress: number
  result: RepackuData | null
  running: boolean
  status: RepackuStatusMeta
  onActionChange: (value: RepackuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: RepackuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<RepackuCardState>) => void
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onResetOverride: () => void
}) {
  const ModeIcon = props.modeIcon
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2" data-testid="repacku-portrait-surface">
      <div className="flex shrink-0 items-start gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || props.modeDescription} />
      </div>

      <div className="grid shrink-0 gap-2">
        <PathInput compact data={props.data} disabled={props.running} onPaste={props.onPaste} onPatch={props.onPatch} />
        <RepackExecutionBar action={props.action} data={props.data} disabled={props.running} modeIcon={ModeIcon} onActionChange={props.onActionChange} onExecute={props.onExecute} />
        <CompactOptionsPanel data={props.data} disabled={props.running} onPatch={props.onPatch} />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
      </div>

      <Tabs defaultValue="operations" className="flex min-h-0 flex-1 flex-col" data-testid="repacku-portrait-results">
        <TabsList variant="line" className="grid w-full grid-cols-3">
          <TabsTrigger value="operations">操作</TabsTrigger>
          <TabsTrigger value="tree">目录树</TabsTrigger>
          <TabsTrigger value="logs">日志</TabsTrigger>
        </TabsList>
        <TabsContent value="operations" className="min-h-0 flex-1">
          <PreviewPanel
            emptyText="运行分析或完整流程后可预览文件夹操作。"
            lines={props.operationPreview.map((item) => `${item.status.padEnd(7)} ${item.mode.padEnd(9)} ${item.sourcePath} -> ${item.targetPath}`)}
            onCopy={props.onCopyResults}
          />
        </TabsContent>
        <TabsContent value="tree" className="min-h-0 flex-1">
          <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
            <FileTreePreview root={props.result?.folderTree ?? null} />
          </section>
        </TabsContent>
        <TabsContent value="logs" className="min-h-0 flex-1">
          <PreviewPanel emptyText="运行日志会显示在这里。" lines={props.logs} onCopy={props.onCopyLogs} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FullView(props: {
  action: RepackuAction
  configDirty: boolean
  configFilePath?: string
  componentId: string
  data: RepackuCardState
  defaults?: Partial<RepackuCardState>
  logs: string[]
  operationPreview: RepackuData["operations"]
  progress: number
  result: RepackuData | null
  running: boolean
  status: RepackuStatusMeta
  types: string[]
  onActionChange: (value: RepackuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: RepackuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onLoadDefaults: () => Promise<void>
  /**
   * 可选。统一 GUI 里「打开历史中心」的入口由壳层 `TopBar` 提供（同一个 `setOverlay("history")`），
   * 节点侧不再自己拉壳层 store——那条 import 正是 ADR-0069 逐节点独立分发要清零的耦合。
   * 未提供时 popover 不显示该按钮，这是 `NodeRunHistoryPopover` 自己的既有约定。
   */
  onOpenHistory?: () => void
  onPaste: () => void
  onPatch: (patch: Partial<RepackuCardState>) => void
  onReset: () => void
  onRestoreDefault: () => void
  onRestoreHistory: (input: unknown) => void
  onSaveDefault: () => void
  onResetOverride: () => void
  t: ReturnType<typeof useNodeI18n>["t"]
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/repacku:flex-row @4xl/repacku:items-center @4xl/repacku:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/repacku:flex-row @4xl/repacku:items-center">
          <HeaderLine
            status={props.status}
            subtitle={props.data.progressText || `${props.types.length ? props.types.join(", ") : "全部文件"} | 至少 ${props.data.minCount ?? 2} 个 | ${props.data.dryRun ?? true ? "预演" : "写入"}`}
          />
          <div data-testid="repacku-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" onClick={props.onReset}>
                  <RotateCcw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>清空运行状态</TooltipContent>
            </Tooltip>
            <NodeRunHistoryPopover
              nodeId="repacku"
              componentId={props.componentId}
              disabled={props.running}
              onRestore={props.onRestoreHistory}
              onOpenHistory={props.onOpenHistory}
            />
          </div>
        </div>
        <HeaderStats result={props.result} />
      </div>

      <WorkflowRail action={props.action} status={props.status} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @4xl/repacku:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] @6xl/repacku:gap-4">
        <div className="flex min-h-0 flex-col gap-3">
          <section className="grid shrink-0 gap-3 rounded-lg border border-border/70 bg-background/60 p-3 shadow-sm">
            <div className="flex min-w-0 flex-col gap-3 @3xl/repacku:flex-row @3xl/repacku:items-end">
              <PathInput data={props.data} disabled={props.running} onPaste={props.onPaste} onPatch={props.onPatch} />
              <div className="min-w-44 shrink-0 text-xs text-muted-foreground">选择流程后立即执行；配置始终显示在右侧。</div>
            </div>
            <RepackExecutionBar action={props.action} data={props.data} disabled={props.running} onActionChange={props.onActionChange} onExecute={props.onExecute} />
          </section>
          <FolderMatrix result={props.result} />
          <Tabs defaultValue="operations" className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2"><ListTodo className="text-muted-foreground" /><h3 className="text-sm font-semibold">重打包计划</h3></div>
              <TabsList aria-label="重打包结果" variant="line">
                <TabsTrigger value="operations">计划</TabsTrigger>
                <TabsTrigger value="tree">目录树</TabsTrigger>
                <TabsTrigger value="logs">日志</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="operations" className="min-h-0 flex-1"><RepackPlanTable items={props.operationPreview} onCopy={props.onCopyResults} /></TabsContent>
            <TabsContent value="tree" className="min-h-0 flex-1"><Card className="flex h-full min-h-0 flex-col"><CardContent className="min-h-0 flex-1 p-0"><FileTreePreview root={props.result?.folderTree ?? null} /></CardContent></Card></TabsContent>
            <TabsContent value="logs" className="min-h-0 flex-1"><PreviewPanel emptyText="运行日志会显示在这里。" lines={props.logs} onCopy={props.onCopyLogs} /></TabsContent>
          </Tabs>
        </div>
        <section className="flex min-h-0 flex-col rounded-lg border border-border/70 bg-background/70 shadow-sm">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base"><Settings2 />打包配置</CardTitle>
            <CardDescription>路径、压缩条件与风险开关在同一处确认。</CardDescription>
            </div>
            <NodeConfigPopover
              configPath={props.configFilePath}
              defaults={props.defaults as Record<string, unknown> | undefined}
              dirty={props.configDirty}
              disabled={props.running}
              t={props.t}
              onOpenFile={props.onOpenConfigFile}
              onReload={props.onLoadDefaults}
              onRestore={props.onRestoreDefault}
              onSave={props.onSaveDefault}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-4 p-4">
              <OptionsPanel data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ConfigFilePanel
                compact
                configFilePath={props.configFilePath}
                configDirty={props.configDirty}
                data={props.data}
                defaults={props.defaults}
                disabled={props.running}
                onOpenConfigFile={props.onOpenConfigFile}
                onPatch={props.onPatch}
                onReset={props.onReset}
                onRestoreDefault={props.onRestoreDefault}
                onSaveDefault={props.onSaveDefault}
                onResetOverride={props.onResetOverride}
              />
            </div>
          </ScrollArea>
        </section>
      </div>
      {(props.status.tone === "running" || props.status.tone === "error") && <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />}
    </div>
  )
}

function RepackExecutionBar(props: {
  action: RepackuAction
  data: RepackuCardState
  disabled: boolean
  modeIcon?: typeof Play
  onActionChange: (value: RepackuAction) => void
  onExecute: (action?: RepackuAction) => void
}) {
  const action = ACTIONS.find((item) => item.value === props.action) ?? ACTIONS[1]!
  const ModeIcon = props.modeIcon ?? action.icon
  return (
    <div className="flex min-w-0 flex-col gap-2 @3xl/repacku:flex-row @3xl/repacku:items-end">
      <RepackWorkflowTabs action={props.action} className="min-w-0 flex-1" disabled={props.disabled} onActionChange={props.onActionChange} />
      <ExecuteButton
        dangerous={Boolean(props.data.deleteAfter) && !(props.data.dryRun ?? true)}
        disabled={props.disabled}
        idleIcon={<ModeIcon data-icon="inline-start" />}
        label={`启动 ${action.label}`}
        size="default"
        onExecute={() => props.onExecute(props.action)}
      />
    </div>
  )
}

function WorkflowRail(props: { action: RepackuAction; status: RepackuStatusMeta }) {
  const currentIndex = props.action === "analyze" ? 0 : props.action === "full" ? 1 : props.action === "compress" ? 2 : 3
  const steps = ["分析", "配置", "打包", "核验"]
  return (
    <div className="flex w-fit max-w-full shrink-0 items-center gap-3 overflow-x-auto rounded-md border bg-background/60 px-3 py-1.5" aria-label="打包进度">
        {steps.map((label, index) => {
          const active = index === currentIndex
          const complete = index < currentIndex || (props.status.tone === "success" && index <= currentIndex)
          return (
            <div key={label} className="flex shrink-0 items-center gap-1.5">
              <Badge className="size-5 justify-center p-0" variant={active ? "default" : complete ? "secondary" : "outline"}>{complete ? <Check /> : index + 1}</Badge>
              <span className={cn("text-xs font-medium", active && "text-primary")}>{label}</span>
            </div>
          )
        })}
    </div>
  )
}

function FolderMatrix({ result }: { result: RepackuData | null }) {
  const fileTypes = result?.folderTree?.fileTypes ?? {}
  const cells = [
    { label: "图像", value: fileTypes.image ?? 0, icon: FileImage },
    { label: "视频", value: fileTypes.video ?? 0, icon: Film },
    { label: "文本 / 元数据", value: (fileTypes.text ?? 0) + (fileTypes.document ?? 0) + (fileTypes.meta ?? 0), icon: FileText },
  ]
  return (
    <Card className="shrink-0">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div><CardTitle className="text-base">目录矩阵分析</CardTitle><CardDescription>分析完成后按内容类型汇总目录。</CardDescription></div>
        <Badge variant="outline">{result?.totalFolders ?? 0} 目录</Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-2">
        {cells.map((cell) => {
          const Icon = cell.icon
          return <div key={cell.label} className="grid place-items-center gap-1 rounded-md border p-3 text-center"><Icon className="text-primary" /><span className="text-xs text-muted-foreground">{cell.label}</span><strong className="text-lg tabular-nums">{cell.value}</strong></div>
        })}
      </CardContent>
    </Card>
  )
}

function RepackPlanTable(props: { items: RepackuData["operations"]; onCopy: () => void }) {
  if (!props.items.length) return <Card className="flex h-full min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">运行分析或完整流程后，会在此显示重打包计划。</Card>
  return (
    <Card className="h-full min-h-0 overflow-hidden">
      <div className="flex items-center justify-end border-b px-3 py-2"><Button size="xs" variant="ghost" onClick={props.onCopy}><Copy data-icon="inline-start" />复制</Button></div>
      <ScrollArea className="h-[calc(100%-2.5rem)]">
        <Table>
          <TableHeader><TableRow><TableHead>源路径</TableHead><TableHead className="w-16 text-center">操作</TableHead><TableHead>目标</TableHead></TableRow></TableHeader>
          <TableBody>
            {props.items.map((item) => {
              const purge = item.mode === "purge" || !item.targetPath
              return <TableRow key={`${item.sourcePath}:${item.targetPath}`}><TableCell className="max-w-0 truncate font-mono text-xs">{item.sourcePath}</TableCell><TableCell className="text-center">{purge ? <Trash2 className="mx-auto text-destructive" /> : <ArrowRight className="mx-auto text-muted-foreground" />}</TableCell><TableCell className={cn("max-w-0 truncate font-mono text-xs", purge ? "text-muted-foreground" : "text-primary")}>{purge ? "— 清理 —" : item.targetPath}</TableCell></TableRow>
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </Card>
  )
}

function HeaderLine({ status, subtitle }: { status: RepackuStatusMeta; subtitle: string }) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <Package />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Repacku</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function HeaderStats({ result }: { result: RepackuData | null }) {
  const items = [
    ["文件夹", result?.totalFolders ?? 0],
    ["操作", result?.totalOperations ?? 0],
    ["失败", result?.failedCount ?? 0],
  ] as const
  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @4xl/repacku:min-w-56">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/30 px-2 py-1 text-center">
          <div className="truncate text-[10px] text-muted-foreground">{label}</div>
          <div className="text-xs font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  )
}

function PreviewPanel({ emptyText, lines, onCopy }: { emptyText: string; lines: string[]; onCopy?: () => void }) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">{lines.length ? `${lines.length} 项` : "预览"}</div>
        {onCopy && (
          <Button disabled={!lines.length} size="xs" variant="ghost" onClick={onCopy}>
            <Copy data-icon="inline-start" />
            复制
          </Button>
        )}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {lines.length ? (
          <pre className="p-3 text-xs leading-5 text-muted-foreground">
            {lines.join("\n")}
          </pre>
        ) : (
          <div className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </ScrollArea>
    </section>
  )
}

function statusFromState(data: RepackuCardState, running: boolean): RepackuStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: "Repacku 正在处理当前任务。",
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "completed") {
    return {
      label: "完成",
      description: "上次任务已完成。",
      tone: "success",
      badgeVariant: "default",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error") {
    return {
      label: "失败",
      description: "上次任务失败，请查看日志。",
      tone: "error",
      badgeVariant: "destructive",
      iconClass: "bg-destructive text-destructive-foreground",
    }
  }
  return {
    label: "就绪",
    description: "选择路径后即可运行任务。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function buildInput(action: RepackuAction, data: RepackuCardState): RepackuInput {
  return {
    action,
    path: data.path,
    configPath: data.configPath,
    types: data.typesText,
    minCount: data.minCount ?? 2,
    deleteAfter: data.deleteAfter ?? false,
    dryRun: data.dryRun ?? true,
  }
}

/** 从历史记录的 input 反序列化为 RepackuCardState 片段。兼容 camelCase / snake_case。 */
function restoreFromHistoryInput(input: unknown): Partial<RepackuCardState> {
  if (!input || typeof input !== "object") return {}
  const record = input as Record<string, unknown>
  const types = record.types ?? record.targetFileTypes ?? record.target_file_types
  const typesText = Array.isArray(types)
    ? types.filter((v): v is string => typeof v === "string").join(", ")
    : typeof types === "string" ? types : undefined
  return {
    action: typeof record.action === "string" ? (record.action as RepackuAction) : undefined,
    path: typeof record.path === "string" ? record.path : undefined,
    configPath: typeof record.configPath === "string"
      ? record.configPath
      : typeof record.config_path === "string" ? record.config_path : undefined,
    typesText,
    minCount: typeof record.minCount === "number"
      ? record.minCount
      : typeof record.min_count === "number" ? record.min_count : undefined,
    deleteAfter: typeof record.deleteAfter === "boolean"
      ? record.deleteAfter
      : typeof record.delete_after === "boolean" ? record.delete_after : undefined,
    dryRun: typeof record.dryRun === "boolean"
      ? record.dryRun
      : typeof record.dry_run === "boolean" ? record.dry_run : undefined,
  }
}

function summarize(data: RepackuCardState, result: RepackuData | null): string {
  if (data.progressText) return data.progressText
  if (result?.totalOperations) return `${result.totalOperations} 个操作，${result.failedCount} 个失败`
  if (data.path) return compactPath(data.path)
  return "选择文件夹"
}

function compactOptionSummary(data: RepackuCardState): string {
  const writeMode = data.dryRun ?? true ? "预演" : "写入"
  const sourceMode = data.deleteAfter ? "成功后删源" : "保留源文件"
  const types = parseTypes(data.typesText)
  const typeText = types.length ? types.join(", ") : "全部文件"
  return `${writeMode} · ${sourceMode} · ${typeText} · 至少 ${data.minCount ?? 2}`
}

function compactPath(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/").filter(Boolean)
  return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : value
}

function parseTypes(value = ""): string[] {
  return value.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean)
}
