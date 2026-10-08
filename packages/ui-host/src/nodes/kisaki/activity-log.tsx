import { useState } from "react"
import type { KisakiActivityLogEntry } from "@hibernalglow/xaihi-kisaki/activity-log"
import { filterKisakiActivityLog, formatKisakiActivityLogEntry, serializeKisakiActivityLog } from "@hibernalglow/xaihi-kisaki/activity-log"
import { Copy, ListFilter, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

export function KisakiActivityLogView({ entries, onClear, onCopyText }: { entries: KisakiActivityLogEntry[]; onClear: () => void; onCopyText?: (text: string) => Promise<void> | void }) {
  const { t } = useNodeI18n("kisaki")
  const [query, setQuery] = useState("")
  const filtered = filterKisakiActivityLog(entries, query)
  return <section className="grid gap-2" data-testid="czkawka-activity-log"><div className="flex items-center justify-between gap-1"><div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ListFilter className="size-3" />{t("activity.title", "活动日志")} <Badge variant="outline" className="h-4 px-1 text-[9px]">{filtered.length}/{entries.length}</Badge></div><div className="flex gap-1"><Button aria-label={t("activity.copy", "复制活动日志")} disabled={!entries.length || !onCopyText} size="icon-xs" variant="ghost" onClick={() => void onCopyText?.(serializeKisakiActivityLog(entries))}><Copy /></Button><Button aria-label={t("activity.clear", "清空活动日志")} disabled={!entries.length} size="icon-xs" variant="ghost" onClick={onClear}><Trash2 /></Button></div></div><Input aria-label={t("activity.filter", "过滤活动日志")} className="h-7 text-xs" placeholder={t("activity.placeholder", "工具、级别、操作或消息")} value={query} onChange={(event) => setQuery(event.currentTarget.value)} /><div className="max-h-52 space-y-1 overflow-auto rounded-md border bg-muted/10 p-1">{filtered.length ? [...filtered].reverse().map((entry) => <div key={entry.id} className={cn("rounded-sm border-l-2 px-1.5 py-1 text-[10px]", entry.level === "error" ? "border-l-destructive bg-destructive/5" : entry.level === "warning" ? "border-l-chart-4" : entry.level === "success" ? "border-l-chart-2" : "border-l-muted-foreground/40")} title={formatKisakiActivityLogEntry(entry)}><div className="flex justify-between gap-2"><span className="font-mono text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()} · {entry.tool}</span><span>{entry.progress === undefined ? entry.kind : `${Math.round(entry.progress)}%`}</span></div><div className="break-words">{entry.message}</div>{entry.affectedCount === undefined ? null : <div className="text-muted-foreground">{t("activity.result", "{{affected}} 成功 / {{errors}} 错误", { affected: entry.affectedCount, errors: entry.errorCount ?? 0 })}</div>}</div>) : <div className="p-2 text-center text-[10px] text-muted-foreground">{t("activity.empty", "没有匹配的日志")}</div>}</div></section>
}
