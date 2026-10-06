import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Maximize, Minimize, Pause, Play, Volume2, VolumeX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatMediaTime } from "./LocalMediaPreview"

export interface LocalVideoPreviewItem {
  path: string
  name: string
  metadata?: Array<{ label: string; value: string }>
}

export interface LocalVideoPreviewDialogProps {
  items: LocalVideoPreviewItem[]
  activePath?: string
  getFileUrl?: (path: string) => string
  onActivePathChange: (path: string | undefined) => void
}

export function LocalVideoPreviewDialog(props: LocalVideoPreviewDialogProps) {
  const index = props.activePath ? props.items.findIndex((item) => item.path === props.activePath) : -1
  const item = index >= 0 ? props.items[index] : undefined
  const move = (offset: number) => { if (!props.items.length) return; const next = (Math.max(index, 0) + offset + props.items.length) % props.items.length; props.onActivePathChange(props.items[next]?.path) }
  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) props.onActivePathChange(undefined) }}><DialogContent showCloseButton={false} className="flex h-[min(90vh,900px)] max-w-[min(94vw,1200px)] flex-col gap-3" onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); move(-1) } else if (event.key === "ArrowRight") { event.preventDefault(); move(1) } }}><DialogHeader><DialogTitle className="pr-8">{item?.name ?? "视频预览"}</DialogTitle><DialogDescription className="break-all font-mono text-xs">{item?.path}</DialogDescription></DialogHeader>{item ? <LocalVideoPlayer key={item.path} item={item} source={props.getFileUrl?.(item.path)} position={`${index + 1} / ${props.items.length}`} canNavigate={props.items.length > 1} onPrevious={() => move(-1)} onNext={() => move(1)} /> : null}<Button aria-label="关闭视频预览" className="absolute right-4 top-4" size="icon-sm" variant="ghost" onClick={() => props.onActivePathChange(undefined)}><X /></Button></DialogContent></Dialog>
}

export function LocalVideoPlayer({ item, source, position, canNavigate, onPrevious, onNext }: { item: LocalVideoPreviewItem; source?: string; position: string; canNavigate: boolean; onPrevious: () => void; onNext: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener("fullscreenchange", updateFullscreen)
    return () => document.removeEventListener("fullscreenchange", updateFullscreen)
  }, [])

  function togglePlayback() {
    const video = videoRef.current
    if (!video) return
    if (playing) video.pause()
    else void video.play().catch(() => setPlaying(false))
  }

  function seek(value: string) {
    const next = Number.parseFloat(value)
    if (!videoRef.current || !Number.isFinite(next)) return
    videoRef.current.currentTime = next
    setCurrentTime(next)
  }

  function changeVolume(value: string) {
    const next = Math.min(1, Math.max(0, Number.parseFloat(value)))
    if (!videoRef.current || !Number.isFinite(next)) return
    videoRef.current.volume = next
    videoRef.current.muted = next === 0
    setVolume(next)
    setMuted(next === 0)
  }

  function toggleMuted() {
    const video = videoRef.current
    if (!video) return
    video.muted = !muted
    setMuted(!muted)
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.()
      setFullscreen(false)
    } else if (containerRef.current?.requestFullscreen) {
      await containerRef.current.requestFullscreen()
      setFullscreen(true)
    }
  }

  return <><div ref={containerRef} data-testid="local-video-player" className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-black"><video ref={videoRef} src={source} className="size-full object-contain" playsInline preload="metadata" onClick={togglePlayback} onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onDurationChange={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onVolumeChange={(event) => { setMuted(event.currentTarget.muted); setVolume(event.currentTarget.volume) }} /><div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3 pt-10 text-white"><input aria-label="播放进度" className="h-1 w-full cursor-pointer accent-primary" type="range" min={0} max={duration || 0} step="any" value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(event.currentTarget.value)} /><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Button aria-label={playing ? "暂停视频" : "播放视频"} size="icon-sm" variant="ghost" className="text-white hover:bg-white/20 hover:text-white" onClick={togglePlayback}>{playing ? <Pause /> : <Play />}</Button><Button aria-label={muted ? "取消静音" : "静音"} size="icon-sm" variant="ghost" className="text-white hover:bg-white/20 hover:text-white" onClick={toggleMuted}>{muted ? <VolumeX /> : <Volume2 />}</Button><input aria-label="音量" className="hidden w-24 cursor-pointer accent-primary sm:block" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(event) => changeVolume(event.currentTarget.value)} /><span className="font-mono text-xs">{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span></div><Button aria-label={fullscreen ? "退出全屏" : "进入全屏"} size="icon-sm" variant="ghost" className="text-white hover:bg-white/20 hover:text-white" onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize /> : <Maximize />}</Button></div></div><div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between"><Button aria-label="上一个视频" disabled={!canNavigate} size="icon" variant="secondary" onClick={onPrevious}><ArrowLeft /></Button><Button aria-label="下一个视频" disabled={!canNavigate} size="icon" variant="secondary" onClick={onNext}><ArrowRight /></Button></div></div><div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-4">{item.metadata?.map((field) => <div key={field.label} className="min-w-0"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.label}</div><div className="truncate font-mono" title={field.value}>{field.value}</div></div>)}</div><div className="flex justify-between text-[10px] text-muted-foreground"><span>{position}</span><span>← / → 切换视频</span></div></>
}
