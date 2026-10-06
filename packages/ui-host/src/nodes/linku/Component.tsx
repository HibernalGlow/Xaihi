import { useEffect, useRef, useState } from "react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import type { NodeComponentProps, NodeRunResult } from "@xiranite/contract"
import type { LinkuAction, LinkuData, LinkuInput } from "@xiranite/node-linku/core"
import { Copy, Link2, RotateCcw, Square } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { NodeHeroGlow } from "@/components/ui/node-hero-glow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { RunningTint } from "@/nodes/shared/controls"
import {
  ActionBar,
  ActionIconButton,
  AdvancedOptionsPopover,
  LinkuIcon,
  PathField,
  StatusStrip,
} from "./controls"
import { ACTIONS } from "./constants"
import { LinkuDisplayTabs, StatsPanel } from "./ResultPanels"
import type { LinkuCardState, LinkuPhase, LinkuStatusMeta } from "./types"
import { CONFIG_FIELDS } from "./types"

export function Component({ compId, host }: NodeComponentProps) {
  "use no memo"
  const surface = useNodeSurface()
  const { t } = useNodeI18n("linku")
  const data = host.getData<LinkuCardState>(compId) ?? {}
  const dataRef = useRef<LinkuCardState>(data)
  dataRef.current = data

  const [running, setRunning] = useState(false)
  const [defaults, setDefaults] = useState<Partial<LinkuCardState> | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [configDirty, setConfigDirty] = useState(false)

  const logs = data.logs ?? []
  const result = data.result ?? null
  const links = result?.links ?? []
  const phase = phaseFromState(data, running)
  const progress = data.progress ?? 0
  const status = statusFromState(data, running, links.length)
  const action = data.action
  const compactSurface = surface.mode === "compact" || surface.mode === "portrait"
  const forceCollapsedSurface = compactSurface && surface.height > 0 && surface.height < 160
  const portraitCompact = surface.mode === "portrait" || (surface.mode === "compact" && surface.width < 560 && surface.height >= 300)

  useEffect(() => {
    host.getNodeConfig?.<Partial<LinkuCardState>>()
      .then((response) => {
        setDefaults(response.config)
        setConfigFilePath(response.path)
      })
      .catch(() => undefined)
  }, [host])

  async function reloadDefaults() {
    const response = await host.getNodeConfig?.<Partial<LinkuCardState>>()
    if (!response) return
    setDefaults(response.config)
    setConfigFilePath(response.path)
    setConfigDirty(false)
  }

  useEffect(() => {
    if (!defaults) return
    setConfigDirty(CONFIG_FIELDS.some((field) => String(data[field] ?? "") !== String(defaults[field] ?? "")))
  }, [data.path, data.target, data.configPath, defaults])

  function patch(patchData: Partial<LinkuCardState>) {
    dataRef.current = { ...dataRef.current, ...patchData }
    host.patchData(compId, patchData)
  }

  function pushLog(message: string) {
    const nextLogs = [...(dataRef.current.logs ?? []), message].slice(-120)
    patch({ logs: nextLogs })
  }

  async function paste(field: "path" | "target" | "configPath") {
    const text = await host.clipboard?.readText?.()
    if (text) patch({ [field]: text.trim() })
  }

  /**
   * 动作入口。危险确认已由 `ActionBar` 里的 ExecuteButton 引信承担（Hazard 上膛
   * 时直接放行），这里只剩「一次只跑一个」的守卫，不再自带第二道弹窗。
   */
  function runAction(nextAction: LinkuAction) {
    if (running) return
    void execute(nextAction)
  }

  async function execute(nextAction: LinkuAction, override: Partial<LinkuCardState> = {}) {
    const current = { ...dataRef.current, ...override }
    const input = buildInput(nextAction, current)

    if ((nextAction === "info" || nextAction === "create" || nextAction === "move_link" || nextAction === "restore") && !input.path) {
      patch({
        phase: "error",
        progress: 0,
        progressText: nextAction === "restore" ? "请先输入已记录的原链接路径。" : "请先输入源路径。",
      })
      return
    }
    if ((nextAction === "create" || nextAction === "move_link") && !input.target) {
      patch({ phase: "error", progress: 0, progressText: "请先输入目标路径。" })
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
      patch({ phase: "running", action: nextAction, progress: 0, progressText: `${actionLabel(nextAction)}开始`, ...override })
      const response = await run<LinkuInput, LinkuData>("linku", input, (event) => {
        if (event.type === "progress") {
          patch({ progress: event.progress ?? 0, progressText: event.message })
          pushLog(`[${event.progress ?? 0}%] ${event.message}`)
        } else {
          pushLog(event.message)
        }
      }) as NodeRunResult<LinkuData>

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
    const config: Partial<LinkuCardState> = {}
    for (const field of CONFIG_FIELDS) {
      const value = dataRef.current[field]
      if (value !== undefined) (config as Record<string, unknown>)[field] = value
    }
    await host.saveNodeConfig?.(config)
    setDefaults(config)
    setConfigDirty(false)
  }

  function restoreDefault() {
    if (defaults) patch(defaults)
  }

  function resetOverride() {
    patch({ path: undefined, target: undefined, configPath: undefined })
  }

  async function copyLogs() {
    await host.clipboard?.writeText?.(logs.join("\n"))
  }

  async function copyResults() {
    await host.clipboard?.writeText?.(resultLines(result).join("\n"))
  }

  const commonProps = createViewProps({
    action,
    configDirty,
    configFilePath,
    data,
    defaults,
    host,
    links,
    logs,
    onCopyLogs: copyLogs,
    onCopyResults: copyResults,
    onExecute: execute,
    onPatch: patch,
    onPastePath: () => paste("path"),
    onPasteTarget: () => paste("target"),
    onReset: reset,
    onReloadDefaults: reloadDefaults,
    onResetOverride: resetOverride,
    onRestoreDefault: restoreDefault,
    onRunAction: runAction,
    onSaveDefault: saveAsDefault,
    phase,
    progress,
    result,
    running,
    status,
    t,
  })

  return (
    <TooltipProvider>
      <div ref={surface.ref} className="@container/linku relative flex h-full min-h-0 w-full overflow-hidden">
        <NodeHeroGlow accent="chart-2" />
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
  action?: LinkuAction
  configDirty: boolean
  configFilePath?: string
  data: LinkuCardState
  defaults?: Partial<LinkuCardState>
  host: NodeComponentProps["host"]
  links: LinkuData["links"]
  logs: string[]
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: LinkuAction, override?: Partial<LinkuCardState>) => void
  onPatch: (patch: Partial<LinkuCardState>) => void
  onPastePath: () => void
  onPasteTarget: () => void
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onResetOverride: () => void
  onRestoreDefault: () => void
  onRunAction: (action: LinkuAction) => void
  onSaveDefault: () => void
  phase: LinkuPhase
  progress: number
  result: LinkuData | null
  running: boolean
  status: LinkuStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
}) {
  return props
}

