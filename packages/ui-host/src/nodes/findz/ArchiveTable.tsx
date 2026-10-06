import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { FindzArchiveRow, FindzMemberRow } from "@xiranite/findz-native"
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Folder, Image, RefreshCw, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { formatBytes, formatDensity } from "./format"
import type { FindzArchiveSort } from "./types"

interface FolderNode {
  path: string
  name: string
  archiveCount: number
  folders: Map<string, FolderNode>
  archives: FindzArchiveRow[]
}

export function FindzArchiveTable({ archives, members, pathPrefix, selectedArchiveId, selectionRevision, sortBy, sortDesc, total, hasPreviousPage, hasNextPage, onSelectArchive, onDeepRetryMember, onDrillFolder, onSort, onPreviousPage, onNextPage, className }: {
  archives: FindzArchiveRow[]
  members?: FindzMemberRow[]
  pathPrefix?: string
  selectedArchiveId?: number
  selectionRevision: number
  sortBy: FindzArchiveSort
  sortDesc: boolean
  total: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  onSelectArchive(archiveId: number): void
  onDeepRetryMember(memberId: number): void
  onDrillFolder(pathPrefix: string): void
  onSort(sort: FindzArchiveSort): void
  onPreviousPage(): void
  onNextPage(): void
  className?: string
}) {
  const { t } = useNodeI18n("findz")
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(() => new Set())
  const archiveRows = useRef(new Map<number, HTMLTableRowElement>())
  const hierarchy = buildArchiveHierarchy(archives, pathPrefix)

  useEffect(() => {
    const selectedArchive = archives.find((archive) => archive.id === selectedArchiveId)
    if (!selectedArchive) return
    const ancestors = folderPathsForArchive(selectedArchive, pathPrefix)
    if (!ancestors.length) return
    setCollapsedFolders((current) => {
      const next = new Set(current)
      let changed = false
      for (const folderPath of ancestors) changed = next.delete(folderPath) || changed
      return changed ? next : current
    })
  }, [archives, pathPrefix, selectedArchiveId, selectionRevision])

  useEffect(() => {
    if (selectedArchiveId === undefined) return
    archiveRows.current.get(selectedArchiveId)?.scrollIntoView({ block: "nearest" })
  }, [collapsedFolders, selectedArchiveId, selectionRevision])

  const setArchiveRow = useCallback((archiveId: number, row: HTMLTableRowElement | null) => {
    if (row) archiveRows.current.set(archiveId, row)
    else archiveRows.current.delete(archiveId)
  }, [])

  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current)
      if (next.has(folderPath)) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
  }, [])

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
        <div className="text-xs text-muted-foreground">{t("workspace.table.indexedSummary", "{{visible}} of {{total}} indexed archives", { visible: archives.length, total })}</div>
        <div className="flex items-center gap-1">
          <Button aria-label={t("workspace.table.previousPage", "Previous archive page")} disabled={!hasPreviousPage} onClick={onPreviousPage} size="xs" variant="ghost"><ChevronLeft /></Button>
          <Button aria-label={t("workspace.table.nextPage", "Next archive page")} disabled={!hasNextPage} onClick={onNextPage} size="xs" variant="ghost"><ChevronRight /></Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-8" aria-label={t("workspace.table.expandArchive", "Expand archive")} />
              <SortableHead label={t("workspace.table.columns.archive", "Archive")} active={sortBy === "relativePath"} descending={sortDesc} onClick={() => onSort("relativePath")} t={t} />
              <SortableHead label={t("workspace.table.columns.size", "Size")} className="text-right" active={sortBy === "archiveSize"} descending={sortDesc} onClick={() => onSort("archiveSize")} t={t} />
              <SortableHead label={t("workspace.table.columns.images", "Images")} className="text-right" active={sortBy === "imageCount"} descending={sortDesc} onClick={() => onSort("imageCount")} t={t} />
              <SortableHead label={t("workspace.table.columns.analyzed", "Analyzed")} className="text-right" active={sortBy === "analysisCoverage"} descending={sortDesc} onClick={() => onSort("analysisCoverage")} t={t} />
              <SortableHead label={t("workspace.table.columns.density", "Density")} className="text-right" active={sortBy === "averageBytesPerMegapixel"} descending={sortDesc} onClick={() => onSort("averageBytesPerMegapixel")} t={t} />
              <SortableHead label={t("workspace.table.columns.anomalies", "Anomalies")} className="text-right" active={sortBy === "anomalyCount"} descending={sortDesc} onClick={() => onSort("anomalyCount")} t={t} />
              <SortableHead label={t("workspace.table.columns.savings", "Savings")} className="text-right" active={sortBy === "estimatedSavings"} descending={sortDesc} onClick={() => onSort("estimatedSavings")} t={t} />
            </TableRow>
          </TableHeader>
          <TableBody>
            <HierarchyRows
              node={hierarchy}
              depth={0}
              collapsedFolders={collapsedFolders}
              selectedArchiveId={selectedArchiveId}
              members={members}
              onToggleFolder={toggleFolder}
              onDrillFolder={onDrillFolder}
              onSelectArchive={onSelectArchive}
              onDeepRetryMember={onDeepRetryMember}
              setArchiveRow={setArchiveRow}
              t={t}
            />
            {!archives.length && <TableRow><TableCell colSpan={8} className="h-28 text-center text-sm text-muted-foreground">{t("workspace.table.empty", "Open a library, then run a ZIP scan to populate the index.")}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}

