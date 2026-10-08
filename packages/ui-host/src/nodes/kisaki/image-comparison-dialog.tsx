import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import { Columns2, Eye, ImageOff, Layers3, ScanLine, SlidersHorizontal, X } from "lucide-react"
import type { KisakiEntry, KisakiGroup } from "@hibernalglow/xaihi-kisaki/core"
import {
  getKisakiImageComparisonEntries,
  type KisakiImageComparisonMode,
  type KisakiImageComparisonState,
} from "@hibernalglow/xaihi-kisaki/image-comparison"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { LocalImagePreview } from "@/nodes/shared/LocalImagePreview"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

export interface KisakiImageComparisonDialogProps {
  groups: readonly KisakiGroup[]
  state: KisakiImageComparisonState
  getFileUrl?: (path: string) => string
  onClose: () => void
  onModeChange: (mode: KisakiImageComparisonMode) => void
  onColorCodingChange: (colorCoding: boolean) => void
  onTargetChange: (path: string) => void
  onSwipeChange: (swipePercent: number) => void
  onOpacityChange: (onionOpacity: number) => void
}

export function KisakiImageComparisonDialog(props: KisakiImageComparisonDialogProps) {
  const { t } = useNodeI18n("kisaki")
  const comparison = getKisakiImageComparisonEntries(props.state, props.groups)
  const active = comparison.active
  const target = comparison.target
  const canCompare = Boolean(active && target)
  const setMode = (mode: KisakiImageComparisonMode) => props.onModeChange(mode)

  return <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) props.onClose() }}>
    <DialogContent showCloseButton={false} className="flex h-[min(92vh,920px)] max-w-[min(96vw,1240px)] flex-col gap-3 overflow-hidden p-4 sm:p-5">
      <DialogHeader className="min-w-0 pr-8">
        <DialogTitle className="truncate text-base">{t("comparison.title", "图片对比")}</DialogTitle>
        <DialogDescription className="truncate font-mono text-[11px]">{active?.path}</DialogDescription>
      </DialogHeader>
      {active ? <TooltipProvider><div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div aria-label={t("comparison.modes", "对比模式")} className="flex items-center gap-1" role="toolbar">
            <ModeButton active={props.state.mode === "single"} icon={Eye} label={t("comparison.single", "单张图片")} onClick={() => setMode("single")} />
            <ModeButton active={props.state.mode === "side-by-side"} disabled={!canCompare} icon={Columns2} label={t("comparison.sideBySide", "并排对比")} onClick={() => setMode("side-by-side")} />
            <ModeButton active={props.state.mode === "swipe"} disabled={!canCompare} icon={SlidersHorizontal} label={t("comparison.swipe", "滑动分割")} onClick={() => setMode("swipe")} />
            <ModeButton active={props.state.mode === "onion-skin"} disabled={!canCompare} icon={Layers3} label={t("comparison.onionSkin", "洋葱皮叠加")} onClick={() => setMode("onion-skin")} />
          </div>
          <ModeButton active={props.state.colorCoding} disabled={!canCompare} icon={ScanLine} label={t("comparison.colorCoding", "差异着色")} onClick={() => props.onColorCodingChange(!props.state.colorCoding)} />
        </div>
        {comparison.group.length > 1 ? <TargetStrip activePath={active.path} entries={comparison.group} getFileUrl={props.getFileUrl} targetPath={target?.path} onTargetChange={props.onTargetChange} /> : null}
        <ComparisonStage active={active} colorCoding={props.state.colorCoding} getFileUrl={props.getFileUrl} mode={props.state.mode} onionOpacity={props.state.onionOpacity} swipePercent={props.state.swipePercent} target={target} onOpacityChange={props.onOpacityChange} onSwipeChange={props.onSwipeChange} />
      </div></TooltipProvider> : null}
      <Button aria-label={t("comparison.close", "关闭图片对比")} className="absolute right-3 top-3" size="icon-sm" variant="ghost" onClick={props.onClose}><X /></Button>
    </DialogContent>
  </Dialog>
}

function ModeButton({ active, disabled, icon: Icon, label, onClick }: { active: boolean; disabled?: boolean; icon: typeof Eye; label: string; onClick: () => void }) {
  return <Tooltip><TooltipTrigger asChild><Button aria-label={label} aria-pressed={active} disabled={disabled} size="icon-sm" variant={active ? "secondary" : "outline"} onClick={onClick}><Icon /></Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}

function TargetStrip({ activePath, entries, getFileUrl, targetPath, onTargetChange }: { activePath: string; entries: readonly KisakiEntry[]; getFileUrl?: (path: string) => string; targetPath?: string; onTargetChange: (path: string) => void }) {
  const { t } = useNodeI18n("kisaki")
  return <div aria-label={t("comparison.targets", "对比目标")} className="flex shrink-0 gap-1 overflow-x-auto pb-1" role="listbox">
    {entries.filter((entry) => entry.path !== activePath).map((entry) => <button key={entry.path} aria-label={t("comparison.compareWith", "与 {{name}} 对比", { name: entry.name })} aria-selected={entry.path === targetPath} className={cn("relative size-12 shrink-0 overflow-hidden rounded-md border", entry.path === targetPath && "ring-2 ring-primary ring-offset-1")} role="option" type="button" onClick={() => onTargetChange(entry.path)}><LocalImagePreview eager alt={entry.name} className="size-full rounded-none border-0" getFileUrl={getFileUrl} imageClassName="object-cover" path={entry.path} /><span className="sr-only">{entry.name}</span></button>)}
  </div>
}

