import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { NodeRunHistoryItemDTO, NodeRunHistoryStatusDTO } from "@xiranite/shared"
import {
  CheckCircle2,
  CircleAlert,
  CircleSlash,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react"
import { useNodeRunHistory } from "@/hooks/useNodeRunHistory"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { RunStateIcon } from "@/nodes/shared/controls"

const STATUS_ICON: Record<NodeRunHistoryStatusDTO, typeof History> = {
  success: CheckCircle2,
  error: CircleAlert,
  cancelled: CircleSlash,
}

const STATUS_TONE: Record<NodeRunHistoryStatusDTO, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  cancelled: "text-muted-foreground",
}

export interface NodeRunHistoryPopoverProps {
  nodeId: string
  componentId?: string
  /** 最大展示条数，默认 8。 */
  limit?: number
  /** 恢复参数回调；未提供则不显示恢复按钮。 */
  onRestore?: (input: unknown) => void
  /** 打开全局历史中心回调；未提供则不显示入口按钮。 */
  onOpenHistory?: () => void
  disabled?: boolean
}

/**
 * 节点工具栏快速历史 Popover。
 *
 * 参考 ConfigDefaultsPopover 的 `Popover + Tooltip + Button(icon-sm)` 模式。
 * 列表懒加载：仅在 Popover 打开时触发查询。
 */
export function NodeRunHistoryPopover(props: NodeRunHistoryPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const historyQuery = useNodeRunHistory(
    {
      nodeId: props.nodeId,
      componentId: props.componentId,
      limit: props.limit ?? 8,
    },
    { enabled: open },
  )
  const items = historyQuery.data?.items ?? []
  const isLoading = open && historyQuery.isLoading

  function handleRestore(item: NodeRunHistoryItemDTO) {
    props.onRestore?.(item.input)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t("view:history.recent")}
              disabled={props.disabled}
              size="icon-sm"
              variant="outline"
            >
              <History />
              <span className="sr-only">{t("view:history.recent")}</span>
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("view:history.recent")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="text-sm font-semibold">{t("view:history.recent")}</div>
          {items.length > 0 && (
            <div className="text-[10px] font-mono text-muted-foreground">{items.length} 项</div>
          )}
        </div>
        <Separator />
        {isLoading ? (
          <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
            <RunStateIcon className="mr-2 h-3.5 w-3.5" icon={Loader2} running />
            {t("view:history.loading")}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-3 py-6 text-center">
            <History className="mb-1.5 h-5 w-5 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">{t("view:history.empty")}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground/60">{t("view:history.noHistoryHint")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="flex flex-col">
              {items.map((item) => (
                <HistoryRow
                  key={item.id}
                  item={item}
                  canRestore={Boolean(props.onRestore) && item.input !== undefined && item.input !== null}
                  onRestore={() => handleRestore(item)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
        {props.onOpenHistory && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs"
                onClick={() => {
                  props.onOpenHistory?.()
                  setOpen(false)
                }}
              >
                {t("view:history.openCenter")}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function HistoryRow(props: {
  item: NodeRunHistoryItemDTO
  canRestore: boolean
  onRestore: () => void
}) {
  const { t } = useTranslation()
  const Icon = STATUS_ICON[props.item.status]

  return (
    <div className="group flex items-start gap-2 border-b border-border/40 px-3 py-2 last:border-b-0 hover:bg-muted/40">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", STATUS_TONE[props.item.status])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatTime(props.item.finishedAt)}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {t("view:history.duration", { ms: props.item.durationMs })}
          </span>
        </div>
        {props.item.inputSummary && (
          <div className="mt-0.5 truncate text-xs text-foreground">{props.item.inputSummary}</div>
        )}
        {props.item.message && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{props.item.message}</div>
        )}
      </div>
      {props.canRestore && (
        <Button
          variant="ghost"
          size="xs"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={props.onRestore}
        >
          <RotateCcw className="h-3 w-3" />
          {t("view:history.restore")}
        </Button>
      )}
    </div>
  )
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}
