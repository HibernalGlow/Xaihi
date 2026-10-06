import { useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Music, Pause, Play, Volume2, VolumeX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatMediaTime } from "./LocalMediaPreview"

export interface LocalAudioPreviewItem {
  path: string
  name: string
  metadata?: Array<{ label: string; value: string }>
}

export interface LocalAudioPreviewDialogProps {
  items: LocalAudioPreviewItem[]
  activePath?: string
  getFileUrl?: (path: string) => string
  onActivePathChange: (path: string | undefined) => void
}

export function LocalAudioPreviewDialog(props: LocalAudioPreviewDialogProps) {
  const index = props.activePath ? props.items.findIndex((item) => item.path === props.activePath) : -1
  const item = index >= 0 ? props.items[index] : undefined
  const move = (offset: number) => { if (!props.items.length) return; const next = (Math.max(index, 0) + offset + props.items.length) % props.items.length; props.onActivePathChange(props.items[next]?.path) }
  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) props.onActivePathChange(undefined) }}><DialogContent showCloseButton={false} className="flex max-w-[min(92vw,760px)] flex-col gap-3" onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1) } else if (event.key === "ArrowRight") { event.preventDefault(); move(1) } }}><DialogHeader><DialogTitle className="pr-8">{item?.name ?? "音频预览"}</DialogTitle><DialogDescription className="break-all font-mono text-xs">{item?.path}</DialogDescription></DialogHeader>{item ? <LocalAudioPlayer key={item.path} item={item} source={props.getFileUrl?.(item.path)} position={`${index + 1} / ${props.items.length}`} canNavigate={props.items.length > 1} onPrevious={() => move(-1)} onNext={() => move(1)} /> : null}<Button aria-label="关闭音频预览" className="absolute right-4 top-4" size="icon-sm" variant="ghost" onClick={() => props.onActivePathChange(undefined)}><X /></Button></DialogContent></Dialog>
}

export function LocalAudioPlayer({ item, source, position, canNavigate, onPrevious, onNext }: { item: LocalAudioPreviewItem; source?: string; position: string; canNavigate: boolean; onPrevious: () => void; onNext: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else void audio.play().catch(() => setPlaying(false))
  }

  function seek(value: string) {
    const next = Number.parseFloat(value)
    if (!audioRef.current || !Number.isFinite(next)) return
    audioRef.current.currentTime = next
    setCurrentTime(next)
  }

  function changeVolume(value: string) {
    const next = Math.min(1, Math.max(0, Number.parseFloat(value)))
    if (!audioRef.current || !Number.isFinite(next)) return
    audioRef.current.volume = next
    audioRef.current.muted = next === 0
    setVolume(next)
    setMuted(next === 0)
  }

  function toggleMuted() {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !muted
    setMuted(!muted)
  }

  return <><audio ref={audioRef} src={source} preload="metadata" onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onVolumeChange={(event) => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume) }} /><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/20 p-3"><div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary"><Music className="size-7" /></div><div className="min-w-0 space-y-2"><div className="flex items-center gap-2"><Button aria-label={playing ? "暂停音频" : "播放音频"} size="icon-sm" onClick={togglePlayback}>{playing ? <Pause /> : <Play />}</Button><Button aria-label={muted ? "取消静音" : "静音"} size="icon-sm" variant="ghost" onClick={toggleMuted}>{muted ? <VolumeX /> : <Volume2 />}</Button><input aria-label="音量" className="hidden w-20 cursor-pointer accent-primary sm:block" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(event) => changeVolume(event.currentTarget.value)} /><span className="font-mono text-xs text-muted-foreground">{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span></div><input aria-label="播放进度" className="h-1 w-full cursor-pointer accent-primary" type="range" min={0} max={duration || 0} step="any" value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(event.currentTarget.value)} /></div><div className="flex gap-1"><Button aria-label="上一个音频" disabled={!canNavigate} size="icon-sm" variant="ghost" onClick={onPrevious}><ArrowLeft /></Button><Button aria-label="下一个音频" disabled={!canNavigate} size="icon-sm" variant="ghost" onClick={onNext}><ArrowRight /></Button></div></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-4">{item.metadata?.map((field) => <div key={field.label} className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.label}</div><div className="truncate font-mono" title={field.value}>{field.value}</div></div>)}</div><div className="flex justify-between text-[10px] text-muted-foreground"><span>{position}</span><span>← / → 切换音频</span></div></>
}
