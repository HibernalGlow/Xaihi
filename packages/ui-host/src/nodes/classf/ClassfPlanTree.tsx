import { AlertTriangle, Archive, ArrowRight, CheckCircle2, File, Folder, FolderTree, Maximize2, Play, XCircle } from "lucide-react"
import type { ClassfData, ClassfPlanItem, ClassfStage } from "@xiranite/node-classf/core"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { CollapseButton, Tree, type TreeViewElement } from "@/components/ui/file-tree"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string
type RunningItem = { sourcePath: string; stage: ClassfStage } | null | undefined
type RouteStage = "already" | "wait" | "del"

export function ClassfPlanRows(props: { items: ClassfPlanItem[]; paths: string[]; runningItem?: RunningItem; t: Translate }) {
  if (!props.items.length) {
    const text = props.paths.length ? props.t("empty.ready", "Build a plan to list every source and target before execution.") : props.t("empty.noSources", "Add source paths to preview the full classification result.")
    return <div className="flex min-h-32 flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">{text}</div>
  }

  return <ScrollArea className="min-h-0 flex-1"><Table className="min-w-[420px] text-xs"><TableHeader><TableRow><TableHead>{props.t("table.mapping", "Source to destination")}</TableHead><TableHead className="w-24 text-right">{props.t("table.status", "Status")}</TableHead></TableRow></TableHeader><TableBody>{props.items.slice(0, 180).map((item, index) => {
    const running = props.runningItem?.sourcePath === item.sourcePath && props.runningItem.stage === item.stage
    const meta = itemStatusMeta(running ? "running" : item.status, props.t)
    const StatusIcon = meta.icon
    const KindIcon = item.kind === "folder" ? Folder : File
    return <TableRow key={`${item.sourcePath}:${index}`} data-state={item.status === "conflict" || item.status === "error" ? "selected" : undefined}><TableCell><div className="flex min-w-0 items-start gap-2"><KindIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5"><span className="truncate font-medium">{item.sourceName}</span><ArrowRight className="size-3 shrink-0 text-muted-foreground" /><span className="truncate font-medium text-primary" title={item.targetPath}>{item.targetRelative || item.targetPath}</span><Badge variant="outline" className="shrink-0">{props.t(`stages.${item.stage}`, item.stage)}</Badge></div><div className="truncate font-mono text-[11px] text-muted-foreground" title={item.sourcePath}>{item.sourcePath}</div>{item.reason ? <div className="truncate text-[11px] text-destructive">{item.reason}</div> : null}</div></div></TableCell><TableCell className="text-right"><Badge variant={meta.variant} className="gap-1"><StatusIcon />{meta.label}</Badge></TableCell></TableRow>
  })}</TableBody></Table></ScrollArea>
}

export function ClassfPlanTree(props: { onRevealPath?: (path: string) => Promise<void> | void; planCurrent: boolean; result: ClassfData | null; runningItem?: RunningItem; t: Translate }) {
  const elements = buildPlanTree(props.result, props.runningItem, props.t, props.onRevealPath)
  const expandedItems = elements.flatMap(collectTreeFolderIds)
  if (!elements.length) return <Empty className="h-full border-0 p-4 md:p-6"><EmptyHeader><EmptyMedia variant="icon"><FolderTree /></EmptyMedia><EmptyTitle className="text-sm">{props.t("tree.empty", "Waiting for a classification plan")}</EmptyTitle><EmptyDescription className="text-xs">{props.t("tree.emptyDescription", "Build a plan to preview the exact target directory structure here.")}</EmptyDescription></EmptyHeader></Empty>
  return <div className="relative h-full min-h-0">{!props.planCurrent ? <Badge variant="destructive" className="absolute right-3 top-2">{props.t("status.stale", "Plan stale")}</Badge> : null}<Tree key={`${props.result?.items.length ?? 0}:${props.result?.movedCount ?? 0}:${props.result?.copiedCount ?? 0}`} actions={<CollapseButton elements={elements}><Maximize2 data-icon="inline-start" />{props.t("tree.toggle", "Expand/collapse")}</CollapseButton>} className="py-2 text-xs" elements={elements} initialExpandedItems={expandedItems} sort="none" /></div>
}

