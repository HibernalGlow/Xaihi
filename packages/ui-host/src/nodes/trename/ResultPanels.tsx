import { useEffect, useMemo, useState } from "react"
import type { TrenameConflict, TrenameData, TrenameOperation, TrenameUndoBatch } from "@xiranite/node-trename/core"
import { AlertTriangle, Archive, CheckCircle2, Copy, FilePenLine, History, ListChecks, RotateCcw } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { FileTreePanel } from "./FileTreePanel"
import { buildTreeModel } from "./treeModel"
import type { TrenameDisplayTab, TrenamePhase } from "./types"

export function TrenameDisplayTabs(props: {
  compact?: boolean
  jsonText: string
  logs: string[]
  phase: TrenamePhase
  result: TrenameData | null
  running?: boolean
  onCopyLogs: () => void
  onCopyResults: () => void
  onUndoBatch: (batchId: string) => void
}) {
  const model = useMemo(() => buildTreeModel(props.jsonText), [props.jsonText])
  const preferredTab = preferredDisplayTab({
    conflictCount: props.result?.conflicts.length ?? 0,
    historyCount: props.result?.history.length ?? 0,
    logCount: props.logs.length,
    operationCount: props.result?.operations.length ?? 0,
    phase: props.phase,
    running: props.running ?? false,
    treeCount: model.total,
  })
  const [tab, setTab] = useState<TrenameDisplayTab>(preferredTab)

  useEffect(() => {
    setTab(preferredTab)
  }, [preferredTab])

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as TrenameDisplayTab)} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className={cn("shrink-0", props.compact && "grid w-full grid-cols-5")}>
        <DisplayTabTrigger compact={props.compact} count={model.total} label="文件" value="tree" />
        <DisplayTabTrigger compact={props.compact} count={props.result?.operations.length ?? 0} label="计划" value="plan" />
        <DisplayTabTrigger compact={props.compact} count={props.result?.conflicts.length ?? 0} label="冲突" tone={(props.result?.conflicts.length ?? 0) ? "destructive" : "outline"} value="conflicts" />
        <DisplayTabTrigger compact={props.compact} count={props.result?.history.length ?? 0} label="历史" value="history" />
        <DisplayTabTrigger compact={props.compact} count={props.logs.length} label="日志" value="logs" />
      </TabsList>
      <TabsContent value="tree" className="min-h-0 flex-1">
        <FileTreePanel compact={props.compact} jsonText={props.jsonText} />
      </TabsContent>
      <TabsContent value="plan" className="min-h-0 flex-1">
        <OperationsPanel compact={props.compact} operations={props.result?.operations ?? []} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="conflicts" className="min-h-0 flex-1">
        <ConflictsPanel compact={props.compact} conflicts={props.result?.conflicts ?? []} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="history" className="min-h-0 flex-1">
        <HistoryPanel compact={props.compact} history={props.result?.history ?? []} onUndoBatch={props.onUndoBatch} />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <LogsPanel compact={props.compact} logs={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function DisplayTabTrigger(props: {
  compact?: boolean
  count: number
  label: string
  tone?: "destructive" | "outline"
  value: TrenameDisplayTab
}) {
  return (
    <TabsTrigger className={cn(props.compact && "min-w-0 px-1 text-xs")} value={props.value}>
      <span className="truncate">{props.label}</span>
      {props.compact ? null : <Badge variant={props.tone ?? "outline"}>{props.count}</Badge>}
    </TabsTrigger>
  )
}

function OperationsPanel(props: {
  compact?: boolean
  operations: TrenameOperation[]
  onCopy: () => void
}) {
  return (
    <PanelFrame
      compact={props.compact}
      count={props.operations.length}
      icon={ListChecks}
      title="重命名计划"
      onCopy={props.onCopy}
    >
      {props.operations.length ? (
        <div className="grid gap-1 p-2">
          {props.operations.slice(0, 160).map((item, index) => (
            <PathPairRow
              key={`${item.originalPath}:${item.newPath}:${index}`}
              index={index}
              source={item.originalPath}
              target={item.newPath}
              tone="ready"
            />
          ))}
        </div>
      ) : (
        <PanelEmpty icon={FilePenLine} title="还没有计划" description="导入翻译后的 JSON 并校验后，这里会显示可执行的 src -> tgt 列表。" />
      )}
    </PanelFrame>
  )
}

function ConflictsPanel(props: {
  compact?: boolean
  conflicts: TrenameConflict[]
  onCopy: () => void
}) {
  const groups = groupConflicts(props.conflicts)
  return (
    <PanelFrame
      compact={props.compact}
      count={props.conflicts.length}
      icon={AlertTriangle}
      title="冲突"
      onCopy={props.onCopy}
    >
      {props.conflicts.length ? (
        <div className="grid gap-2 p-2">
          <div className="flex flex-wrap gap-1">
            {groups.map((group) => (
              <Badge key={group.type} variant="outline">{group.type} x {group.count}</Badge>
            ))}
          </div>
          <div className="grid gap-1">
            {props.conflicts.slice(0, 140).map((item, index) => (
              <PathPairRow
                key={`${item.type}:${item.srcPath}:${item.tgtPath}:${index}`}
                index={index}
                source={item.srcPath}
                target={item.tgtPath}
                message={item.message}
                tone="conflict"
              />
            ))}
          </div>
        </div>
      ) : (
        <PanelEmpty icon={CheckCircle2} title="没有冲突" description="校验通过后可以先 dry-run，再确认是否真实执行重命名。" />
      )}
    </PanelFrame>
  )
}

function HistoryPanel(props: {
  compact?: boolean
  history: TrenameUndoBatch[]
  onUndoBatch: (batchId: string) => void
}) {
  return (
    <PanelFrame compact={props.compact} count={props.history.length} icon={History} title="Undo 历史">
      {props.history.length ? (
        <div className="grid gap-2 p-2">
          {props.history.map((batch) => (
            <div key={batch.id} className="grid gap-2 rounded-md border bg-background/70 p-2">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-semibold">{batch.description || batch.id}</span>
                    <Badge variant={batch.undone ? "secondary" : "outline"}>{batch.undone ? "已撤销" : "可撤销"}</Badge>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{batch.timestamp} / {batch.operations.length} 项</div>
                </div>
                <UndoBatchButton batch={batch} onUndoBatch={props.onUndoBatch} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <PanelEmpty icon={History} title="暂无历史" description="真实执行完成后会记录批次，可在这里按批次撤销。" />
      )}
    </PanelFrame>
  )
}

function LogsPanel(props: {
  compact?: boolean
  logs: string[]
  onCopy: () => void
}) {
  return (
    <PanelFrame compact={props.compact} count={props.logs.length} icon={Archive} title="日志" onCopy={props.onCopy}>
      {props.logs.length ? (
        <div className={props.compact ? "grid gap-1 p-2" : "grid gap-1 p-3"}>
          {props.logs.slice(-160).map((line, index) => (
            <div key={`${line}:${index}`} className="rounded-sm bg-muted/30 px-2 py-1 font-mono text-[11px] leading-5 text-muted-foreground">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <PanelEmpty icon={Archive} title="等待运行" description="扫描、校验、dry-run 和真实执行的事件会自动出现在这里。" />
      )}
    </PanelFrame>
  )
}

function PanelFrame(props: {
  children: React.ReactNode
  compact?: boolean
  count: number
  icon: typeof ListChecks
  title: string
  onCopy?: () => void
}) {
  const Icon = props.icon
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          <span className="truncate">{props.title}</span>
          <Badge variant="outline">{props.count}</Badge>
        </div>
        {props.onCopy && (
          <Button disabled={!props.count} size="xs" variant="ghost" onClick={props.onCopy}>
            <Copy data-icon="inline-start" />
            复制
          </Button>
        )}
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.children}
      </ScrollArea>
    </section>
  )
}

function PathPairRow(props: {
  index: number
  message?: string
  source: string
  target: string
  tone: "ready" | "conflict"
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md px-2 py-1.5 hover:bg-muted/45">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("w-6 shrink-0 text-right text-[11px] tabular-nums", props.tone === "conflict" ? "text-destructive" : "text-muted-foreground")}>{props.index + 1}</span>
        <span className="truncate text-xs font-medium">{basename(props.source)}</span>
        <span className="shrink-0 text-muted-foreground">-&gt;</span>
        <span className="truncate text-xs font-medium">{basename(props.target)}</span>
      </div>
      <div className="truncate pl-8 font-mono text-[11px] text-muted-foreground">{props.source} -&gt; {props.target}</div>
      {props.message && <div className="truncate pl-8 text-[11px] text-destructive">{props.message}</div>}
    </div>
  )
}

function PanelEmpty(props: {
  description: string
  icon: typeof FilePenLine
  title: string
}) {
  const Icon = props.icon
  return (
    <Empty className="min-h-36 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-base">{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function UndoBatchButton(props: {
  batch: TrenameUndoBatch
  onUndoBatch: (batchId: string) => void
}) {
  if (props.batch.undone) {
    return (
      <Button disabled size="icon-sm" variant="outline">
        <RotateCcw />
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button aria-label={`undo batch ${props.batch.id}`} size="icon-sm" variant="outline">
          <RotateCcw />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认撤销这批重命名？</AlertDialogTitle>
          <AlertDialogDescription>
            将按历史记录反向移动 {props.batch.operations.length} 个路径。请确认当前文件没有被其他工具再次移动。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => props.onUndoBatch(props.batch.id)}>撤销</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function preferredDisplayTab(input: {
  conflictCount: number
  historyCount: number
  logCount: number
  operationCount: number
  phase: TrenamePhase
  running: boolean
  treeCount: number
}): TrenameDisplayTab {
  if (input.running || input.phase === "scanning" || input.phase === "validating" || input.phase === "renaming") return "logs"
  if (input.conflictCount) return "conflicts"
  if (input.operationCount) return "plan"
  if (input.phase === "completed" && input.historyCount) return "history"
  if (input.treeCount) return "tree"
  if (input.logCount) return "logs"
  return "tree"
}

function groupConflicts(conflicts: TrenameConflict[]): Array<{ type: string; count: number }> {
  const groups = new Map<string, number>()
  for (const conflict of conflicts) groups.set(conflict.type, (groups.get(conflict.type) ?? 0) + 1)
  return [...groups.entries()].map(([type, count]) => ({ type, count }))
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).at(-1) ?? value
}