function HierarchyRows({ node, depth, collapsedFolders, selectedArchiveId, members, onToggleFolder, onDrillFolder, onSelectArchive, onDeepRetryMember, setArchiveRow, t }: {
  node: FolderNode
  depth: number
  collapsedFolders: ReadonlySet<string>
  selectedArchiveId?: number
  members?: FindzMemberRow[]
  onToggleFolder(path: string): void
  onDrillFolder(path: string): void
  onSelectArchive(archiveId: number): void
  onDeepRetryMember(memberId: number): void
  setArchiveRow(archiveId: number, row: HTMLTableRowElement | null): void
  t: ReturnType<typeof useNodeI18n>["t"]
}) {
  return <>
    {sortedFolders(node).map((folder) => {
      const collapsed = collapsedFolders.has(folder.path)
      return <FolderRows key={folder.path} folder={folder} depth={depth} collapsed={collapsed} onToggle={onToggleFolder} onDrill={onDrillFolder} t={t}>
        {!collapsed && <HierarchyRows
          node={folder}
          depth={depth + 1}
          collapsedFolders={collapsedFolders}
          selectedArchiveId={selectedArchiveId}
          members={members}
          onToggleFolder={onToggleFolder}
          onDrillFolder={onDrillFolder}
          onSelectArchive={onSelectArchive}
          onDeepRetryMember={onDeepRetryMember}
          setArchiveRow={setArchiveRow}
          t={t}
        />}
      </FolderRows>
    })}
    {node.archives.map((archive) => <ArchiveRows
      key={archive.id}
      archive={archive}
      depth={depth}
      expanded={selectedArchiveId === archive.id}
      members={selectedArchiveId === archive.id ? members : undefined}
      onSelect={onSelectArchive}
      onDeepRetryMember={onDeepRetryMember}
      rowRef={(row) => setArchiveRow(archive.id, row)}
      t={t}
    />)}
  </>
}

function FolderRows({ folder, depth, collapsed, onToggle, onDrill, t, children }: { folder: FolderNode; depth: number; collapsed: boolean; onToggle(path: string): void; onDrill(path: string): void; t: ReturnType<typeof useNodeI18n>["t"]; children?: ReactNode }) {
  const activate = () => onToggle(folder.path)
  return <>
    <TableRow
      aria-expanded={!collapsed}
      className="cursor-pointer bg-muted/30 hover:bg-muted/45"
      data-testid={`findz-folder-${testIdSegment(folder.path)}`}
      tabIndex={0}
      onClick={activate}
      onDoubleClick={() => onDrill(folder.path)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate() } }}
    >
      <TableCell className="w-8 px-2"><ChevronRight className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} /></TableCell>
      <TableCell colSpan={7}>
        <div className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: `${depth * 16}px` }}>
          <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{folder.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{t("workspace.table.folderArchiveCount", "{{count}} archives", { count: folder.archiveCount })}</span>
        </div>
      </TableCell>
    </TableRow>
    {children}
  </>
}

