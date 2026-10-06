import type { GifuArchivePlan, GifuData } from "@xiranite/node-gifu/core"
import { Archive, CheckCircle2, Copy, ScrollText, Terminal, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export function GifuStatsPanel({ result }: { result: GifuData | null }) {
  const stats = [
    ["归档", result?.archives.length ?? 0],
    ["就绪", result?.readyCount ?? 0],
    ["单图", result?.singleCount ?? 0],
    ["空包", result?.emptyCount ?? 0],
  ] as const

  return (
    <div data-testid="gifu-stats-panel" className="grid shrink-0 grid-cols-4 gap-1">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === "就绪" && Number(value) > 0 && "text-green-600 dark:text-green-400", label === "空包" && Number(value) > 0 && "text-amber-600 dark:text-amber-400")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export function GifuResultTabs(props: {
  compact?: boolean
  logs: string[]
  result: GifuData | null
  running?: boolean
  onCopyLogs: () => void
  onCopyResults: () => void
}) {
  const hasArchives = Boolean(props.result?.archives.length)
  const preferredTab = props.running ? "logs" : hasArchives ? "archives" : props.logs.length ? "logs" : "archives"

  return (
    <Tabs defaultValue={preferredTab} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">
        <TabsTrigger value="archives">归档</TabsTrigger>
        <TabsTrigger value="command">命令</TabsTrigger>
        <TabsTrigger value="logs">日志</TabsTrigger>
      </TabsList>
      <TabsContent value="archives" className="min-h-0 flex-1">
        <ArchivePanel compact={props.compact} archives={props.result?.archives ?? []} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="command" className="min-h-0 flex-1">
        <TextPanel
          compact={props.compact}
          emptyText="生成计划后会显示命令、记录路径和配置摘要。"
          icon={Terminal}
          lines={commandLines(props.result)}
          onCopy={props.onCopyResults}
        />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <TextPanel compact={props.compact} emptyText="运行日志会显示在这里。" icon={ScrollText} lines={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function ArchivePanel(props: {
  compact?: boolean
  archives: GifuArchivePlan[]
  onCopy: () => void
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Archive className="size-3.5" />
          <span>{props.archives.length ? `${props.archives.length} 个归档` : "等待扫描"}</span>
        </div>
        <Button disabled={!props.archives.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          复制
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.archives.length ? (
          <div className={props.compact ? "grid gap-1.5 p-2" : "grid gap-2 p-3"}>
            {props.archives.map((archive) => (
              <ArchiveRow key={archive.archivePath} archive={archive} />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-20 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            扫描归档后会显示输出路径和图片数量。
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function ArchiveRow({ archive }: { archive: GifuArchivePlan }) {
  const StatusIcon = archive.status === "ready" ? CheckCircle2 : TriangleAlert
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background/70 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-xs" title={archive.archivePath}>{archive.archivePath}</div>
        <Badge variant={archive.status === "ready" ? "default" : "outline"} className="shrink-0">
          <StatusIcon className="size-3" />
          {archive.status}
        </Badge>
      </div>
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 text-[11px] text-muted-foreground">
        <span>{archive.imageCount} images</span>
        <span className="truncate font-mono" title={archive.outputPath}>{archive.outputPath}</span>
      </div>
    </div>
  )
}

function TextPanel(props: {
  compact?: boolean
  emptyText: string
  icon: typeof Terminal
  lines: string[]
  onCopy: () => void
}) {
  const Icon = props.icon
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          <span>{props.lines.length ? `${props.lines.length} 项` : "等待运行"}</span>
        </div>
        <Button disabled={!props.lines.length} size="xs" variant="ghost" onClick={props.onCopy}>
          <Copy data-icon="inline-start" />
          复制
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {props.lines.length ? (
          <pre className={props.compact ? "whitespace-pre-wrap p-2 text-xs leading-5 text-muted-foreground" : "whitespace-pre-wrap p-3 text-xs leading-5 text-muted-foreground"}>
            {props.lines.join("\n")}
          </pre>
        ) : (
          <div className="flex h-full min-h-20 items-center justify-center p-4 text-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Icon className="size-3.5" />{props.emptyText}</span>
          </div>
        )}
      </ScrollArea>
    </section>
  )
}

function commandLines(result: GifuData | null): string[] {
  if (!result) return []
  const command = result.command
  const database = result.database
  return [
    command ? `${command.command} ${command.args.join(" ")}` : "",
    command?.cwd ? `cwd: ${command.cwd}` : "",
    database ? `record: ${database.enabled ? "on" : "off"} ${database.path}` : "",
    result.config ? `config: ${result.config.path || "(inline)"} keys=${result.config.keys.join(", ")}` : "",
    ...result.errors.map((error) => `error: ${error}`),
  ].filter(Boolean)
}
