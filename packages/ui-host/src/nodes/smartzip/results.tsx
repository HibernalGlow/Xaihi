import type { CommandResult, SmartZipCommandPlan, SmartZipConfig, SmartZipData } from "@xiranite/node-smartzip/core"
import type { LucideIcon } from "lucide-react"
import { Check, Copy, FolderTree, Languages, Maximize2, ScrollText, Settings2, Terminal } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CollapseButton, Tree, type TreeViewElement } from "@/components/ui/file-tree"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

export function SmartZipStatsPanel({ result }: { result: SmartZipData | null }) {
  const { t } = useNodeI18n("smartzip")
  const errorLabel = t("stats.errors", "错误")
  const stats = [
    [t("stats.selected", "选中"), result?.selectedPaths.length ?? 0],
    [t("stats.archives", "归档"), result?.archiveCount ?? 0],
    [t("stats.extensions", "扩展名"), result?.config.archiveExtensions.length ?? 0],
    [errorLabel, result?.errors.length ?? 0],
  ] as const

  return (
    <div data-testid="smartzip-stats-panel" className="grid shrink-0 grid-cols-4 gap-1">
      {stats.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className={cn("text-sm font-semibold tabular-nums", label === errorLabel && Number(value) > 0 && "text-destructive")}>{value}</div>
        </div>
      ))}
    </div>
  )
}

export function SmartZipResultTabs(props: {
  compact?: boolean
  logs: string[]
  result: SmartZipData | null
  running?: boolean
  selectedCodePage?: number
  onCopyLogs: () => void
  onCopyResults: () => void
  onSelectCodePage?: (codePage: number) => void
}) {
  const { t } = useNodeI18n("smartzip")
  const hasCommand = Boolean(props.result?.command)
  const hasConfig = Boolean(props.result?.config)
  const hasEncodingInspection = Boolean(props.result?.encodingInspections?.length)
  const preferredTab = props.running ? "logs" : hasEncodingInspection ? "encoding" : hasCommand ? "command" : hasConfig ? "config" : "logs"
  return (
    <Tabs key={preferredTab} defaultValue={preferredTab} className="flex h-full min-h-0 flex-col">
      <TabsList variant="line" className="shrink-0">
        <TabsTrigger value="command">{t("tabs.command", "命令")}</TabsTrigger>
        <TabsTrigger value="encoding">{t("tabs.encoding", "编码预检")}</TabsTrigger>
        <TabsTrigger value="tree">{t("tabs.tree", "文件树")}</TabsTrigger>
        <TabsTrigger value="config">{t("tabs.config", "配置")}</TabsTrigger>
        <TabsTrigger value="logs">{t("tabs.logs", "日志")}</TabsTrigger>
      </TabsList>
      <TabsContent value="command" className="min-h-0 flex-1">
        <CommandPanel compact={props.compact} result={props.result} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="encoding" className="min-h-0 flex-1">
        <EncodingPanel inspections={props.result?.encodingInspections ?? []} selectedCodePage={props.selectedCodePage} onSelect={props.onSelectCodePage} />
      </TabsContent>
      <TabsContent value="tree" className="min-h-0 flex-1">
        <ArchiveTreePanel inspections={props.result?.encodingInspections ?? []} />
      </TabsContent>
      <TabsContent value="config" className="min-h-0 flex-1">
        <ConfigPanel compact={props.compact} config={props.result?.config} onCopy={props.onCopyResults} />
      </TabsContent>
      <TabsContent value="logs" className="min-h-0 flex-1">
        <TextPanel compact={props.compact} emptyText={t("empty.logsHint", "运行日志会显示在这里。")} icon={ScrollText} lines={props.logs} onCopy={props.onCopyLogs} />
      </TabsContent>
    </Tabs>
  )
}

