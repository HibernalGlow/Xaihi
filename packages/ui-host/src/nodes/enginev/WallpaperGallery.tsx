import type { NodeHostApi } from "@xiranite/contract"
import type { EngineVWallpaper } from "@xiranite/node-enginev/core"
import { Check, Copy, Image, MousePointer2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { EngineVCardState } from "./types"

type EngineVHost = NodeHostApi<EngineVCardState, Partial<EngineVCardState>>

const SELECTED_ID_PILL_STYLE = {
  background: "var(--primary)",
  borderColor: "var(--primary)",
  color: "var(--primary-foreground)",
} as const

const UNSELECTED_ID_PILL_STYLE = {
  background: "var(--muted-foreground)",
  borderColor: "var(--muted-foreground)",
  color: "var(--background)",
} as const

export function WallpaperGallery(props: {
  columns?: number
  compact?: boolean
  host: EngineVHost
  showMeta?: boolean
  showPath?: boolean
  selectedIds: string[]
  wallpapers: EngineVWallpaper[]
  onCopyPath: (path: string) => void
  onToggle: (id: string) => void
}) {
  const { t: tNode } = useNodeI18n("enginev")
  const selected = new Set(props.selectedIds)
  const visible = props.wallpapers.slice(0, 120)
  const columns = props.columns && props.columns > 0 ? Math.min(6, Math.max(1, props.columns)) : undefined
  const showMeta = props.showMeta ?? true
  const showPath = props.showPath ?? true

  if (!visible.length) {
    return (
      <div className={cn("flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background/50 text-center text-muted-foreground", props.compact ? "min-h-16 p-2" : "min-h-48 p-6")}>
        <Image className={props.compact ? "size-6" : "size-8"} />
        <div className="text-sm font-medium text-foreground">{tNode("empty.gallery", "还没有画廊数据")}</div>
        <p className={cn("max-w-sm text-xs", props.compact && "hidden")}>{tNode("empty.galleryHint", "选择 Wallpaper Engine 工坊目录后运行扫描，图片预览会直接使用本地文件 URL 显示。")}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full min-h-0 flex-1">
      <div
        className={cn("grid p-0.5", props.compact ? "gap-1.5" : "gap-2", !columns && "@2xl/enginev:grid-cols-2 @5xl/enginev:grid-cols-3")}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {visible.map((item) => (
          <WallpaperTile
            key={item.workshopId}
            compact={props.compact}
            host={props.host}
            item={item}
            selected={selected.has(item.workshopId)}
            showMeta={showMeta}
            showPath={showPath}
            onCopyPath={props.onCopyPath}
            onToggle={props.onToggle}
          />
        ))}
      </div>
      {props.wallpapers.length > visible.length && (
        <div className="py-3 text-center text-xs text-muted-foreground">
          {tNode("empty.truncatedItems", "仅显示前 {{visible}} 项，共 {{total}} 项。", { visible: visible.length, total: props.wallpapers.length })}
        </div>
      )}
    </ScrollArea>
  )
}

function WallpaperTile(props: {
  compact?: boolean
  host: EngineVHost
  item: EngineVWallpaper
  selected: boolean
  showMeta: boolean
  showPath: boolean
  onCopyPath: (path: string) => void
  onToggle: (id: string) => void
}) {
  const { t: tNode } = useNodeI18n("enginev")
  const previewPath = resolvePreviewPath(props.item)
  const previewUrl = previewPath
    ? isRemoteUrl(previewPath) ? previewPath : props.host.localFiles?.getUrl(previewPath)
    : undefined
  const title = props.item.title || props.item.folderName

  return (
    <article
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-lg border bg-background/70 transition-colors hover:border-primary/50",
        props.selected && "border-primary bg-primary/5",
      )}
    >
      <button
        aria-label={tNode("aria.selectWallpaper", "选择 {{title}}", { title })}
        className="block w-full text-left"
        type="button"
        onClick={() => props.onToggle(props.item.workshopId)}
      >
        <div className="relative aspect-video overflow-hidden bg-muted/70">
          {previewUrl ? (
            <img
              data-enginev-preview="true"
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              src={previewUrl}
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground">
              <Image />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-black/65 to-transparent" />
          <div className="absolute left-2 top-2 flex gap-1">
            <Badge
              data-enginev-wallpaper-selection={props.item.workshopId}
              variant={props.selected ? "default" : "secondary"}
              className="gap-1"
              style={props.selected ? SELECTED_ID_PILL_STYLE : UNSELECTED_ID_PILL_STYLE}
            >
              {props.selected ? <Check className="size-3" /> : <MousePointer2 className="size-3" />}
              {props.item.workshopId}
            </Badge>
          </div>
          <div className="absolute bottom-2 left-2 right-2 min-w-0 text-white">
            <div className="truncate text-xs font-semibold">{title}</div>
            {props.showMeta && (
              <div className="mt-0.5 truncate text-[11px] text-white/75">
                {props.item.wallpaperType || tNode("unknown", "unknown")} · {props.item.contentRating || tNode("unrated", "unrated")} · {formatBytes(props.item.size)}
              </div>
            )}
          </div>
        </div>
      </button>
      <div className={cn("flex min-w-0 items-center justify-between gap-2 px-2", props.compact ? "py-1" : "py-1.5")}>
        {props.showPath ? (
          <div className="min-w-0 truncate text-[11px] text-muted-foreground">{compactPath(props.item.path)}</div>
        ) : (
          <div className="min-w-0 truncate text-[11px] text-muted-foreground">{props.item.folderName}</div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label={tNode("aria.copyWallpaperPath", "复制 {{title}} 路径", { title })} size="icon-xs" variant="ghost" onClick={() => props.onCopyPath(props.item.path)}>
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tNode("aria.copyPath", "复制路径")}</TooltipContent>
        </Tooltip>
      </div>
    </article>
  )
}

function resolvePreviewPath(item: EngineVWallpaper): string {
  const preview = item.preview.trim()
  if (!preview) return ""
  if (isRemoteUrl(preview)) return preview
  if (/^[A-Za-z]:[\\/]/.test(preview) || preview.startsWith("/") || preview.startsWith("\\\\")) return preview
  const separator = item.path.includes("\\") ? "\\" : "/"
  return `${item.path.replace(/[\\/]+$/, "")}${separator}${preview.replace(/^[\\/]+/, "")}`
}

function isRemoteUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
}

function compactPath(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/").filter(Boolean)
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : value
}

function formatBytes(value: number): string {
  if (!value) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
