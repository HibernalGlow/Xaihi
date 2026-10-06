// Normal-mode surface views extracted from Component.tsx so the card entry
// stays a thin orchestrator. These views are presentation-only: all state and
// side effects arrive through the explicit MarkuViewProps contract.
import { Copy, FileCode, History, Play, RotateCcw, ShieldAlert, Undo2, Workflow } from "lucide-react"
import type { MarkuAction, MarkuData } from "@xiranite/node-marku/core"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { RunningTint } from "@/nodes/shared/controls"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import type { MarkuModuleMeta } from "./constants"
import {
  ActionIconButton,
  AdvancedOptionsPopover,
  ConfigField,
  ModulePicker,
  PathInput,
  PrimarySwitches,
  ResultTabs,
  StatusStrip,
  TextInput,
} from "./controls"
import type { MarkuCardState, MarkuStatusMeta } from "./types"

export interface MarkuViewProps {
  configDirty: boolean
  configFilePath?: string
  data: MarkuCardState
  defaults?: Partial<MarkuCardState>
  dryRun: boolean
  hasText: boolean
  logs: string[]
  moduleMeta: MarkuModuleMeta
  pathCount: number
  progress: number
  result: MarkuData | null
  running: boolean
  status: MarkuStatusMeta
  onCopyLogs: () => void
  onCopyOutput: () => void
  onEnterWorkflow: () => void
  onExecute: (action: MarkuAction) => void
  onModuleChange: (value: string) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePath: () => void
  onPasteText: () => void
  onPatch: (patch: Partial<MarkuCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function CollapsedView(props: MarkuViewProps) {
  return (
    <div data-testid="marku-collapsed-view" className="relative flex h-full min-h-0 items-center gap-2 overflow-hidden rounded-xl border bg-background/85 px-3 py-2 shadow-sm">
      <RunningTint tone={props.status.tone} />
      <div className={cn("relative grid size-8 shrink-0 place-items-center rounded-lg", props.status.iconClass)}>
        <FileCode />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs font-semibold leading-none">
          <span>Marku</span>
          <Badge variant={props.status.badgeVariant}>{props.status.label}</Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{summaryText(props)}</div>
      </div>
      <PrimaryActionButton compact props={props} />
      {props.status.tone === "running" && <div className="relative text-xs tabular-nums text-muted-foreground">{props.progress}%</div>}
    </div>
  )
}

export function CompactView(props: MarkuViewProps) {
  return (
    <div data-testid="marku-compact-view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 p-3 pb-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
        <ModulePicker compact disabled={props.running} module={props.moduleMeta.id} onModuleChange={props.onModuleChange} />
        {props.hasText ? (
          <TextInput compact disabled={props.running} value={props.data.inputText ?? ""} onChange={(inputText) => props.onPatch({ inputText })} onClear={() => props.onPatch({ inputText: "" })} onPaste={props.onPasteText} />
        ) : (
          <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        )}
        <PrimarySwitches compact data={props.data} disabled={props.running} hasText={props.hasText} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
        {(props.status.tone === "running" || props.status.tone === "error") && (
          <StatusStrip compact progress={props.progress} status={props.status} text={props.data.progressText} />
        )}
        <div className="min-h-0 flex-1">
          <ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyOutput={props.onCopyOutput} />
        </div>
      </div>
    </div>
  )
}

export function PortraitCompactView(props: MarkuViewProps) {
  return (
    <div data-testid="marku-portrait-view" className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <HeaderLine status={props.status} subtitle={props.data.progressText || summaryText(props)} />
        <div className="flex shrink-0 items-center gap-1">
          <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
          <PrimaryActionButton compact props={props} />
        </div>
      </div>
      <div className="grid shrink-0 gap-2">
        <ModulePicker compact disabled={props.running} module={props.moduleMeta.id} onModuleChange={props.onModuleChange} />
        {props.hasText ? (
          <TextInput compact disabled={props.running} value={props.data.inputText ?? ""} onChange={(inputText) => props.onPatch({ inputText })} onClear={() => props.onPatch({ inputText: "" })} onPaste={props.onPasteText} />
        ) : (
          <PathInput compact disabled={props.running} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
        )}
        <PrimarySwitches compact data={props.data} disabled={props.running} hasText={props.hasText} onPatch={props.onPatch} />
        <ToolbarActions {...props} compact />
      </div>
      <div className="min-h-0 flex-1">
        <ResultTabs compact logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyOutput={props.onCopyOutput} />
      </div>
    </div>
  )
}

export function FullView(props: MarkuViewProps) {
  return (
    <div data-testid="marku-full-view" className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="flex shrink-0 flex-col gap-3 @4xl/marku:flex-row @4xl/marku:items-center @4xl/marku:justify-between">
        <div className="flex min-w-0 flex-col gap-2 @4xl/marku:flex-row @4xl/marku:items-center">
          <HeaderLine status={props.status} subtitle={props.data.progressText || `${props.moduleMeta.label} / ${props.hasText ? "文本模式" : "路径模式"} / ${props.dryRun ? "预演" : "真实执行"}`} />
          <div data-testid="marku-header-toolbar" className="flex min-w-0 flex-wrap items-center gap-2">
            <ToolbarActions {...props} />
          </div>
        </div>
        <StatsPanel progress={props.progress} result={props.result} />
      </div>

      <section className="shrink-0 border-y py-2">
        <div className="mb-2 text-xs font-medium text-muted-foreground">活动转换模块</div>
        <ModulePicker disabled={props.running} module={props.moduleMeta.id} onModuleChange={props.onModuleChange} />
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 @3xl/marku:grid-cols-2">
        <section className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
          <div className="grid gap-3 border-b pb-3">
            <div>
              <div className="text-sm font-semibold">模块</div>
              <div className="text-xs text-muted-foreground">选择 Markdown 处理模块，部分模块支持配置 JSON。</div>
            </div>
            <ConfigField disabled={props.running} value={props.data.configText ?? ""} onChange={(configText) => props.onPatch({ configText })} />
          </div>
          <div className="grid gap-3 border-b pb-3">
            <div>
              <div className="text-sm font-semibold">输入</div>
              <div className="text-xs text-muted-foreground">粘贴文本后将进入文本模式；留空文本则按路径扫描 Markdown 文件。</div>
            </div>
            <TextInput disabled={props.running} value={props.data.inputText ?? ""} onChange={(inputText) => props.onPatch({ inputText })} onClear={() => props.onPatch({ inputText: "" })} onPaste={props.onPasteText} />
            <PathInput disabled={props.running || props.hasText} pathCount={props.pathCount} value={props.data.pathText ?? ""} onChange={(pathText) => props.onPatch({ pathText })} onClear={() => props.onPatch({ pathText: "" })} onPaste={props.onPastePath} />
          </div>
          <div className="grid gap-3 border-b pb-3">
            <div className="text-sm font-semibold">关键开关</div>
            <PrimarySwitches data={props.data} disabled={props.running} hasText={props.hasText} onPatch={props.onPatch} />
          </div>
          <StatusStrip progress={props.progress} status={props.status} text={props.data.progressText} />
        </section>

        <div className="h-[clamp(12rem,32vh,20rem)] min-h-0 overflow-hidden @3xl/marku:h-full">
          <ResultTabs logs={props.logs} result={props.result} onCopyLogs={props.onCopyLogs} onCopyOutput={props.onCopyOutput} />
        </div>
      </div>
    </div>
  )
}

function ToolbarActions(props: MarkuViewProps & { compact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", props.compact && "justify-between")}>
      {!props.compact && <PrimaryActionButton props={props} />}
      <ActionIconButton disabled={props.running} icon={Workflow} label="工作流模式" onClick={props.onEnterWorkflow} />
      <ActionIconButton disabled={props.running} icon={History} label="读取历史" onClick={() => props.onExecute("history")} />
      <ActionIconButton disabled={props.running} icon={Undo2} label="撤销最近" onClick={() => props.onExecute("undo")} />
      <ActionIconButton disabled={!props.result?.outputText && !props.result?.diffText && !props.result?.diffs.length} icon={Copy} label="复制输出" onClick={props.onCopyOutput} />
      <ActionIconButton disabled={!props.logs.length} icon={RotateCcw} label="清空状态" onClick={props.onReset} />
      {!props.compact && (
        <NodeConfigButton nodeKey="marku"
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

function PrimaryActionButton({ compact, props }: { compact?: boolean; props: MarkuViewProps }) {
  const disabled = props.hasText ? !props.data.inputText?.trim() : !props.pathCount
  const dangerous = !props.dryRun && !props.hasText
  const label = props.dryRun ? "预演处理" : "真实写回"
  const action: MarkuAction = props.hasText ? "text" : "run"

  return (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={dangerous ? <ShieldAlert /> : <Play />}
      onExecute={() => props.onExecute(action)}
    />
  )
}

export function HeaderLine({ status, subtitle }: {
  status: MarkuStatusMeta
  subtitle: string
}) {
  return (
    <FloatingWindowNodeHeader>
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", status.iconClass)}>
          <FileCode />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-none">Marku</h3>
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
  result: MarkuData | null
}) {
  const stats = [
    ["已处理", props.result?.filesProcessed ?? 0],
    ["已变更", props.result?.filesChanged ?? 0],
    ["差异", props.result?.diffs.filter((item) => item.changed).length ?? 0],
    ["历史", props.result?.history.length ?? 0],
    ["错误", props.result?.errors.length ?? 0],
    ["进度", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/marku:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "错误" && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function summaryText(props: MarkuViewProps): string {
  if (props.data.progressText) return props.data.progressText
  if (props.result?.filesChanged) return `${props.result.filesChanged} 个文件已变更`
  if (props.result?.filesProcessed) return `${props.result.filesProcessed} 个文件已处理`
  if (props.hasText) return `${props.data.inputText?.length ?? 0} 字文本 / ${props.moduleMeta.shortLabel}`
  if (props.pathCount) return `${props.pathCount} 条路径 / ${props.moduleMeta.shortLabel}`
  return "粘贴 Markdown 或路径后运行模块"
}
