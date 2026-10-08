import type { CSSProperties } from "react"
import type { KisakiGroup, KisakiTool } from "@hibernalglow/xaihi-kisaki/core"
import { buildKisakiAnalysis } from "@hibernalglow/xaihi-kisaki/analysis"
import { Badge } from "@/components/ui/badge"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

const FORMAT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export function KisakiAnalysisView({ groups, selectedPaths, tool, hashSize = 16 }: { groups: KisakiGroup[]; selectedPaths: string[]; tool: KisakiTool; hashSize?: number }) {
  const { t } = useNodeI18n("kisaki")
  const analysis = buildKisakiAnalysis(groups, selectedPaths, tool, hashSize)
  const formats = analysis.formats.slice(0, 8)
  return <div className="grid gap-3" data-testid="czkawka-analysis-view"><section className="grid gap-2"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("analysis.formatShare", "格式占比")}</div>{formats.length ? <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2"><div role="img" aria-label={t("analysis.formatDonut", "格式体积环形图")} className="relative size-20 rounded-full" style={{ background: donutGradient(formats) }}><div className="absolute inset-4 grid place-items-center rounded-full bg-card text-center"><span className="text-[10px] font-semibold">{analysis.fileCount}</span><span className="text-[8px] text-muted-foreground">{t("metrics.files", "文件")}</span></div></div><div className="min-w-0 space-y-1">{formats.map((item, index) => <div key={item.format} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-1 text-[10px]"><span className="size-2 rounded-sm" style={{ background: FORMAT_COLORS[index % FORMAT_COLORS.length] }} /><span className="truncate font-mono">.{item.format}</span><span>{item.bytesPercent.toFixed(1)}%</span></div>)}</div></div> : <EmptyText text={t("analysis.noFormat", "当前结果没有格式数据")} />}</section><section className="grid gap-1.5"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("analysis.formatBytes", "格式体积分布")}</div>{formats.map((item, index) => <div key={item.format} className="grid gap-0.5"><div className="flex justify-between gap-2 text-[10px]"><span className="truncate font-mono">.{item.format} · {item.count}</span><span>{formatBytes(item.bytes)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${item.bytesPercent}%`, background: FORMAT_COLORS[index % FORMAT_COLORS.length] }} /></div></div>)}</section><section className="grid gap-1.5"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("analysis.similarity", "相似度分布")}</div>{analysis.similarities.length ? analysis.similarities.map((item, index) => <div key={item.level} className="grid grid-cols-[64px_minmax(0,1fr)_44px] items-center gap-1 text-[10px]"><span>{t(`analysis.levels.${item.level}`, item.label)}</span><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${item.percent}%`, background: FORMAT_COLORS[index % FORMAT_COLORS.length] }} /></div><span className="text-right font-mono">{item.count} · {item.range}</span></div>) : <EmptyText text={t("analysis.noSimilarity", "当前结果没有相似度数据")} />}</section><section className="grid grid-cols-3 gap-1"><SelectionMetric label={t("analysis.selected", "已选")} value={String(analysis.selection.selectedCount)} /><SelectionMetric label={t("analysis.volume", "体积")} value={formatBytes(analysis.selection.selectedBytes)} /><SelectionMetric label={t("metrics.reclaimable", "可回收")} value={formatBytes(analysis.selection.reclaimableBytes)} accent estimatedLabel={t("analysis.estimated", "预计")} /></section></div>
}

function SelectionMetric({ label, value, accent = false, estimatedLabel }: { label: string; value: string; accent?: boolean; estimatedLabel?: string }) {
  return <div className="min-w-0 rounded-md border bg-muted/20 p-1.5"><div className="text-[9px] text-muted-foreground">{label}</div><div className="truncate font-mono text-[10px] font-semibold" title={value}>{value}</div>{accent ? <Badge className="mt-1 h-3 px-1 text-[8px]" variant="secondary">{estimatedLabel}</Badge> : null}</div>
}

function EmptyText({ text }: { text: string }) { return <div className="rounded-md border border-dashed p-2 text-[10px] text-muted-foreground">{text}</div> }

function donutGradient(formats: Array<{ bytesPercent: number }>): CSSProperties["background"] {
  let offset = 0
  const segments = formats.map((item, index) => { const start = offset; offset += item.bytesPercent; return `${FORMAT_COLORS[index % FORMAT_COLORS.length]} ${start}% ${offset}%` })
  return `conic-gradient(${segments.join(", ")})`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024, unit = units[0]!
  for (let index = 1; index < units.length && value >= 1024; index += 1) { value /= 1024; unit = units[index]! }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}