function ComparisonStage({ active, colorCoding, getFileUrl, mode, onionOpacity, swipePercent, target, onOpacityChange, onSwipeChange }: { active: KisakiEntry; colorCoding: boolean; getFileUrl?: (path: string) => string; mode: KisakiImageComparisonMode; onionOpacity: number; swipePercent: number; target?: KisakiEntry; onOpacityChange: (value: number) => void; onSwipeChange: (value: number) => void }) {
  const { t } = useNodeI18n("kisaki")
  if (!target || mode === "single") return <ImagePane entry={active} getFileUrl={getFileUrl} label={t("comparison.source", "当前图片")} />
  if (mode === "side-by-side") return <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2"><ImagePane entry={active} getFileUrl={getFileUrl} label={t("comparison.source", "当前图片")} /><ImagePane entry={target} getFileUrl={getFileUrl} label={t("comparison.target", "对比图片")} /></div>
  if (mode === "swipe") return <SwipeStage active={active} colorCoding={colorCoding} getFileUrl={getFileUrl} swipePercent={swipePercent} target={target} onSwipeChange={onSwipeChange} />
  return <OnionSkinStage active={active} colorCoding={colorCoding} getFileUrl={getFileUrl} onionOpacity={onionOpacity} target={target} onOpacityChange={onOpacityChange} />
}

function ImagePane({ entry, getFileUrl, label }: { entry: KisakiEntry; getFileUrl?: (path: string) => string; label: string }) {
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-muted/20"><div className="flex shrink-0 items-center justify-between gap-2 border-b px-2 py-1 text-[11px]"><span className="truncate font-medium">{label}</span><span className="shrink-0 font-mono text-muted-foreground">{entryDimensions(entry)} · {formatBytes(entry.size)}</span></div><div className="relative min-h-0 flex-1"><LocalImagePreview eager alt={entry.name} className="absolute inset-0 size-full rounded-none border-0 bg-transparent" fallback={<ImageOff className="size-14 text-muted-foreground" />} getFileUrl={getFileUrl} imageClassName="object-contain" path={entry.path} /></div><div className="shrink-0 truncate border-t px-2 py-1 font-mono text-[10px] text-muted-foreground" title={entry.path}>{entry.path}</div></section>
}

function SwipeStage({ active, colorCoding, getFileUrl, swipePercent, target, onSwipeChange }: { active: KisakiEntry; colorCoding: boolean; getFileUrl?: (path: string) => string; swipePercent: number; target: KisakiEntry; onSwipeChange: (value: number) => void }) {
  const { t } = useNodeI18n("kisaki")
  const activePointerId = useRef<number | undefined>(undefined)
  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    onSwipeChange(((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * 100)
  }
  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== event.pointerId) return
    activePointerId.current = undefined
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => { if (activePointerId.current === event.pointerId) updateFromPointer(event) }
  return <div className="flex min-h-0 flex-1 flex-col gap-2"><div data-testid="czkawka-image-comparison-swipe-stage" className="relative min-h-0 flex-1 touch-none overflow-hidden rounded-md border bg-muted/20" onPointerDown={(event) => { activePointerId.current = event.pointerId; try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {} updateFromPointer(event) }} onPointerMove={move} onPointerUp={releasePointer} onPointerCancel={releasePointer}><OverlayImage entry={target} getFileUrl={getFileUrl} /><div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - swipePercent}% 0 0)` }}><OverlayImage blend={colorCoding ? "difference" : "normal"} entry={active} getFileUrl={getFileUrl} /></div><div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary shadow-[0_0_0_1px_hsl(var(--background))]" style={{ left: `${swipePercent}%` }} /></div><RangeControl label={t("comparison.swipePosition", "分割位置")} value={swipePercent} onChange={onSwipeChange} /></div>
}

function OnionSkinStage({ active, colorCoding, getFileUrl, onionOpacity, target, onOpacityChange }: { active: KisakiEntry; colorCoding: boolean; getFileUrl?: (path: string) => string; onionOpacity: number; target: KisakiEntry; onOpacityChange: (value: number) => void }) {
  const { t } = useNodeI18n("kisaki")
  return <div className="flex min-h-0 flex-1 flex-col gap-2"><div className="relative min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/20"><OverlayImage entry={target} getFileUrl={getFileUrl} /><OverlayImage blend={colorCoding ? "difference" : "normal"} entry={active} getFileUrl={getFileUrl} opacity={onionOpacity / 100} /></div><RangeControl label={t("comparison.onionOpacity", "叠加透明度")} value={onionOpacity} onChange={onOpacityChange} /></div>
}

function OverlayImage({ blend, entry, getFileUrl, opacity }: { blend?: "difference" | "normal"; entry: KisakiEntry; getFileUrl?: (path: string) => string; opacity?: number }) {
  return <div className="absolute inset-0" style={{ mixBlendMode: blend, opacity }}><LocalImagePreview eager alt={entry.name} className="size-full rounded-none border-0 bg-transparent" fallback={<ImageOff className="size-14 text-muted-foreground" />} getFileUrl={getFileUrl} imageClassName="object-contain" path={entry.path} /></div>
}

function RangeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = event.key === "ArrowRight" || event.key === "ArrowUp" ? value + 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? value - 1 : event.key === "Home" ? 0 : event.key === "End" ? 100 : undefined
    if (next === undefined) return
    event.preventDefault()
    onChange(next)
  }
  return <label className="flex shrink-0 items-center gap-3 text-xs"><span className="w-20 shrink-0 text-muted-foreground">{label}</span><input aria-label={label} className="h-2 min-w-0 flex-1 accent-primary" max={100} min={0} type="range" value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} onKeyDown={onKeyDown} /><output className="w-9 text-right font-mono text-muted-foreground">{value}%</output></label>
}

function entryDimensions(entry: KisakiEntry): string {
  return entry.width && entry.height ? `${entry.width}×${entry.height}` : "—"
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = units[0]!
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]!
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}
