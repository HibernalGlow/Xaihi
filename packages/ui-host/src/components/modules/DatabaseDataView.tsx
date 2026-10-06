/**
 * DatabaseModule — Notion 式表格视图（基于 ocean-dataview）。
 *
 * 实现要点：
 * 1. 数据源同 store.components + MODULE_REGISTRY —— 与卡片注册 / CardView / DockviewView /
 *    FlowView / LaneView 共享同一份 ComponentInstance[]。这里仅做"派生视图"：
 *    将 ComponentInstance + ModuleDef 映射为 DatabaseRow[]（计算属性，无独立状态）。
 * 2. 使用 ocean-dataview 的 DataViewProvider + TableView + usePageController：
 *    - usePageController 把 store 数据包装成 queryFn（同步内存数据）
 *      在 queryFn 内应用 search / filter / sort / 分页
 *    - DataViewProvider 提供 context（properties / controller / defaults）
 *    - NotionToolbar 提供 search / filter / sort / settings UI（基于 nuqs URL 状态）
 *    - TableView 自动从 properties 生成列
 * 3. tags 直接挂到 ComponentInstance.tags（store action: SET_COMPONENT_TAGS），
 *    与所有 viewMode 共享，跨会话持久化。
 * 4. visibility 通过 formula cell 嵌入 4 个 viewMode 切换按钮
 * 5. actions 通过 button property 返回 ButtonAction[]
 *
 * 数据流：store.components → visibleComponents → computeRows() → queryFn → ocean TableView
 */
import * as React from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { useInfiniteController } from "@hibernalglow/ocean-dataview/hooks"
import { DataViewProvider } from "@hibernalglow/ocean-dataview/providers"
import { NotionToolbar } from "@hibernalglow/ocean-dataview/toolbars/notion"
import "@hibernalglow/ocean-dataview/styles.css"
import type { TableViewProps } from "@hibernalglow/ocean-dataview/views/table-view"
import type { ListViewProps } from "@hibernalglow/ocean-dataview/views/list-view"
import type { GalleryViewProps } from "@hibernalglow/ocean-dataview/views/gallery-view"
import type { BoardViewProps } from "@hibernalglow/ocean-dataview/views/board-view"
import type {
  BadgeColor,
  BasePaginatedResponse,
  BulkAction,
  DataViewProperty,
  SearchQuery,
  SortQuery,
  WhereNode,
} from "@hibernalglow/ocean-dataview/types"

import { useWorkspaceActions, useWorkspaceVisibleComponents } from "@/store/workspaceStore"
import { getModule, MODULE_REGISTRY } from "@/components/modules/registry"
import type { ModuleProps } from "./ModuleRenderer"
import type { ComponentInstance, ViewMode } from "@/types/workspace"

