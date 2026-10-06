import { useEffect, useState } from "react"
import type { LinkPathInfo, LinkRecord, LinkuData } from "@xiranite/node-linku/core"
import { Archive, CheckCircle2, Copy, FileQuestion, Link2, ListChecks } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { LinkuDisplayTab, LinkuPhase } from "./types"

export function LinkuDisplayTabs(props: {
  compact?: boolean
  result: LinkuData | null
  logs: string[]
  phase: LinkuPhase
  running?: boolean
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const links = props.result?.links ?? []
  const pathInfo = props.result?.pathInfo ?? null
  const preferredTab = preferredDisplayTab({
    conflictCount: props.result?.failedCount ?? 0,
    hasLinks: links.length > 0,
    hasPathInfo: Boolean(pathInfo),
    logCount: props.logs.length,
    phase: props.phase,
    running: props.running ?? false,
  })
  const [tab, setTab] = useState<LinkuDisplayTab>(preferredTab)

  useEffect(() => {
    setTab(preferredTab)
  }, [preferredTab])

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as LinkuDisplayTab)} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className={cn("shrink-0", props.compact && "grid w-full grid-cols-3")}>
        <DisplayTabTrigger compact={props.compact} count={links.length} label="链接" value="links" />
        <DisplayTabTrigger compact={props.compact} count={pathInfo ? 1 : 0} label="路径" value="pathInfo" />
        <DisplayTabTrigger compact={props.compact} count={props.logs.length} label="日志" value="logs" />
      </TabsList>
      <TabsContent value="links" className="min-h-0 flex-1">
        <LinksPanel compact={props.compact} links={links} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="pathInfo" className="min-h-0 flex-1">
        <PathInfoPanel compact={props.compact} info={pathInfo} onCopy={props.onCopyResults} />
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
  value: LinkuDisplayTab
}) {
  return (
    <TabsTrigger className={cn(props.compact && "min-w-0 px-1 text-xs")} value={props.value}>
      <span className="truncate">{props.label}</span>
      {props.compact ? null : <Badge variant="outline">{props.count}</Badge>}
    </TabsTrigger>
  )
}

function LinksPanel(props: {
  compact?: boolean
  links: LinkRecord[]
  onCopy: () => void
}) {
  return (
    <PanelFrame
      compact={props.compact}
      count={props.links.length}
      icon={ListChecks}
      title="链接记录"
      onCopy={props.onCopy}
    >
      {props.links.length ? (
        <div className="grid gap-1 p-2">
          {props.links.slice(0, 200).map((record, index) => (
            <LinkRow key={`${record.link}:${index}`} record={record} index={index} />
          ))}
        </div>
      ) : (
        <PanelEmpty icon={Link2} title="暂无链接记录" description="创建、列出或还原链接后，这里会显示当前已记录的符号链接。" />
      )}
    </PanelFrame>
  )
}

function PathInfoPanel(props: {
  compact?: boolean
  info: LinkPathInfo | null
  onCopy: () => void
}) {
  return (
    <PanelFrame
      compact={props.compact}
      count={props.info ? 1 : 0}
      icon={FileQuestion}
      title="路径信息"
      onCopy={props.onCopy}
    >
      {props.info ? (
        <div className="grid gap-2 p-3">
          <div className="break-all rounded-md bg-muted/30 px-2 py-1.5 font-mono text-xs">{props.info.path}</div>
          <div className="grid grid-cols-2 gap-2">
            <InfoCell label="存在" value={props.info.exists ? "是" : "否"} tone={props.info.exists ? "good" : "bad"} />
            <InfoCell label="类型" value={props.info.kind} />
            <InfoCell label="符号链接" value={props.info.isSymlink ? "是" : "否"} tone={props.info.isSymlink ? "good" : "neutral"} />
            <InfoCell label="目标存在" value={props.info.targetExists === undefined ? "—" : props.info.targetExists ? "是" : "否"} tone={props.info.targetExists === false ? "bad" : "neutral"} />
            {typeof props.info.sizeMb === "number" && <InfoCell label="体积" value={`${props.info.sizeMb.toFixed(2)} MB`} />}
            {typeof props.info.fileCount === "number" && <InfoCell label="文件数" value={String(props.info.fileCount)} />}
          </div>
          {props.info.linkTarget && (
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">链接目标</div>
              <div className="break-all font-mono text-xs">{props.info.linkTarget}</div>
            </div>
          )}
        </div>
      ) : (
        <PanelEmpty icon={FileQuestion} title="暂无路径信息" description="输入路径后执行查询，这里会显示路径的存在性、类型和链接关系。" />
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
          {props.logs.slice(-200).map((line, index) => (
            <div key={`${line}:${index}`} className="rounded-sm bg-muted/30 px-2 py-1 font-mono text-[11px] leading-5 text-muted-foreground">
              {line}
            </div>
          ))}
        </div>
      ) : (
        <PanelEmpty icon={Archive} title="等待运行" description="查询、创建、移动、列出、恢复和还原的事件会自动出现在这里。" />
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

function LinkRow({ record, index }: { record: LinkRecord; index: number }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md px-2 py-1.5 hover:bg-muted/45">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
        <Link2 className="size-3.5 shrink-0 text-primary" />
        <span className="truncate text-xs font-medium">{basename(record.link)}</span>
      </div>
      <div className="truncate pl-8 font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground/70">{record.link}</span>
        <span className="mx-1">-&gt;</span>
        <span>{record.target}</span>
      </div>
      {(record.type || record.createdAt) && (
        <div className="flex min-w-0 items-center gap-2 pl-8 text-[11px] text-muted-foreground">
          {record.type && <Badge variant="outline" className="px-1 text-[10px]">{record.type}</Badge>}
          {record.createdAt && <span className="truncate">{record.createdAt}</span>}
        </div>
      )}
    </div>
  )
}

function InfoCell(props: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{props.label}</div>
      <div className={cn(
        "text-sm font-semibold tabular-nums",
        props.tone === "good" && "text-primary",
        props.tone === "bad" && "text-destructive",
      )}>{props.value}</div>
    </div>
  )
}

function PanelEmpty(props: {
  description: string
  icon: typeof FileQuestion
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

/** 展开态右侧统计面板 */
export function StatsPanel(props: {
  progress: number
  result: LinkuData | null
}) {
  const stats = [
    ["链接", props.result?.links.length ?? 0],
    ["已创建", props.result?.created ? 1 : 0],
    ["已恢复", props.result?.recoveredCount ?? 0],
    ["已还原", props.result?.restoredCount ?? 0],
    ["失败", props.result?.failedCount ?? 0],
    ["进度", `${props.progress}%`],
  ] as const

  return (
    <div className="grid shrink-0 grid-cols-3 gap-1 @3xl/linku:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "失败" && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function preferredDisplayTab(input: {
  conflictCount: number
  hasLinks: boolean
  hasPathInfo: boolean
  logCount: number
  phase: LinkuPhase
  running: boolean
}): LinkuDisplayTab {
  if (input.running || input.phase === "running") return "logs"
  if (input.conflictCount && input.phase === "completed") return "logs"
  if (input.hasLinks) return "links"
  if (input.hasPathInfo) return "pathInfo"
  if (input.logCount) return "logs"
  return "links"
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).at(-1) ?? value
}

export { CheckCircle2 }