interface MutablePlanTreeElement extends TreeViewElement { children?: MutablePlanTreeElement[] }

function buildPlanTree(result: ClassfData | null, runningItem: RunningItem, t: Translate, onRevealPath?: (path: string) => Promise<void> | void): TreeViewElement[] {
  if (!result?.items.length) return []
  const root: MutablePlanTreeElement = { id: "classf-plan-root", name: result.baseDir?.split(/[\\/]/).filter(Boolean).at(-1) ?? t("tree.targetRoot", "Target folder"), type: "folder", children: [] }
  for (const [itemIndex, item] of result.items.entries()) {
    if (!item.targetPath && !item.targetRelative) continue
    const pathParts = (item.targetRelative || item.targetPath).replaceAll("\\", "/").split("/").filter(Boolean)
    if (!pathParts.length) continue
    if (pathParts.length === 1 && isRouteStage(item.stage)) pathParts.unshift(item.stage)
    let parent = root
    const folderParts = item.kind === "folder" ? pathParts : pathParts.slice(0, -1)
    for (const [partIndex, part] of folderParts.entries()) {
      parent.children ??= []
      const id = `classf-plan:${pathParts.slice(0, partIndex + 1).join("/")}`
      let child = parent.children.find((candidate) => candidate.id === id)
      if (!child) { child = { id, name: part, type: "folder", children: [] }; parent.children.push(child) }
      parent = child
    }
    const running = runningItem?.sourcePath === item.sourcePath && runningItem.stage === item.stage
    const targetName = pathParts.at(-1) ?? item.sourceName
    const mappingLabel = item.kind === "folder" ? `${t("tree.source", "Source")}: ${item.sourceName}` : item.sourceName === targetName ? targetName : `${item.sourceName} to ${targetName}`
    const revealPath = item.status === "moved" || item.status === "copied" ? item.targetPath || item.sourcePath : item.sourcePath || item.targetPath
    parent.children ??= []
    parent.children.push({ id: `classf-plan:item:${item.stage}:${item.sourcePath}:${itemIndex}`, name: `${mappingLabel} - ${itemStatusMeta(running ? "running" : item.status, t).label}`, type: "file", isSelectable: true, onOpen: revealPath && onRevealPath ? () => void onRevealPath(revealPath) : undefined })
  }
  return root.children?.length ? [root] : []
}

function collectTreeFolderIds(element: TreeViewElement): string[] { return element.type !== "folder" ? [] : [element.id, ...(element.children ?? []).flatMap(collectTreeFolderIds)] }
function isRouteStage(stage: ClassfStage): stage is RouteStage { return stage === "already" || stage === "wait" || stage === "del" }

function itemStatusMeta(status: ClassfPlanItem["status"] | "running", t: Translate) {
  if (status === "running") return { icon: Play, label: t("itemStatus.running", "Running"), variant: "secondary" as const }
  if (status === "moved") return { icon: CheckCircle2, label: t("itemStatus.moved", "Moved"), variant: "default" as const }
  if (status === "copied") return { icon: CheckCircle2, label: t("itemStatus.copied", "Copied"), variant: "default" as const }
  if (status === "ready") return { icon: Archive, label: t("itemStatus.ready", "Ready"), variant: "secondary" as const }
  if (status === "conflict") return { icon: AlertTriangle, label: t("itemStatus.conflict", "Conflict"), variant: "destructive" as const }
  if (status === "error") return { icon: XCircle, label: t("itemStatus.error", "Error"), variant: "destructive" as const }
  return { icon: AlertTriangle, label: t("itemStatus.skipped", "Skipped"), variant: "outline" as const }
}
