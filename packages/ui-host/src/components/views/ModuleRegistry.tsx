import * as React from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { FilterFn } from "@tanstack/react-table"
import { ArrowRight, BookOpen, GripVertical, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { DataTable } from "@/components/niko-table/core/data-table"
import { DataTableRoot } from "@/components/niko-table/core/data-table-root"
import { DataTableBody, DataTableHeader } from "@/components/niko-table/core/data-table-structure"
import { useDataTable } from "@/components/niko-table/core/data-table-context"
import { TableClearFilter } from "@/components/niko-table/filters/table-clear-filter"
import { TableFacetedFilter } from "@/components/niko-table/filters/table-faceted-filter"
import { TableSearchFilter } from "@/components/niko-table/filters/table-search-filter"
import type { DataTableColumnDef, Option } from "@/components/niko-table/types"
import { NodeHelpSheet } from "@/components/help/NodeHelpSheet"
import { hasNodeHelp } from "@/components/help/nodeHelpRegistry"
import { MODULE_REGISTRY } from "@/components/modules/registry"
import { useContributedModules } from "@/plugins/useContributedModules"
import { resolveModuleIcon } from "@/components/modules/moduleIconRegistry"
import { useWorkspaceActions, useWorkspaceSelector } from "@/store/workspaceStore"
import { setModuleDragData } from "@/lib/moduleDragDrop"
import { OverlayViewShell } from "@/components/workspace/OverlayViewShell"
import type { ModuleDef } from "@/types/workspace"

interface ModuleRow {
  id: string
  name: string
  version: string
  category: string
  description: string
  keywords: string
  icon: string
}

type I18n = ReturnType<typeof useTranslation>["i18n"]

function toModuleRow(module: ModuleDef, t: TFunction, i18n: I18n): ModuleRow {
  const nameKey = `module:${module.id}.name`
  const descKey = `module:${module.id}.description`
  return {
    id: module.id,
    name: i18n.exists(nameKey) ? t(nameKey) : module.name,
    version: module.version,
    category: module.category,
    description: i18n.exists(descKey) ? t(descKey) : module.description,
    keywords: `${module.id} ${module.name} ${module.category} ${module.description}`,
    icon: module.icon,
  }
}

// One haystack per row instead of TanStack's default cell walk: the module id is only
// rendered under the name, so a cell-based search would never match `kisaki`.
const moduleGlobalFilter: FilterFn<ModuleRow> = (row, _columnId, filterValue) => {
  const query = String(filterValue ?? "").trim().toLowerCase()
  if (!query) return true
  return row.original.keywords.toLowerCase().includes(query)
}

function ModuleIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = resolveModuleIcon(icon, Package)
  return <Icon className={className} />
}

function ModuleIdentityCell({
  item,
  hasHelp,
  onOpenHelp,
}: {
  item: ModuleRow
  hasHelp: boolean
  onOpenHelp: (item: ModuleRow) => void
}) {
  const { t } = useTranslation()
  const helpLabel = t("registry:help.open", { name: item.name })
  return (
    <div className="flex min-w-0 items-start gap-2 py-1">
      <div
        className="group/module-drag flex min-w-0 flex-1 cursor-grab items-start gap-2 active:cursor-grabbing"
        draggable
        data-module-id={item.id}
        onDragStart={(event) => setModuleDragData(event, item.id)}
        title={t("registry:dragHint")}
      >
        <span className="mt-0.5 grid h-6 w-4 shrink-0 place-items-center text-muted-foreground/60 group-hover/module-drag:text-primary">
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-sm border border-border/60 bg-muted/30 text-muted-foreground group-hover/module-drag:border-primary/40 group-hover/module-drag:text-primary">
          <ModuleIcon icon={item.icon} className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
          <span className="block truncate text-[10px] font-mono text-muted-foreground">{item.id}</span>
        </span>
      </div>
      {hasHelp && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={helpLabel}
              title={helpLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onOpenHelp(item)
              }}
            >
              <BookOpen data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("registry:help.tooltip")}</TooltipContent>
        </Tooltip>
      )}
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-sm border border-primary/35 bg-primary/10 text-primary"
        title={t("registry:deployToCurrent")}
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </div>
  )
}

function categoryLabel(category: string, t: TFunction, i18n: I18n): string {
  const key = `registry:categories.${category}`
  return i18n.exists(key) ? t(key) : category
}

