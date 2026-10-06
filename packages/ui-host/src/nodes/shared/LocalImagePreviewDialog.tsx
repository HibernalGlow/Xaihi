import { ArrowLeft, ArrowRight, ImageOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { LocalImagePreview } from "./LocalImagePreview"

export interface LocalImagePreviewItem {
  path: string
  name: string
  metadata?: Array<{ label: string; value: string }>
}

export interface LocalImagePreviewDialogProps {
  items: LocalImagePreviewItem[]
  activePath?: string
  getFileUrl?: (path: string) => string
  onActivePathChange: (path: string | undefined) => void
}

export function LocalImagePreviewDialog(props: LocalImagePreviewDialogProps) {
  const index = props.activePath ? props.items.findIndex((item) => item.path === props.activePath) : -1
  const item = index >= 0 ? props.items[index] : undefined
  const move = (offset: number) => { if (!props.items.length) return; const next = (Math.max(index, 0) + offset + props.items.length) % props.items.length; props.onActivePathChange(props.items[next]?.path) }
  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) props.onActivePathChange(undefined) }}><DialogContent showCloseButton={false} className="flex h-[min(88vh,860px)] max-w-[min(92vw,1100px)] flex-col gap-3" onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1) } else if (event.key === "ArrowRight") { event.preventDefault(); move(1) } }}><DialogHeader><DialogTitle className="pr-8">{item?.name ?? "图片预览"}</DialogTitle><DialogDescription className="break-all font-mono text-xs">{item?.path}</DialogDescription></DialogHeader>{item ? <><div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20"><LocalImagePreview path={item.path} getFileUrl={props.getFileUrl} enabled eager alt={item.name} className="size-full border-0 bg-transparent" imageClassName="object-contain" fallback={<ImageOff className="size-16 text-muted-foreground" />} /><div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between"><Button aria-label="上一张图片" disabled={props.items.length < 2} size="icon" variant="secondary" onClick={() => move(-1)}><ArrowLeft /></Button><Button aria-label="下一张图片" disabled={props.items.length < 2} size="icon" variant="secondary" onClick={() => move(1)}><ArrowRight /></Button></div></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-4">{item.metadata?.map((field) => <div key={field.label} className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.label}</div><div className="truncate font-mono" title={field.value}>{field.value}</div></div>)}</div><div className="flex justify-between text-[10px] text-muted-foreground"><span>{index + 1} / {props.items.length}</span><span>← / → 切换图片</span></div></> : null}<Button aria-label="关闭图片预览" className="absolute right-4 top-4" size="icon-sm" variant="ghost" onClick={() => props.onActivePathChange(undefined)}><X /></Button></DialogContent></Dialog>
}