import { Eye, EyeOff, Tag, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { isComponentVisibleInView } from "@/lib/componentVisibility"

type ComponentVisibilityMode = Exclude<ViewMode, "dashboard">

const VIEW_MODES: ComponentVisibilityMode[] = ["cards", "dockview", "flow", "lane", "bento"]

// 从 comp-${counter}-${timestamp} 解析部署时间戳
function parseCreatedAt(id: string): number {
  const parts = id.split("-")
  const last = parts[parts.length - 1]
  const n = Number(last)
  return Number.isFinite(n) ? n : 0
}

function formatTime(ts: number): string {
  if (!ts || Number.isNaN(ts)) return "—"
  const d = new Date(ts)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

// ── DatabaseRow：派生视图模型 ────────────────────────────────────────────────
// 不维护独立状态 — 每次都从 store.components + MODULE_REGISTRY 计算。
// 写回时通过 SET_COMPONENT_TAGS / TOGGLE_COMPONENT_VISIBILITY 修改 store.components。
interface DatabaseRow {
  id: string
  moduleId: string
  moduleName: string
  category: string
  state: string
  visibilityCount: number
  visibilityIn: Record<ComponentVisibilityMode, boolean>
  tags: string[]
  createdAt: number
  dataKeys: number
  // 反向引用，用于写回 action
  _comp: ComponentInstance
}

const TableView = Object.assign(React.lazy(async () => {
  const mod = await import("@hibernalglow/ocean-dataview/views/table-view")
  return { default: mod.TableView as React.ComponentType<TableViewProps<DatabaseRow>> }
}), { dataViewType: "table" as const, defaultLimit: 25 })

const ListView = Object.assign(React.lazy(async () => {
  const mod = await import("@hibernalglow/ocean-dataview/views/list-view")
  return { default: mod.ListView as React.ComponentType<ListViewProps<DatabaseRow>> }
}), { dataViewType: "list" as const, defaultLimit: 25 })

const GalleryView = Object.assign(React.lazy(async () => {
  const mod = await import("@hibernalglow/ocean-dataview/views/gallery-view")
  return { default: mod.GalleryView as React.ComponentType<GalleryViewProps<DatabaseRow>> }
}), { dataViewType: "gallery" as const, defaultLimit: 50 })

const BoardView = Object.assign(React.lazy(async () => {
  const mod = await import("@hibernalglow/ocean-dataview/views/board-view")
  return { default: mod.BoardView as React.ComponentType<BoardViewProps<DatabaseRow>> }
}), { dataViewType: "board" as const, defaultLimit: 25 })

function toDatabaseRow(comp: ComponentInstance): DatabaseRow {
  const mod = getModule(comp.moduleId)
  return {
    id: comp.id,
    moduleId: comp.moduleId,
    moduleName: mod?.name ?? comp.moduleId,
    category: mod?.category ?? "—",
    state: comp.state,
    visibilityCount: VIEW_MODES.filter(m => isComponentVisibleInView(comp, m)).length,
    visibilityIn: Object.fromEntries(
      VIEW_MODES.map(m => [m, isComponentVisibleInView(comp, m)])
    ) as Record<ComponentVisibilityMode, boolean>,
    tags: comp.tags ?? [],
    createdAt: parseCreatedAt(comp.id),
    dataKeys: comp.data ? Object.keys(comp.data).length : 0,
    _comp: comp,
  }
}

// ── Tags cell：行内编辑 ─────────────────────────────────────────────────────
function TagsCell({ item }: { item: DatabaseRow }) {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const comp = item._comp
  const tags = comp.tags ?? []
  const [input, setInput] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

  const commit = (next: string[]) => workspaceActions.setComponentTags(comp.id, next)

  return (
    <div className="flex flex-wrap items-center gap-1 py-0.5">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 text-[9px] py-0 px-1 rounded bg-badge-gray-subtle text-badge-gray-subtle-foreground"
        >
          <Tag className="h-2.5 w-2.5" />
          {tag}
          <button
            onClick={() => commit(tags.filter(x => x !== tag))}
            className="hover:text-destructive ml-0.5"
            aria-label={`${t("common:remove")} ${tag}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            const text = input.trim()
            if (!text || tags.includes(text)) {
              setInput("")
              return
            }
            commit([...tags, text])
            setInput("")
          }
          if (e.key === "Backspace" && !input && tags.length > 0) {
            commit(tags.slice(0, -1))
          }
        }}
        placeholder={t("view:database.addTag")}
        className="bg-transparent text-[10px] outline-none w-16 placeholder:text-muted-foreground/60 focus:bg-background focus:px-1 focus:rounded focus:border focus:border-border/60"
      />
    </div>
  )
}

// ── Visibility cell：4 个 viewMode 切换按钮 ─────────────────────────────────
function VisibilityCell({ item }: { item: DatabaseRow }) {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const comp = item._comp
  return (
    <div className="flex items-center gap-1">
      {VIEW_MODES.map(m => {
        const visible = isComponentVisibleInView(comp, m)
        return (
          <button
            key={m}
            onClick={() => workspaceActions.toggleComponentVisibility(comp.id, m)}
            title={`${t(`view:database.viewModes.${m}`)}: ${visible ? t("common:expand") : t("common:collapse")}`}
            className={cn(
              "h-5 w-5 grid place-items-center rounded border text-[8px] uppercase",
              visible
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground/40 hover:text-foreground"
            )}
          >
            {visible ? <Eye className="h-2.5 w-2.5" /> : <EyeOff className="h-2.5 w-2.5" />}
          </button>
        )
      })}
    </div>
  )
}

// ── properties 定义 ─────────────────────────────────────────────────────────
// ocean 的 property 系统支持 text / number / select / formula / button 等类型。
// formula 用于自定义 cell 渲染（moduleName / visibility / tags / createdAtDisplay）。
// button 用于行级 actions。
// hidden backing text/number property 为 sort 提供后端字段（sortBy 指向其 id）。
function buildProperties(
  workspaceActions: ReturnType<typeof useWorkspaceActions>,
  t: TFunction,
): readonly DataViewProperty<DatabaseRow>[] {
  return [
    // hidden backing properties — 为 sort/search 提供字段
    {
      id: "moduleName",
      type: "text" as const,
      key: "moduleName",
      hidden: true,
      enableFilter: false,
      enableGroup: false,
      enableSearch: true,
    },
    {
      id: "createdAt",
      type: "number" as const,
      key: "createdAt",
      hidden: true,
      enableFilter: false,
      enableGroup: false,
      enableSearch: false,
    },
    // _comp 反向引用 — ocean 的 transformData 会剥离未声明的字段，
    // 所以必须把它声明为 hidden backing property 才能在 formula cell 中访问
    {
      id: "_comp",
      type: "text" as const,
      key: "_comp",
      hidden: true,
      enableFilter: false,
      enableGroup: false,
      enableSearch: false,
    },
    // id — 用于 moduleDisplay formula 中显示 comp.id
    {
      id: "rowId",
      type: "text" as const,
      key: "id",
      hidden: true,
      enableFilter: false,
      enableGroup: false,
      enableSearch: false,
    },
    // visible properties
    {
      id: "moduleDisplay",
      type: "formula" as const,
      name: t("view:database.moduleName"),
      size: 220,
      sortBy: "moduleName",
      enableFilter: false,
      enableGroup: false,
      enableSearch: false,
      value: (_property, item) => (
        <div className="flex flex-col">
          <span className="font-semibold text-sm">{item.moduleName}</span>
          <span className="text-[9px] text-muted-foreground font-mono">{item.id}</span>
        </div>
      ),
    },
    {
      id: "category",
      type: "select" as const,
      key: "category",
      name: t("view:database.category"),
      size: 120,
      enableSearch: true,
      config: {
        options: Array.from(new Set(MODULE_REGISTRY.map(m => m.category))).map(c => ({
          label: t(`registry:categories.${c}`),
          value: c,
          color: "gray" as BadgeColor,
        })),
      },
    },
    {
      id: "state",
      type: "select" as const,
      key: "state",
      name: t("view:database.state"),
      size: 120,
      enableSearch: true,
      config: {
        options: ["docked", "floating", "focused", "fullscreen", "compact"].map(s => ({
          label: t(`common:state.${s}`),
          value: s,
          color: "blue" as BadgeColor,
        })),
      },
    },
    {
      id: "visibility",
      type: "formula" as const,
      name: t("view:database.visibleIn"),
      size: 180,
      enableFilter: false,
      enableSort: false,
      enableGroup: false,
      enableSearch: false,
      value: (_property, item) => <VisibilityCell item={item} />,
    },
    {
      id: "tags",
      type: "formula" as const,
      name: t("view:database.tags"),
      size: 200,
      enableFilter: false,
      enableSort: false,
      enableGroup: false,
      enableSearch: true,
      value: (_property, item) => <TagsCell item={item} />,
    },
    {
      id: "createdAtDisplay",
      type: "formula" as const,
      name: t("view:database.created"),
      size: 140,
      enableFilter: false,
      enableGroup: false,
      enableSearch: false,
      sortBy: "createdAt",
      value: (_property, item) => (
        <span className="text-muted-foreground text-[10px] font-mono">
          {formatTime(item.createdAt)}
        </span>
      ),
    },
    {
      id: "dataKeys",
      type: "number" as const,
      key: "dataKeys",
      name: t("view:database.data"),
      size: 80,
      enableFilter: false,
      enableGroup: false,
      enableSearch: false,
    },
    {
      id: "actions",
      type: "button" as const,
      name: t("view:database.actions"),
      size: 50,
      enableFilter: false,
      enableSort: false,
      enableGroup: false,
      enableSearch: false,
      value: (item: DatabaseRow) => VIEW_MODES.map(m => ({
        label: `${t("view:database.viewModes." + m)}`,
        onClick: () => workspaceActions.toggleComponentVisibility(item._comp.id, m),
      })),
    },
  ]
}

// ── queryFn 内的过滤 / 排序 / 搜索 ──────────────────────────────────────────
// ocean 把 filter / search / sort 通过 queryFn params 传给后端。
// 我们是前端内存数据，需要在 queryFn 内应用这些参数。

function isWhereExpr(node: WhereNode): node is { and?: WhereNode[]; or?: WhereNode[] } {
  return "and" in node || "or" in node
}

function matchWhereRule(row: DatabaseRow, rule: { property: string; condition: string; value?: unknown }): boolean {
  const value = (row as unknown as Record<string, unknown>)[rule.property]
  switch (rule.condition) {
    case "eq": return value === rule.value
    case "ne": return value !== rule.value
    case "inArray": return Array.isArray(rule.value) && rule.value.includes(value)
    case "notInArray": return Array.isArray(rule.value) && !rule.value.includes(value)
    case "iLike":
      return String(value ?? "").toLowerCase().includes(String(rule.value ?? "").toLowerCase())
    case "notILike":
      return !String(value ?? "").toLowerCase().includes(String(rule.value ?? "").toLowerCase())
    case "isEmpty":
      return value == null || (Array.isArray(value) && value.length === 0) || value === ""
    case "isNotEmpty":
      return value != null && (!Array.isArray(value) || value.length > 0) && value !== ""
    case "startsWith":
      return String(value ?? "").startsWith(String(rule.value ?? ""))
    case "endsWith":
      return String(value ?? "").endsWith(String(rule.value ?? ""))
    case "lt": return Number(value) < Number(rule.value)
    case "lte": return Number(value) <= Number(rule.value)
    case "gt": return Number(value) > Number(rule.value)
    case "gte": return Number(value) >= Number(rule.value)
    default: return true // unsupported condition, skip
  }
}

function matchWhereNode(row: DatabaseRow, node: WhereNode): boolean {
  if (isWhereExpr(node)) {
    if (node.and) return node.and.every(n => matchWhereNode(row, n))
    if (node.or) return node.or.some(n => matchWhereNode(row, n))
    return true
  }
  return matchWhereRule(row, node)
}

function applyFilter(rows: DatabaseRow[], filter: WhereNode[] | null): DatabaseRow[] {
  if (!filter || filter.length === 0) return rows
  return rows.filter(row => filter.every(node => matchWhereNode(row, node)))
}

function applySearch(rows: DatabaseRow[], search: SearchQuery | null): DatabaseRow[] {
  if (!search || !search.search) return rows
  const q = search.search.toLowerCase()
  const fields = search.searchFields?.length ? search.searchFields : ["moduleName", "category", "state", "tags"]
  return rows.filter(row => {
    return fields.some(field => {
      const value = (row as unknown as Record<string, unknown>)[field]
      if (value == null) return false
      if (Array.isArray(value)) return value.some(v => String(v).toLowerCase().includes(q))
      return String(value).toLowerCase().includes(q)
    })
  })
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  const sa = String(a ?? "")
  const sb = String(b ?? "")
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

function applySort(rows: DatabaseRow[], sort: SortQuery[] | undefined): DatabaseRow[] {
  if (!sort || sort.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const s of sort) {
      const av = (a as unknown as Record<string, unknown>)[s.property]
      const bv = (b as unknown as Record<string, unknown>)[s.property]
      if (av === bv) continue
      const cmp = compareValues(av, bv)
      return s.direction === "desc" ? -cmp : cmp
    }
    return 0
  })
}

// ── query options 类型 ──────────────────────────────────────────────────────
// useInfiniteController 的泛型 TQueryOptions — 兼容 useSuspenseInfiniteQuery 的 options 形状。
// 必须用 InfiniteController：BoardView 强制要求；且 provider 内部根据 controller 类型
// 切换 PageQueryBridge / InfiniteQueryBridge，Infinite 对 table/list/gallery/board 都兼容。
type DatabaseQueryOptions = {
  queryKey: readonly unknown[]
  queryFn: (ctx: { pageParam: unknown }) => Promise<BasePaginatedResponse<DatabaseRow>>
  // pageParam 是 cursor 字符串（首次为 initialPageParam）；返回 undefined 终止分页
  getNextPageParam: (lastPage: BasePaginatedResponse<DatabaseRow>) => string | undefined
  initialPageParam: string
}

// ── View 切换 tabs 类型 ─────────────────────────────────────────────────────
// 注意：与 Xiranite 的 ViewMode (cards/dockview/flow/lane) 区分，这里是 ocean 数据视图切换
type DataViewMode = "table" | "list" | "gallery" | "board"

export default function DatabaseDataView({ compId, initialViewMode = "table" }: ModuleProps & { initialViewMode?: DataViewMode }) {
  void compId // 模块本身不维护本地状态——数据源同 store.components
  const { t } = useTranslation()
  const visibleComponents = useWorkspaceVisibleComponents()
  const workspaceActions = useWorkspaceActions()
  const [viewMode, setViewMode] = React.useState<DataViewMode>(initialViewMode)

  // ref 保存最新数据 — 因为 dataQuery 用 useCallback([]) 缓存，闭包捕获的是初始 visibleComponents。
  // 通过 ref 在 queryFn 内部读取最新值。
  const visibleComponentsRef = React.useRef(visibleComponents)
  visibleComponentsRef.current = visibleComponents

  // properties 数组 — dispatch 引用稳定，所以 properties 也稳定
  const properties = React.useMemo(
    () => buildProperties(workspaceActions, t),
    [workspaceActions, t],
  )

  // dataQuery 工厂 — 把 store 数据包装成 infinite query options
  // useInfiniteController 内部用 ref 缓存 dataQuery，所以不需要外层 useCallback 稳定引用。
  // pageParam 是 cursor 字符串：首次为 initialPageParam ("0")，后续为上一次 endCursor
  const { controller } = useInfiniteController<DatabaseQueryOptions>({
    dataQuery: (params) => ({
      queryKey: [
        "xiranite",
        "database",
        visibleComponentsRef.current,
        params.search,
        params.sort,
        params.filter,
        params.limit,
      ] as const,
      initialPageParam: "0",
      getNextPageParam: (lastPage: BasePaginatedResponse<DatabaseRow>) => {
        // hasNextPage 为 boolean 时返回 endCursor；否则终止
        if (typeof lastPage.hasNextPage === "boolean" && lastPage.hasNextPage) {
          return lastPage.endCursor == null ? undefined : String(lastPage.endCursor)
        }
        return undefined
      },
      queryFn: async ({ pageParam }: { pageParam: unknown }) => {
        const comps = visibleComponentsRef.current
        let rows = comps.map(toDatabaseRow)
        rows = applySearch(rows, params.search)
        rows = applyFilter(rows, params.filter)
        rows = applySort(rows, params.sort)
        // pageParam 是 cursor 字符串（首次为 "0"）
        const cursor = pageParam != null ? Number(pageParam) : 0
        const limit = params.limit
        const start = Number.isFinite(cursor) ? cursor : 0
        const page = rows.slice(start, start + limit)
        return {
          items: page,
          hasNextPage: start + limit < rows.length,
          endCursor: start + limit < rows.length ? String(start + limit) : null,
        }
      },
    }),
    // ── columnQuery：BoardView 看板列计数 ─────────────────────────────────
    // 按 groupBy.propertyId（如 "state"）对应的 key 分组计数。
    // 返回 { counts: Record<value, { count, hasMore }>, sortValues? }。
    // hasMore=false：内存数据全量加载，单页内不需要 loadMore。
    columnQuery: (params) => ({
      queryKey: [
        "xiranite",
        "database",
        "column-counts",
        visibleComponentsRef.current,
        params.groupBy,
        params.search,
        params.filter,
      ] as const,
      queryFn: async () => {
        const comps = visibleComponentsRef.current
        let rows = comps.map(toDatabaseRow)
        rows = applySearch(rows, params.search)
        rows = applyFilter(rows, params.filter)
        const propId = params.groupBy.propertyId
        // 从 properties 里取该 property 的 key（一般 id === key）
        const prop = properties.find(p => p.id === propId)
        const key = (prop && "key" in prop ? prop.key : propId) as keyof DatabaseRow
        const counts: Record<string, { count: number; hasMore: boolean }> = {}
        for (const r of rows) {
          const v = String((r as unknown as Record<string, unknown>)[key] ?? "")
          if (!counts[v]) counts[v] = { count: 0, hasMore: false }
          counts[v].count++
        }
        return { counts }
      },
    }),
  })

  // bulkActions — 启用行选择 + 浮动操作栏
  const bulkActions = React.useMemo<BulkAction<DatabaseRow>[]>(() => [
    {
      label: t("view:database.showInCards"),
      onClick: (items) => {
        items.forEach(r => {
          if (!r.visibilityIn.cards) {
            workspaceActions.toggleComponentVisibility(r._comp.id, "cards")
          }
        })
      },
    },
    {
      label: t("view:database.hideInCards"),
      onClick: (items) => {
        items.forEach(r => {
          if (r.visibilityIn.cards) {
            workspaceActions.toggleComponentVisibility(r._comp.id, "cards")
          }
        })
      },
    },
  ], [workspaceActions, t])
  const viewFallback = (
    <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
      {t("common:loading")}
    </div>
  )

  if (visibleComponents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <p className="text-sm font-mono text-muted-foreground">
            {t("view:database.empty")}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground/60">
            {t("view:database.emptyHint")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <React.Suspense fallback={viewFallback}>
        <DataViewProvider
          controller={controller}
          properties={properties}
          defaults={{ limit: 25, column: { propertyId: "state", propertyType: "select" } }}
          className="h-full flex flex-col"
        >
          <NotionToolbar
            enableSearch
            enableFilter
            enableSort
            enableSettings
          >
            <ViewTabs
              value={viewMode}
              onChange={setViewMode}
              tabs={[
                { value: "table", label: t("view:database.tabs.table") },
                { value: "list", label: t("view:database.tabs.list") },
                { value: "gallery", label: t("view:database.tabs.gallery") },
                { value: "board", label: t("view:database.tabs.board") },
              ]}
            />
          </NotionToolbar>
          {viewMode === "table" && (
            <TableView
              bulkActions={bulkActions}
              pagination="loadMore"
              showPropertyNames
              showVerticalLines
              stickyHeader={{ enabled: true, offset: 0 }}
            />
          )}
          {viewMode === "list" && (
            <ListView pagination="loadMore" />
          )}
          {viewMode === "gallery" && (
            <GalleryView pagination="loadMore" />
          )}
          {viewMode === "board" && (
            <BoardView pagination="loadMore" />
          )}
        </DataViewProvider>
      </React.Suspense>
    </div>
  )
}

// ── View 切换 tabs ──────────────────────────────────────────────────────────
// (DataViewMode 类型已在文件顶部声明)

function ViewTabs({
  value,
  onChange,
  tabs,
}: {
  value: DataViewMode
  onChange: (v: DataViewMode) => void
  tabs: { value: DataViewMode; label: string }[]
}) {
  return (
    <div className="flex items-center gap-0.5">
      {tabs.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "h-7 px-3 rounded text-xs font-medium transition-colors",
            value === t.value
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