function buildColumns(
  t: TFunction,
  i18n: I18n,
  onOpenHelp: (item: ModuleRow) => void,
): DataTableColumnDef<ModuleRow, unknown>[] {
  return [
    {
      id: "module",
      accessorFn: (row) => row.name,
      size: 210,
      header: t("registry:module"),
      cell: ({ row }) => (
        <ModuleIdentityCell
          item={row.original}
          hasHelp={hasNodeHelp(row.original.id)}
          onOpenHelp={onOpenHelp}
        />
      ),
    },
    {
      accessorKey: "description",
      size: 190,
      header: t("registry:description"),
      cell: ({ row }) => (
        <div
          className="line-clamp-2 min-w-0 break-words text-xs text-muted-foreground"
          title={row.original.description}
        >
          {row.original.description}
        </div>
      ),
    },
    {
      accessorKey: "category",
      size: 88,
      header: t("registry:category"),
      meta: { variant: "multiSelect" },
      cell: ({ row }) => <Badge variant="outline">{categoryLabel(row.original.category, t, i18n)}</Badge>,
    },
    {
      accessorKey: "version",
      size: 64,
      header: t("registry:version"),
      cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.version}</span>,
    },
  ]
}

// Plugin-contributed modules are part of the catalog, so their categories have to
// appear in the filter too.
function buildCategoryOptions(modules: readonly ModuleDef[], t: TFunction, i18n: I18n): Option[] {
  const categories = Array.from(new Set(modules.map((module) => module.category))).sort((a, b) => a.localeCompare(b))
  return categories.map((category) => ({ value: category, label: categoryLabel(category, t, i18n) }))
}

function RegistryToolbar({
  categories,
  filterLabel,
  resetLabel,
  searchPlaceholder,
}: {
  categories: Option[]
  filterLabel: string
  resetLabel: string
  searchPlaceholder: string
}) {
  const { table } = useDataTable<ModuleRow>()
  const categoryColumn = table.getColumn("category")

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TableSearchFilter table={table} placeholder={searchPlaceholder} className="w-full max-w-80" />
      {categoryColumn && (
        <TableFacetedFilter column={categoryColumn} title={filterLabel} options={categories} multiple />
      )}
      <TableClearFilter table={table}>{resetLabel}</TableClearFilter>
    </div>
  )
}

export function ModuleRegistry() {
  const { t, i18n } = useTranslation()
  const viewMode = useWorkspaceSelector((state) => state.viewMode)
  const workspaceActions = useWorkspaceActions()
  const contributed = useContributedModules()
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [helpModuleId, setHelpModuleId] = React.useState<string | null>(null)
  const catalog = React.useMemo(() => [...MODULE_REGISTRY, ...contributed], [contributed])
  const modules = React.useMemo(
    () => catalog.map((module) => toModuleRow(module, t, i18n)),
    [catalog, t, i18n],
  )
  const openHelp = React.useCallback((item: ModuleRow) => {
    React.startTransition(() => {
      setHelpModuleId(item.id)
      setHelpOpen(true)
    })
  }, [])
  const columns = React.useMemo(() => buildColumns(t, i18n, openHelp), [t, i18n, openHelp])
  const categories = React.useMemo(() => buildCategoryOptions(catalog, t, i18n), [catalog, t, i18n])
  const activeHelpModule = React.useMemo(
    () => modules.find((module) => module.id === helpModuleId) ?? null,
    [helpModuleId, modules],
  )
  const deployToCurrentView = React.useCallback(
    (row: ModuleRow) => workspaceActions.deployComponent(row.id, viewMode),
    [viewMode, workspaceActions],
  )

  return (
    <TooltipProvider>
      <OverlayViewShell
        className="bg-card"
        header={
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">{t("registry:title")}</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("registry:subtitle")}</p>
            </div>
            <div className="rounded-sm border border-border/60 bg-muted/20 px-2 py-1 text-[10px] font-mono text-muted-foreground">
              {modules.length}
            </div>
          </div>
        }
        bodyClassName="px-3 pb-3 [scrollbar-gutter:stable]"
      >
        <DataTableRoot<ModuleRow, unknown>
          className="space-y-2"
          columns={columns}
          data={modules}
          getRowId={(row) => row.id}
          globalFilterFn={moduleGlobalFilter}
          config={{
            enableFilters: true,
            enablePagination: false,
            enableRowSelection: false,
            enableSorting: true,
          }}
        >
          <RegistryToolbar
            categories={categories}
            filterLabel={t("registry:filter")}
            resetLabel={t("common:reset")}
            searchPlaceholder={t("registry:searchPlaceholder")}
          />
          <DataTable>
            <DataTableHeader />
            <DataTableBody<ModuleRow> onRowClick={deployToCurrentView} />
          </DataTable>
        </DataTableRoot>
      </OverlayViewShell>
      <NodeHelpSheet
        open={helpOpen}
        moduleId={activeHelpModule?.id ?? null}
        moduleName={activeHelpModule?.name}
        version={activeHelpModule?.version}
        category={activeHelpModule?.category}
        onOpenChange={setHelpOpen}
      />
    </TooltipProvider>
  )
}
