import type { EngineVData } from "@xiranite/node-enginev/core"
import { AlertTriangle, CheckCircle2, Copy, Eye, Layers3, ListChecks, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

export function StatsPanel({ result, total, visible, selected }: {
  result: EngineVData | null
  selected: number
  total: number
  visible: number
}) {
  const { t: tNode } = useNodeI18n("enginev")
  const stats = [
    [tNode("stats.total", "总数"), result?.totalCount ?? total, Layers3],
    [tNode("stats.visible", "可见"), result?.filteredCount ?? visible, Eye],
    [tNode("stats.selected", "选中"), selected, CheckCircle2],
    [tNode("stats.types", "类型"), Object.keys(result?.typeStats ?? {}).length, Tags],
    [tNode("stats.failed", "失败"), result?.failedCount ?? 0, AlertTriangle],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-5 gap-1">
      {stats.map(([label, value, Icon]) => (
        <div key={label} className="min-w-0 rounded-md border bg-card/55 px-2 py-1.5 text-center">
          <div className="flex min-w-0 items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <Icon className="size-3 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
          <div className="text-sm font-semibold tabular-nums">{value}</div>
        </div>
      ))}
    </div>
  )
}

export function ResultTabs(props: {
  compact?: boolean
  logs: string[]
  result: EngineVData | null
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const { t: tNode } = useNodeI18n("enginev")
  const renameLines = props.result?.renameResults.map((item) => `${item.status} ${item.oldName} -> ${item.newName}`) ?? []
  const deleteLines = props.result?.deleteResults.map((item) => `${item.status} ${item.workshopId} ${item.message}`) ?? []
  const errorLines = props.result?.errors ?? []
  const hasResults = renameLines.length || deleteLines.length || errorLines.length

  return (
    <Tabs defaultValue="results" className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">
        <TabsTrigger value="results" className="gap-1.5 px-2.5">
          <ListChecks className="size-3.5 shrink-0" />
          {tNode("tabs.results", "结果")}
        </TabsTrigger>
        <TabsTrigger value="logs" className="gap-1.5 px-2.5">
          <Layers3 className="size-3.5 shrink-0" />
          {tNode("tabs.logs", "日志")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="min-h-0 flex-1">
        <TextPanel
          compact={props.compact}
          emptyText={tNode("empty.results", "运行重命名、删除或导出后，这里会显示计划和错误明细。")}
          lines={hasResults ? [...renameLines, ...deleteLines, ...errorLines.map((item) => `error ${item}`)] : []}
          onCopy={props.onCopyResults}
        />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <TextPanel compact={props.compact} emptyText={tNode("empty.logs", "运行日志会显示在这里。")} lines={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function TextPanel(props: {
  compact?: boolean
  emptyText: string
  lines: string[]
  onCopy: () => void
}) {
  const { t: tNode } = useNodeI18n("enginev")
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-card/60">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListChecks className="size-3.5" />
          <span>{props.lines.length ? tNode("empty.itemCount", "{{count}} 项", { count: props.lines.length }) : tNode("empty.waitingRun", "等待运行")}</span>
        </div>
        <Button disabled={!props.lines.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          {tNode("buttons.copy", "复制")}
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.lines.length ? (
          <pre className={props.compact ? "p-2 text-xs leading-5 text-muted-foreground" : "p-3 text-xs leading-5 text-muted-foreground"}>
            {props.lines.join("\n")}
          </pre>
        ) : (
          <div className={props.compact ? "flex min-h-16 items-center justify-center p-3 text-center text-xs text-muted-foreground" : "flex min-h-36 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
            {props.emptyText}
          </div>
        )}
      </ScrollArea>
    </section>
  )
}
