import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import type { LinedupFilterResult } from "@xiranite/node-linedup/core"
import type { LucideIcon } from "lucide-react"
import { CheckCircle2, ClipboardCopy, Download, ListX, ScrollText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { linedupPreviewRows } from "./model"
import type { LinedupPreviewRow } from "./model"
import type { LinedupDisplayTab, LinedupPhase } from "./types"

export function LinedupDisplayTabs(props: {
  compact?: boolean
  logs: string[]
  phase: LinedupPhase
  result: LinedupFilterResult | null
  sourceText: string
  onCopyKept: () => void
  onCopyRemoved: () => void
  onDownload: () => void
}) {
  const preferredTab = preferredDisplayTab(props.phase, props.result, props.logs.length)
  const [tab, setTab] = useState<LinedupDisplayTab>(preferredTab)

  useEffect(() => {
    setTab(preferredTab)
  }, [preferredTab])

  // 「差异预览」不是这里算出来的：保留/移除的行与条数都来自宿主 `filterLines` 的结果文档，
  // `linedupPreviewRows()` 只按源文本的行序把它们落成 +/- 两态（设计注释见 ./model.ts）。
  const diffRows = linedupPreviewRows(props.sourceText, props.result)

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as LinedupDisplayTab)} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className={cn("shrink-0", props.compact && "grid w-full grid-cols-4")}>
        <DisplayTab compact={props.compact} count={diffRows.length} label="预览" value="preview" />
        <DisplayTab compact={props.compact} count={props.result?.keptCount ?? 0} label="保留" value="kept" />
        <DisplayTab compact={props.compact} count={props.result?.removedCount ?? 0} label="移除" value="removed" />
        <DisplayTab compact={props.compact} count={props.logs.length} label="日志" value="logs" />
      </TabsList>
      <TabsContent value="preview" className="min-h-0 flex-1">
        <PreviewPanel compact={props.compact} rows={diffRows} />
      </TabsContent>
      <TabsContent value="kept" className="min-h-0 flex-1">
        <LinesPanel
          compact={props.compact}
          actionLabel="复制"
          icon={CheckCircle2}
          lines={props.result?.filteredLines ?? []}
          title="保留结果"
          onAction={props.onCopyKept}
          extraAction={props.result ? { label: "下载", onClick: props.onDownload } : undefined}
        />
      </TabsContent>
      <TabsContent value="removed" className="min-h-0 flex-1">
        <LinesPanel
          compact={props.compact}
          actionLabel="复制"
          icon={ListX}
          lines={props.result?.removedLines ?? []}
          title="移除明细"
          onAction={props.onCopyRemoved}
        />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <LinesPanel compact={props.compact} icon={ScrollText} lines={props.logs} title="运行日志" />
      </TabsContent>
    </Tabs>
  )
}

export function StatsPanel(props: {
  progress: number
  result: LinedupFilterResult | null
  sourceCount: number
  filterCount: number
}) {
  const stats = [
    ["源", props.sourceCount],
    ["过滤", props.filterCount],
    ["保留", props.result?.keptCount ?? 0],
    ["移除", props.result?.removedCount ?? 0],
    ["进度", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/linedup:grid-cols-5">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "移除" && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function DisplayTab(props: {
  compact?: boolean
  count: number
  label: string
  value: LinedupDisplayTab
}) {
  return (
    <TabsTrigger className={cn(props.compact && "min-w-0 px-1 text-xs")} value={props.value}>
      <span className="truncate">{props.label}</span>
      {props.compact ? null : <Badge variant="outline">{props.count}</Badge>}
    </TabsTrigger>
  )
}

function PreviewPanel(props: {
  compact?: boolean
  rows: LinedupPreviewRow[]
}) {
  return (
    <PanelFrame compact={props.compact} count={props.rows.length} icon={ScrollText} title="差异预览">
      {props.rows.length ? (
        <div className="grid gap-1 p-2">
          {props.rows.slice(0, 300).map((row, index) => (
            <div
              key={`${row.status}:${row.line}:${index}`}
              className={cn(
                "grid grid-cols-[1.5rem_minmax(0,1fr)] items-center rounded-sm px-2 py-1 font-mono text-[11px]",
                row.status === "removed" ? "bg-destructive/10 text-destructive line-through" : "bg-muted/25 text-muted-foreground",
              )}
            >
              <span className="text-center">{row.status === "removed" ? "-" : "+"}</span>
              <span className="truncate">{row.line}</span>
            </div>
          ))}
        </div>
      ) : (
        <PanelEmpty title="等待过滤" description="粘贴源文本和过滤词后运行，预览会显示保留与移除的行。" />
      )}
    </PanelFrame>
  )
}

function LinesPanel(props: {
  actionLabel?: string
  compact?: boolean
  extraAction?: { label: string; onClick: () => void }
  icon: LucideIcon
  lines: string[]
  title: string
  onAction?: () => void
}) {
  return (
    <PanelFrame
      compact={props.compact}
      count={props.lines.length}
      icon={props.icon}
      title={props.title}
      actionLabel={props.actionLabel}
      extraAction={props.extraAction}
      onAction={props.onAction}
    >
      {props.lines.length ? (
        <div className={props.compact ? "grid gap-1 p-2" : "grid gap-1 p-3"}>
          {props.lines.slice(-300).map((line, index) => (
            <div key={`${line}:${index}`} className="rounded-sm bg-muted/30 px-2 py-1 font-mono text-[11px] leading-5 text-muted-foreground">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <PanelEmpty title="暂无内容" description="运行后这里会显示对应的文本行。" />
      )}
    </PanelFrame>
  )
}

function PanelFrame(props: {
  actionLabel?: string
  children: ReactNode
  compact?: boolean
  count: number
  extraAction?: { label: string; onClick: () => void }
  icon: LucideIcon
  title: string
  onAction?: () => void
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
        <div className="flex shrink-0 items-center gap-1">
          {props.extraAction && (
            <Button disabled={!props.count} size="xs" variant="ghost" onClick={props.extraAction.onClick}>
              <Download data-icon="inline-start" />
              {props.extraAction.label}
            </Button>
          )}
          {props.onAction && (
            <Button disabled={!props.count} size="xs" variant="ghost" onClick={props.onAction}>
              <ClipboardCopy data-icon="inline-start" />
              {props.actionLabel ?? "复制"}
            </Button>
          )}
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.children}
      </ScrollArea>
    </section>
  )
}

function PanelEmpty(props: {
  description: string
  title: string
}) {
  return (
    <Empty className="min-h-36 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ScrollText />
        </EmptyMedia>
        <EmptyTitle className="text-base">{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function preferredDisplayTab(phase: LinedupPhase, result: LinedupFilterResult | null, logCount: number): LinedupDisplayTab {
  if (phase === "completed" && result?.removedCount) return "removed"
  if (phase === "completed" && result) return "preview"
  if (logCount) return "logs"
  return "preview"
}