function CollapsedView(props: ViewProps) {
  const createMeta = ACTIONS.find((item) => item.value === "create")
  return (
    <div data-testid="linku-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <Link2 />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Linku</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      {props.running ? (
        <Button aria-label="linku running" disabled size="icon-sm" variant="secondary">
          <Square />
        </Button>
      ) : (
        <ExecuteButton
          compact
          dangerous={Boolean(createMeta?.destructive)}
          idleIcon={<Link2 />}
          label={createMeta?.label ?? "创建链接"}
          onExecute={() => props.onExecute("create")}
        />
      )}
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

function CompactView(props: ViewProps) {
  return (
    <div data-testid="linku-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover configPath={props.data.configPath ?? ""} disabled={props.running} onPatch={props.onPatch} />
          {props.running ? (
            <Button aria-label="linku running" disabled size="icon-sm" variant="secondary">
              <Square />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <div className="grid gap-2">
          <PathField
            compact
            disabled={props.running}
            id="linku-path-compact"
            label="源路径"
            placeholder="D:/actual"
            value={props.data.path ?? ""}
            onChange={(path) => props.onPatch({ path })}
            onClear={() => props.onPatch({ path: "" })}
            onPaste={props.onPastePath}
          />
          <PathField
            compact
            disabled={props.running}
            id="linku-target-compact"
            label="目标/链接"
            placeholder="D:/link"
            value={props.data.target ?? ""}
            onChange={(target) => props.onPatch({ target })}
            onClear={() => props.onPatch({ target: "" })}
            onPaste={props.onPasteTarget}
          />
        </div>
        <ActionBar disabled={props.running} onRun={props.onRunAction} />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <LinkuDisplayTabs
            compact
            logs={props.logs}
            phase={props.phase}
            result={props.result}
            running={props.running}
            onCopyLogs={props.onCopyLogs}
            onCopyResults={props.onCopyResults}
          />
        </div>
      </div>
    </div>
  )
}

function PortraitCompactView(props: ViewProps) {
  return (
    <div data-testid="linku-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover configPath={props.data.configPath ?? ""} disabled={props.running} onPatch={props.onPatch} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <PathField
          compact
          disabled={props.running}
          id="linku-path-portrait"
          label="源路径"
          placeholder="D:/actual"
          value={props.data.path ?? ""}
          onChange={(path) => props.onPatch({ path })}
          onClear={() => props.onPatch({ path: "" })}
          onPaste={props.onPastePath}
        />
        <PathField
          compact
          disabled={props.running}
          id="linku-target-portrait"
          label="目标/链接"
          placeholder="D:/link"
          value={props.data.target ?? ""}
          onChange={(target) => props.onPatch({ target })}
          onClear={() => props.onPatch({ target: "" })}
          onPaste={props.onPasteTarget}
        />
        <ActionBar disabled={props.running} onRun={props.onRunAction} />
      </div>
      <div className="min-h-0 flex-1">
        <LinkuDisplayTabs
          compact
          logs={props.logs}
          phase={props.phase}
          result={props.result}
          running={props.running}
          onCopyLogs={props.onCopyLogs}
          onCopyResults={props.onCopyResults}
        />
      </div>
    </div>
  )
}

function FullView(props: ViewProps) {
  if ((props.data.action as string | undefined) === "legacy") return <LegacyFullView {...props} />
  return <LinkuReferenceWorkspace {...props} />
}

function LegacyFullView(props: ViewProps) {
  return (
    <div data-testid="linku-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/linku:flex-row @4xl/linku:items-center @4xl/linku:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/linku:flex-row @4xl/linku:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
          <div data-testid="linku-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ActionBar disabled={props.running} onRun={props.onRunAction} />
            <ActionIconButton disabled={!props.logs.length} icon={Copy} label="复制日志" onClick={props.onCopyLogs} />
            <ActionIconButton disabled={props.running} icon={RotateCcw} label="清空状态" onClick={props.onReset} />
            <NodeConfigPopover
              configPath={props.configFilePath}
              defaults={props.defaults}
              dirty={props.configDirty}
              disabled={props.running}
              t={props.t}
              onOpenFile={props.host.openConfigFile}
              onReload={props.onReloadDefaults}
              onRestore={props.onRestoreDefault}
              onSave={props.onSaveDefault}
            />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @5xl/linku:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <section className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
          <div className="grid gap-3 border-b pb-3">
            <div>
              <div className="text-sm font-semibold">输入路径</div>
              <div className="text-xs text-muted-foreground">源是实际文件/目录，目标是符号链接位置。</div>
            </div>
            <PathField
              disabled={props.running}
              id="linku-path-full"
              label="源路径"
              placeholder="D:/actual"
              value={props.data.path ?? ""}
              onChange={(path) => props.onPatch({ path })}
              onClear={() => props.onPatch({ path: "" })}
              onPaste={props.onPastePath}
            />
            <PathField
              disabled={props.running}
              id="linku-target-full"
              label="目标/链接"
              placeholder="D:/link"
              value={props.data.target ?? ""}
              onChange={(target) => props.onPatch({ target })}
              onClear={() => props.onPatch({ target: "" })}
              onPaste={props.onPasteTarget}
            />
          </div>
          <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
        </section>

        <div className="h-[clamp(12rem,32vh,20rem)] min-h-0 overflow-hidden @5xl/linku:h-full">
          <LinkuDisplayTabs
            logs={props.logs}
            phase={props.phase}
            result={props.result}
            running={props.running}
            onCopyLogs={props.onCopyLogs}
            onCopyResults={props.onCopyResults}
          />
        </div>
      </div>
    </div>
  )
}

function LinkuReferenceWorkspace(props: ViewProps) {
  return (
    <div data-testid="linku-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3 @4xl/linku:p-4">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || props.t("workbench.subtitle", "符号链接关系管理与实时拓扑预览")} />
        <div data-testid="linku-header-toolbar" className="flex items-center gap-1">
          <ActionIconButton disabled={!props.result} icon={Copy} label={props.t("buttons.copyResults", "复制拓扑")} onClick={props.onCopyResults} />
          <ActionIconButton disabled={!props.logs.length} icon={Copy} label={props.t("buttons.copyLogs", "复制日志")} onClick={props.onCopyLogs} />
          <ActionIconButton disabled={props.running} icon={RotateCcw} label={props.t("buttons.reset", "清空状态")} onClick={props.onReset} />
          <NodeConfigPopover configPath={props.configFilePath} defaults={props.defaults} dirty={props.configDirty} disabled={props.running} t={props.t} onOpenFile={props.host.openConfigFile} onReload={props.onReloadDefaults} onRestore={props.onRestoreDefault} onSave={props.onSaveDefault} />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @4xl/linku:grid-cols-[minmax(14rem,.78fr)_minmax(0,1.45fr)_minmax(14rem,.8fr)]">
        <Card className="min-h-0 gap-4 py-4">
          <CardHeader className="px-4"><CardTitle className="text-base">{props.t("workbench.initialize", "初始化链接")}</CardTitle><CardDescription>{props.t("workbench.initializeDesc", "源路径指向实际对象，目标路径为链接位置")}</CardDescription></CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4">
            <PathField disabled={props.running} id="linku-path-reference" label={props.t("fields.source", "源路径")} placeholder="D:/actual" value={props.data.path ?? ""} onChange={(path) => props.onPatch({ path })} onClear={() => props.onPatch({ path: "" })} onPaste={props.onPastePath} />
            <div className="flex justify-center"><Link2 className="size-4 text-primary" /></div>
            <PathField disabled={props.running} id="linku-target-reference" label="目标/链接" placeholder="D:/link" value={props.data.target ?? ""} onChange={(target) => props.onPatch({ target })} onClear={() => props.onPatch({ target: "" })} onPaste={props.onPasteTarget} />
            <ActionBar activeAction={props.action} disabled={props.running} onRun={props.onRunAction} />
            <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
          </CardContent>
        </Card>
        <div className="flex min-h-0 flex-col gap-3">
          <Card className="min-h-40 shrink-0 gap-3 py-4 @4xl/linku:min-h-48">
            <CardHeader className="px-4"><CardTitle className="text-base">{props.t("workbench.topology", "拓扑地图")}</CardTitle><CardDescription>{props.t("workbench.topologyDesc", "由当前关联记录生成")}</CardDescription></CardHeader>
            <CardContent className="min-h-0 flex-1 px-4"><LinkTopology links={props.links} /></CardContent>
          </Card>
          <div className="min-h-0 flex-1"><LinkuDisplayTabs logs={props.logs} phase={props.phase} result={props.result} running={props.running} onCopyLogs={props.onCopyLogs} onCopyResults={props.onCopyResults} /></div>
        </div>
        <Card className="min-h-0 gap-4 py-4">
          <CardHeader className="px-4"><CardTitle className="text-base">{props.t("workbench.recovery", "恢复队列")}</CardTitle><CardDescription>{props.result?.failedCount ? props.t("workbench.recoveryPending", "{{count}} 个链接需要处理", { count: props.result.failedCount }) : props.t("workbench.recoveryClear", "没有待恢复的失败记录")}</CardDescription></CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4">
            <LinkuExecutionStats progress={props.progress} result={props.result} t={props.t} />
            <div className="rounded-md border bg-muted/15 p-3 text-xs text-muted-foreground"><div className="font-medium text-foreground">{props.t("workbench.activePath", "当前源路径")}</div><p className="mt-1 break-all font-mono">{props.data.path || props.t("workbench.activePathEmpty", "尚未选择路径")}</p><p className="mt-3">{props.result?.failedCount ? props.t("workbench.recoveryHint", "请通过恢复操作重新检查失败链接。") : props.t("workbench.recoveryClearHint", "链接状态正常时不会显示虚构的恢复项。")}</p></div>
          </CardContent>
          <CardFooter className="flex-col gap-2 px-4"><Progress value={props.progress} className="h-1 bg-muted" label={props.t("workbench.progress", "拓扑进度")} /><Button className="w-full" disabled={!props.result} variant="outline" onClick={props.onCopyResults}><Copy data-icon="inline-start" />{props.t("buttons.copyResults", "复制拓扑")}</Button></CardFooter>
        </Card>
      </div>
    </div>
  )
}

function LinkTopology({ links }: { links: LinkuData["links"] }) {
  if (!links.length) return <div className="grid h-full min-h-24 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">暂无关联记录</div>
  const visible = links.slice(0, 5)
  return <div className="relative h-full min-h-24 overflow-hidden rounded-md border bg-muted/15"><svg aria-label="Link topology map" className="absolute inset-0 size-full" preserveAspectRatio="none" viewBox="0 0 100 100">{visible.map((record, index) => { const y = 15 + index * (70 / Math.max(visible.length - 1, 1)); return <g key={`${record.link}:${record.target}`}><path d={`M 14 ${y} C 38 ${Math.max(10, y - 16)} 62 ${Math.min(90, y + 16)} 86 ${y}`} fill="none" stroke="currentColor" className="text-primary/70" strokeDasharray="3 3" /><circle cx="14" cy={y} r="3" className="fill-background stroke-muted-foreground" strokeWidth="1" /><circle cx="86" cy={y} r="3" className="fill-background stroke-primary" strokeWidth="1" /></g>})}</svg><div className="relative grid h-full grid-cols-2 content-around gap-2 p-3 text-[10px] font-mono"><div className="flex flex-col justify-around gap-2">{visible.map((record) => <span key={record.link} className="truncate rounded bg-background/80 px-1.5 py-1">{record.link}</span>)}</div><div className="flex flex-col justify-around gap-2 text-right">{visible.map((record) => <span key={record.target} className="truncate rounded bg-background/80 px-1.5 py-1 text-primary">{record.target}</span>)}</div></div></div>
}

function LinkuExecutionStats({ progress, result, t }: { progress: number; result: LinkuData | null; t: ViewProps["t"] }) {
  const rows = [[t("stats.links", "关联"), result?.links.length ?? 0], [t("stats.created", "已创建"), result?.created ? 1 : 0], [t("stats.recovered", "已恢复"), result?.recoveredCount ?? 0], [t("stats.restored", "已还原"), result?.restoredCount ?? 0], [t("stats.failed", "失败"), result?.failedCount ?? 0], [t("stats.progress", "进度"), `${progress}%`]] as const
  return <div className="grid gap-1">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-border/70 py-1.5 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-mono font-semibold tabular-nums">{value}</span></div>)}</div>
}

function HeaderLine({ status, subtitle }: {
  status: LinkuStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <Link2 />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Linku</h3>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
    </FloatingWindowNodeHeader>
  )
}

function buildInput(action: LinkuAction, data: LinkuCardState): LinkuInput {
  return {
    action,
    path: data.path,
    target: data.target,
    configPath: data.configPath,
  }
}

function statusFromState(data: LinkuCardState, running: boolean, linkCount: number): LinkuStatusMeta {
  if (running || data.phase === "running") {
    return {
      label: "运行中",
      description: data.progressText || "Linku 正在处理当前任务。",
      tone: "running",
      badgeVariant: "secondary",
      iconClass: "bg-primary text-primary-foreground",
    }
  }
  if (data.phase === "error" || (data.result?.failedCount ?? 0) > 0) {
    return {
      label: "失败",
      description: data.progressText || `上次任务失败，失败 ${data.result?.failedCount ?? 0} 项。`,
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
  if (linkCount) {
    return {
      label: "有记录",
      description: `已记录 ${linkCount} 个符号链接。`,
      tone: "idle",
      badgeVariant: "outline",
      iconClass: "bg-secondary text-secondary-foreground",
    }
  }
  return {
    label: "就绪",
    description: "粘贴源路径，创建或恢复符号链接。",
    tone: "idle",
    badgeVariant: "outline",
    iconClass: "bg-secondary text-secondary-foreground",
  }
}

function phaseFromState(data: LinkuCardState, running: boolean): LinkuPhase {
  if (running) return data.phase ?? "running"
  return data.phase ?? "idle"
}

function actionLabel(action: LinkuAction): string {
  const meta = ACTIONS.find((item) => item.value === action)
  return meta?.label ?? "操作"
}

function summaryText(props: ViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.failedCount) return `${props.result.failedCount} 项失败`
  if (props.links.length) return `${props.links.length} 条链接记录`
  if (props.data.path) return `源：${basename(props.data.path)}`
  return "粘贴源路径后创建或恢复链接"
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).at(-1) ?? value
}

function resultLines(result: LinkuData | null): string[] {
  if (!result) return []
  const lines: string[] = []
  if (result.pathInfo) {
    lines.push(`path ${result.pathInfo.path}`)
    lines.push(`exists ${result.pathInfo.exists} / kind ${result.pathInfo.kind} / symlink ${result.pathInfo.isSymlink}`)
    if (result.pathInfo.linkTarget) lines.push(`target ${result.pathInfo.linkTarget}`)
  }
  for (const record of result.links) {
    lines.push(`link ${record.link} -> ${record.target}`)
  }
  if (result.created) lines.push("created yes")
  if (result.recoveredCount) lines.push(`recovered ${result.recoveredCount}`)
  if (result.restoredCount) lines.push(`restored ${result.restoredCount}`)
  if (result.failedCount) lines.push(`failed ${result.failedCount}`)
  return lines
}

export { LinkuIcon }