function CommandPanel(props: {
  compact?: boolean
  result: SmartZipData | null
  onCopy: () => void
}) {
  const { t } = useNodeI18n("smartzip")
  const command = props.result?.command
  const commandResult = props.result?.commandResult
  const operations = props.result?.operations ?? []
  const count = operations.length || (command ? 1 : 0)
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <PanelHeader count={count} icon={Terminal} label={t("tabs.command", "工作流")} onCopy={props.onCopy} />
      <ScrollArea className="min-h-0 flex-1">
        {count ? (
          <div className={props.compact ? "grid gap-1.5 p-2" : "grid gap-2 p-3"}>
            {operations.length
              ? operations.map((operation, index) => operation.command
                ? <CommandRow key={`${operation.sourcePath}-${index}`} command={operation.command} result={operation.commandResult} />
                : <OperationRow key={`${operation.sourcePath}-${index}`} operation={operation} />)
              : command ? <CommandRow command={command} result={commandResult} /> : null}
          </div>
        ) : (
          <EmptyState compact={props.compact} icon={Terminal} title={t("empty.waitingCommand", "等待工作流")} description={t("empty.waitingCommandDesc", "选择动作并运行后会显示 TypeScript SmartZip 工作流计划。")} />
        )}
      </ScrollArea>
    </section>
  )
}

function ArchiveTreePanel({ inspections }: { inspections: NonNullable<SmartZipData["encodingInspections"]> }) {
  const { t } = useNodeI18n("smartzip")
  const elements = inspections.map(toArchiveTreeElement)
  const expandedItems = elements.flatMap(collectTreeFolderIds)
  const entryCount = inspections.reduce((total, inspection) => total + (inspection.entries?.length ?? 0), 0)
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <PanelHeader count={entryCount} icon={FolderTree} label={t("tabs.tree", "文件树")} />
      <div className="min-h-0 flex-1">
        {elements.length ? (
          <Tree
            actions={<CollapseButton elements={elements}><Maximize2 data-icon="inline-start" />{t("tree.expand", "展开")}</CollapseButton>}
            className="text-xs"
            elements={elements}
            initialExpandedItems={expandedItems}
            sort="none"
          />
        ) : (
          <EmptyState icon={FolderTree} title={t("tree.empty", "等待文件树")} description={t("tree.emptyDescription", "运行编码预检后会读取归档成员并显示目录结构。")}/>
        )}
      </div>
    </section>
  )
}

function toArchiveTreeElement(inspection: NonNullable<SmartZipData["encodingInspections"]>[number]): TreeViewElement {
  // addTreePath pushes into root.children in place, so this array stays the same object the root holds.
  const children: MutableTreeNode[] = []
  const root: MutableTreeNode = {
    id: inspection.sourcePath,
    name: `${inspection.sourcePath.split(/[\\/]/).pop() ?? inspection.sourcePath} · ${inspection.archiveStatus ?? inspection.confidence}`,
    type: "folder",
    children,
  }
  for (const entry of inspection.entries ?? []) addTreePath(root, entry)
  if (!children.length) {
    children.push({
      id: `${inspection.sourcePath}::status`,
      name: inspection.treeError ?? inspection.message,
      type: "file",
      isSelectable: false,
    })
  }
  return root
}

interface MutableTreeNode extends TreeViewElement {
  children?: MutableTreeNode[]
}

function addTreePath(root: MutableTreeNode, path: string) {
  const normalized = path.replaceAll("\\", "/")
  const parts = normalized.split("/").filter(Boolean)
  let parent = root
  parts.forEach((part, index) => {
    parent.children ??= []
    const id = `${root.id}::${parts.slice(0, index + 1).join("/")}`
    let child = parent.children.find((item) => item.id === id)
    if (!child) {
      const folder = index < parts.length - 1 || normalized.endsWith("/")
      child = { id, name: part, type: folder ? "folder" : "file", children: folder ? [] : undefined, isSelectable: false }
      parent.children.push(child)
    }
    parent = child
  })
}

