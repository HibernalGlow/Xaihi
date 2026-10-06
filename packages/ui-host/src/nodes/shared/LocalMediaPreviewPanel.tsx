import { ImageOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getLocalMediaKind } from "./LocalMediaPreview"
import { LocalImagePreview } from "./LocalImagePreview"
import type { LocalImagePreviewItem } from "./LocalImagePreviewDialog"
import { LocalAudioPlayer } from "./LocalAudioPreviewDialog"
import type { LocalAudioPreviewItem } from "./LocalAudioPreviewDialog"
import { LocalVideoPlayer } from "./LocalVideoPreviewDialog"
import type { LocalVideoPreviewItem } from "./LocalVideoPreviewDialog"

export interface LocalMediaPreviewPanelProps {
  imageItems: LocalImagePreviewItem[]
  videoItems: LocalVideoPreviewItem[]
  audioItems: LocalAudioPreviewItem[]
  activePath?: string
  getFileUrl?: (path: string) => string
  onActivePathChange: (path: string | undefined) => void
}

export function LocalMediaPreviewPanel(props: LocalMediaPreviewPanelProps) {
  const kind = props.activePath ? getLocalMediaKind(props.activePath) : undefined
  const items = kind === "image" ? props.imageItems : kind === "video" ? props.videoItems : kind === "audio" ? props.audioItems : []
  const index = props.activePath ? items.findIndex((item) => item.path === props.activePath) : -1
  const item = index >= 0 ? items[index] : undefined
  if (!item || !kind) return null
  const move = (offset: number) => { const next = (index + offset + items.length) % items.length; props.onActivePathChange(items[next]?.path) }

  return <aside data-testid="local-media-preview-panel" className="row-start-2 col-start-2 flex min-h-0 flex-col gap-2 overflow-auto border-l bg-card p-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-semibold">固定预览 · {item.name}</div><div className="truncate font-mono text-[10px] text-muted-foreground" title={item.path}>{item.path}</div></div><Button aria-label="关闭固定预览" size="icon-sm" variant="ghost" onClick={() => props.onActivePathChange(undefined)}><X /></Button></div>{kind === "image" ? <ImagePanel item={item} source={props.getFileUrl} position={`${index + 1} / ${items.length}`} canNavigate={items.length > 1} onPrevious={() => move(-1)} onNext={() => move(1)} /> : kind === "video" ? <LocalVideoPlayer key={item.path} item={item} source={props.getFileUrl?.(item.path)} position={`${index + 1} / ${items.length}`} canNavigate={items.length > 1} onPrevious={() => move(-1)} onNext={() => move(1)} /> : <LocalAudioPlayer key={item.path} item={item} source={props.getFileUrl?.(item.path)} position={`${index + 1} / ${items.length}`} canNavigate={items.length > 1} onPrevious={() => move(-1)} onNext={() => move(1)} />}</aside>
}

function ImagePanel({ item, source, position, canNavigate, onPrevious, onNext }: { item: LocalImagePreviewItem; source?: (path: string) => string; position: string; canNavigate: boolean; onPrevious: () => void; onNext: () => void }) {
  return <><div className="relative min-h-48 flex-1 overflow-hidden rounded-md border bg-muted/20"><LocalImagePreview path={item.path} getFileUrl={source} enabled eager alt={item.name} className="size-full border-0 bg-transparent" imageClassName="object-contain" fallback={<ImageOff className="size-12 text-muted-foreground" />} /><div className="absolute inset-x-1 top-1/2 flex -translate-y-1/2 justify-between"><Button aria-label="上一张固定预览" disabled={!canNavigate} size="icon-sm" variant="secondary" onClick={onPrevious}>←</Button><Button aria-label="下一张固定预览" disabled={!canNavigate} size="icon-sm" variant="secondary" onClick={onNext}>→</Button></div></div><Metadata fields={item.metadata} /><div className="text-[10px] text-muted-foreground">{position}</div></>
}

function Metadata({ fields }: { fields?: Array<{ label: string; value: string }> }) {
  return <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/20 p-2 text-xs">{fields?.map((field) => <div key={field.label} className="min-w-0"><div className="text-[9px] uppercase text-muted-foreground">{field.label}</div><div className="truncate font-mono" title={field.value}>{field.value}</div></div>)}</div>
}