function ArchiveRows({ archive, depth, expanded, members, onSelect, onDeepRetryMember, rowRef, t }: { archive: FindzArchiveRow; depth: number; expanded: boolean; members?: FindzMemberRow[]; onSelect(archiveId: number): void; onDeepRetryMember(memberId: number): void; rowRef(row: HTMLTableRowElement | null): void; t: ReturnType<typeof useNodeI18n>["t"] }) {
  return <>
    <TableRow
      aria-selected={expanded}
      className={cn("cursor-pointer data-[state=selected]:bg-accent/60", expanded && "bg-accent/50")}
      data-testid={`findz-archive-${archive.id}`}
      data-state={expanded ? "selected" : undefined}
      ref={rowRef}
      tabIndex={0}
      onClick={() => onSelect(archive.id)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(archive.id) }}
    >
      <TableCell className="w-8 px-2">{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</TableCell>
      <TableCell className="max-w-72">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingInlineStart: `${depth * 16}px` }}>
          <span className="truncate font-medium" title={archive.relativePath}>{archive.relativePath}</span>
          <ArchiveScanState archive={archive} />
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatBytes(archive.size)}</TableCell>
      <TableCell className="text-right tabular-nums">{archive.imageMemberCount}</TableCell>
      <TableCell className="text-right tabular-nums">{archive.analyzedImageCount}/{archive.imageMemberCount}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatDensity(archive.averageBytesPerMegapixel, t("workspace.table.pending", "Pending"))}</TableCell>
      <TableCell className="text-right"><AnomalyBadge count={archive.anomalyCount} /></TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(archive.estimatedSavingsBytes)}</TableCell>
    </TableRow>
    {expanded && <MemberRows members={members} onDeepRetryMember={onDeepRetryMember} t={t} />}
  </>
}

function buildArchiveHierarchy(archives: readonly FindzArchiveRow[], pathPrefix: string | undefined): FolderNode {
  const normalizedPrefix = pathPrefix?.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "") ?? ""
  const root: FolderNode = { path: normalizedPrefix, name: "", archiveCount: archives.length, folders: new Map(), archives: [] }
  for (const archive of archives) {
    const relativePath = archive.relativePath.replaceAll("\\", "/")
    const localPath = normalizedPrefix && relativePath.startsWith(`${normalizedPrefix}/`)
      ? relativePath.slice(normalizedPrefix.length + 1)
      : relativePath
    const segments = localPath.split("/").filter(Boolean)
    let current = root
    const pathSegments = normalizedPrefix ? normalizedPrefix.split("/").filter(Boolean) : []
    for (const segment of segments.slice(0, -1)) {
      pathSegments.push(segment)
      const folderPath = pathSegments.join("/")
      let folder = current.folders.get(folderPath)
      if (!folder) {
        folder = { path: folderPath, name: segment, archiveCount: 0, folders: new Map(), archives: [] }
        current.folders.set(folderPath, folder)
      }
      folder.archiveCount++
      current = folder
    }
    current.archives.push(archive)
  }
  return root
}

function sortedFolders(node: FolderNode): FolderNode[] {
  return [...node.folders.values()].toSorted((left, right) => left.name.localeCompare(right.name))
}

function folderPathsForArchive(archive: FindzArchiveRow, pathPrefix: string | undefined): string[] {
  const normalizedPrefix = pathPrefix?.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "") ?? ""
  const relativePath = archive.relativePath.replaceAll("\\", "/")
  const localPath = normalizedPrefix && relativePath.startsWith(`${normalizedPrefix}/`)
    ? relativePath.slice(normalizedPrefix.length + 1)
    : relativePath
  const parts = localPath.split("/").filter(Boolean).slice(0, -1)
  const pathParts = normalizedPrefix ? normalizedPrefix.split("/").filter(Boolean) : []
  return parts.map((part) => {
    pathParts.push(part)
    return pathParts.join("/")
  })
}

function testIdSegment(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9]+/g, "-")
}

function ArchiveScanState({ archive }: { archive: FindzArchiveRow }) {
  const { t } = useNodeI18n("findz")
  const labels: Record<string, string> = {
    corrupt_archive: t("workspace.table.scanStates.corrupt", "Corrupt archive"),
    unsupported_archive: t("workspace.table.scanStates.unsupported", "Unsupported archive"),
    rejected_archive: t("workspace.table.scanStates.rejected", "Rejected archive"),
  }
  const label = labels[archive.scanState]
  if (!label) return null
  return <Badge variant="outline" className="shrink-0 text-[10px]" title={archive.errorCode || archive.scanState}>{label}</Badge>
}