function collectTreeFolderIds(element: TreeViewElement): string[] {
  if (element.type !== "folder") return []
  return [element.id, ...(element.children ?? []).flatMap(collectTreeFolderIds)]
}

function EncodingPanel(props: {
  inspections: NonNullable<SmartZipData["encodingInspections"]>
  selectedCodePage?: number
  onSelect?: (codePage: number) => void
}) {
  const { t } = useNodeI18n("smartzip")
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <PanelHeader count={props.inspections.length} icon={Languages} label={t("tabs.encoding", "编码预检")} />
      <ScrollArea className="min-h-0 flex-1">
        {props.inspections.length ? (
          <div className="grid gap-3 p-3">
            {props.inspections.map((inspection) => (
              <div key={inspection.sourcePath} className="grid gap-2 rounded-lg border bg-background/70 p-3">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="truncate font-mono text-xs" title={inspection.sourcePath}>{inspection.sourcePath}</div>
                  <Badge variant={inspection.confidence === "low" || inspection.confidence === "unknown" ? "outline" : "secondary"}>{inspection.confidence}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{inspection.message}</p>
                <div className="grid gap-2 @3xl/smartzip:grid-cols-2">
                  {inspection.candidates.map((candidate) => {
                    const selected = props.selectedCodePage === candidate.codePage
                    const recommended = inspection.recommendedCodePage === candidate.codePage
                    return (
                      <button
                        key={candidate.codePage}
                        type="button"
                        className={cn("grid min-w-0 gap-1 rounded-md border p-2 text-left transition-colors hover:bg-muted/60", selected && "border-primary bg-primary/5")}
                        onClick={() => props.onSelect?.(candidate.codePage)}
                      >
                        <span className="flex items-center justify-between gap-2 text-xs font-medium">
                          <span>{candidate.label}</span>
                          <span className="flex items-center gap-1">
                            {recommended && <Badge variant="secondary">{t("encoding.recommended", "推荐")}</Badge>}
                            {selected && <Check className="size-3.5 text-primary" />}
                          </span>
                        </span>
                        <span className="truncate font-mono text-[11px] text-muted-foreground" title={candidate.preview.join(" · ")}>{candidate.preview.join(" · ")}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Languages} title={t("encoding.empty", "等待编码预检")} description={t("encoding.emptyDescription", "点击“预检文件名编码”后，这里会显示各代码页对应的文件名预览。")}/>
        )}
      </ScrollArea>
    </section>
  )
}

function OperationRow({ operation }: { operation: NonNullable<SmartZipData["operations"]>[number] }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background/70 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="truncate font-mono text-xs" title={operation.sourcePath}>{operation.sourcePath}</div>
        <Badge variant={operation.status === "error" ? "destructive" : operation.status === "completed" ? "default" : "outline"}>{operation.status}</Badge>
      </div>
      <div className="truncate text-[11px] text-muted-foreground" title={operation.outputPath ?? operation.message}>{operation.outputPath ?? operation.message}</div>
    </div>
  )
}

function CommandRow({ command, result }: { command: SmartZipCommandPlan; result?: CommandResult }) {
  const status = result ? (result.code === 0 ? "success" : "error") : "planned"
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background/70 p-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="truncate font-mono text-xs" title={command.command}>{command.command}</div>
        <Badge variant={status === "error" ? "destructive" : status === "success" ? "default" : "outline"} className="shrink-0">{status}</Badge>
      </div>
      <div className="truncate font-mono text-[11px] text-muted-foreground" title={command.args.join(" ")}>
        {command.label} {"->"} {command.args.join(" ")}
      </div>
      {result?.stderr ? <div className="truncate font-mono text-[11px] text-destructive" title={result.stderr}>{result.stderr}</div> : null}
      {result?.stdout ? <div className="truncate font-mono text-[11px] text-muted-foreground" title={result.stdout}>{result.stdout}</div> : null}
    </div>
  )
}

function ConfigPanel(props: {
  compact?: boolean
  config?: SmartZipConfig
  onCopy?: () => void
}) {
  const { t } = useNodeI18n("smartzip")
  const config = props.config
  const enabledLabel = t("configRows.enabled", "启用")
  const disabledLabel = t("configRows.disabled", "禁用")
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <PanelHeader count={config ? 1 : 0} icon={Settings2} label={t("tabs.config", "配置")} onCopy={props.onCopy} />
      <ScrollArea className="min-h-0 flex-1">
        {config ? (
          <div className={props.compact ? "grid gap-1.5 p-2" : "grid gap-2 p-3"}>
            <ConfigRow label={t("configRows.sevenZipDir", "7-Zip 目录")} value={config.sevenZipDir} />
            <ConfigRow label={t("configRows.passwords", "密码数")} value={String(config.passwords.length)} />
            <ConfigRow label={t("configRows.archiveExtensions", "归档扩展名")} value={config.archiveExtensions.join(", ") || t("configRows.default", "(默认)")} />
            <ConfigRow label={t("configRows.contextMenu", "右键菜单")} value={config.contextMenu ? enabledLabel : disabledLabel} />
            <ConfigRow label={t("configRows.sendTo", "发送到")} value={config.sendTo ? enabledLabel : disabledLabel} />
          </div>
        ) : (
          <EmptyState compact={props.compact} icon={Settings2} title={t("empty.waitingConfig", "等待配置")} description={t("empty.waitingConfigDesc", "运行状态查看后会显示 SmartZip 配置。")} />
        )}
      </ScrollArea>
    </section>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border bg-background/70 p-2">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-xs" title={value}>{value}</div>
    </div>
  )
}

function TextPanel(props: {
  compact?: boolean
  emptyText: string
  icon: typeof ScrollText
  lines: string[]
  onCopy: () => void
}) {
  const { t } = useNodeI18n("smartzip")
  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <PanelHeader count={props.lines.length} icon={props.icon} label={t("tabs.logs", "日志")} onCopy={props.onCopy} />
      <ScrollArea className="min-h-0 flex-1">
        {props.lines.length ? (
          <pre className={props.compact ? "whitespace-pre-wrap p-2 text-xs leading-5 text-muted-foreground" : "whitespace-pre-wrap p-3 text-xs leading-5 text-muted-foreground"}>
            {props.lines.join("\n")}
          </pre>
        ) : (
          <EmptyState compact={props.compact} icon={props.icon} title={t("empty.waitingLogs", "等待日志")} description={props.emptyText} />
        )}
      </ScrollArea>
    </section>
  )
}

function PanelHeader(props: {
  count: number
  icon: LucideIcon
  label: string
  onCopy?: () => void
}) {
  const { t } = useNodeI18n("smartzip")
  const Icon = props.icon
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" />
          <span>{props.count ? t("panelHeader.items", "{{count}} 项{{label}}", { count: props.count, label: props.label }) : t("panelHeader.waiting", "等待{{label}}", { label: props.label })}</span>
        </div>
        {props.onCopy && (
          <Button disabled={!props.count} size="xs" variant="ghost" onClick={props.onCopy}>
            <Copy data-icon="inline-start" />
            {t("actions.copy", "复制")}
          </Button>
        )}
      </div>
      <Separator />
    </>
  )
}

function EmptyState(props: { compact?: boolean; icon: LucideIcon; title: string; description: string }) {
  const Icon = props.icon
  return (
    <div className={props.compact ? "flex h-full min-h-20 items-center justify-center p-4 text-center text-xs text-muted-foreground" : "flex h-full min-h-28 items-center justify-center p-6 text-center text-sm text-muted-foreground"}>
      <span className="flex flex-col items-center gap-1.5">
        <Icon className="size-4" />
        <span className="font-medium text-foreground/80">{props.title}</span>
        <span>{props.description}</span>
      </span>
    </div>
  )
}