function MemberRows({ members, onDeepRetryMember, t }: { members?: FindzMemberRow[]; onDeepRetryMember(memberId: number): void; t: ReturnType<typeof useNodeI18n>["t"] }) {
  if (!members) return <TableRow><TableCell colSpan={8} className="py-3 pl-12 text-xs text-muted-foreground">{t("workspace.table.loadingMembers", "Loading archive members...")}</TableCell></TableRow>
  if (!members.length) return <TableRow><TableCell colSpan={8} className="py-3 pl-12 text-xs text-muted-foreground">{t("workspace.table.noMembers", "This archive has no indexed members.")}</TableCell></TableRow>
  return <>
    {members.map((member) => <TableRow key={member.id} className="bg-muted/30 hover:bg-muted/45">
      <TableCell />
      <TableCell className="max-w-72 truncate pl-7 font-mono text-[11px]" title={member.memberPath}>{member.memberPath}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(member.compressedSize)}</TableCell>
      <TableCell className="text-right">{member.imageCandidate && <Image className="ml-auto size-3.5 text-muted-foreground" />}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{member.width && member.height ? `${member.width}x${member.height}` : metadataStatusLabel(member.metadataStatus, t)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatDensity(member.bytesPerMegapixel, t("workspace.table.pending", "Pending"))}</TableCell>
      <TableCell className="text-right">{member.anomalyKind && <Badge variant="outline" className="max-w-28 truncate text-[10px]">{anomalyKindLabel(member.anomalyKind, t)}</Badge>}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        <div className="flex items-center justify-end gap-1">
          {formatBytes(member.estimatedSavingsBytes)}
          {member.metadataStatus === "metadata_budget_exceeded" && <Tooltip><TooltipTrigger asChild><Button aria-label={t("workspace.table.deepRetry", "Retry metadata with a deeper read")} title={t("workspace.table.deepRetry", "Retry metadata with a deeper read")} variant="ghost" size="xs" className="size-6 p-0" onClick={() => onDeepRetryMember(member.id)}><RefreshCw /></Button></TooltipTrigger><TooltipContent>{t("workspace.table.deepRetryTooltip", "Retry with a larger read budget")}</TooltipContent></Tooltip>}
        </div>
      </TableCell>
    </TableRow>)}
  </>
}

function metadataStatusLabel(status: string | undefined, t: ReturnType<typeof useNodeI18n>["t"]): string {
  const keys: Record<string, string> = {
    complete: "complete",
    metadata_budget_exceeded: "budgetExceeded",
    unsupported_format: "unsupportedFormat",
    parser_failure: "parserFailure",
    encrypted_member: "encrypted",
  }
  const key = status ? keys[status] : undefined
  return key ? t(`workspace.table.metadataStatuses.${key}`, status) : t("workspace.table.pending", "Pending")
}

function anomalyKindLabel(kind: string, t: ReturnType<typeof useNodeI18n>["t"]): string {
  const keys: Record<string, string> = {
    bytes_per_megapixel_high: "highBytesPerMegapixel",
    member_size_high: "largeMember",
  }
  const key = keys[kind]
  return key ? t(`workspace.table.anomalyKinds.${key}`, kind) : kind
}

function SortableHead({ label, active, descending, onClick, className, t }: { label: string; active: boolean; descending: boolean; onClick(): void; className?: string; t: ReturnType<typeof useNodeI18n>["t"] }) {
  return <TableHead className={className}>
    <Button variant="ghost" size="xs" className="h-6 px-1 text-[11px] font-medium" onClick={onClick}>{label}{active && <span aria-label={descending ? t("workspace.table.descending", "descending") : t("workspace.table.ascending", "ascending")}>{descending ? <ArrowDown /> : <ArrowUp />}</span>}</Button>
  </TableHead>
}

function AnomalyBadge({ count }: { count: number }) {
  if (!count) return <span className="text-muted-foreground">0</span>
  return <Badge variant="destructive" className="gap-1 text-[10px]"><TriangleAlert className="size-3" />{count}</Badge>
}
