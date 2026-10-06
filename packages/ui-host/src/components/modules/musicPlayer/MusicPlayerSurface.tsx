import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react"
import {
  MediaController,
  MediaDurationDisplay,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from "media-chrome/react"
import {
  Clipboard,
  Disc3,
  FolderOpen,
  Library,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
} from "lucide-react"
import { parseWebStream } from "music-metadata"
import {
  currentLyricLine,
  extractEmbeddedLyrics,
  lyricPathCandidates,
  parseLrc,
  type MelodeckLyricLine as LyricLine,
} from "@xiranite/node-melodeck/lyrics"
import { localBackendFileUrl } from "@/backend/localBackendConfig"
import { resolveLocalAudioTracks, type LocalAudioTrack } from "@/backend/localFilesClient"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  DEFAULT_MUSIC_VISUALIZER_STYLE,
  MUSIC_VISUALIZER_STYLE_OPTIONS,
  normalizeMusicVisualizerStyle,
  type MusicVisualizerStyle,
} from "./visualizerStyles"

export interface PersistedTrack {
  name: string
  writer?: string
  lyricLine?: string
  fileName?: string
  path?: string
  relativePath?: string
  size?: number
  lastModified?: number
  type?: string
  metadata?: PersistedTrackMetadata
}

export interface PersistedTrackMetadata {
  title?: string
  artist?: string
  album?: string
  duration?: number
  replayGainTrackDb?: number
  replayGainAlbumDb?: number
  coverUrl?: string
  lyricsHydrated?: boolean
}

interface RuntimeTrack extends PersistedTrack {
  id: number
  path: string
  src: string
  img?: string
  description?: string
}

export interface MusicPlayerSurfaceProps {
  audioRef?: RefObject<HTMLAudioElement | null>
  savedTracks?: PersistedTrack[]
  savedSourcePath?: string
  onSavedTracksChange?: (tracks: PersistedTrack[]) => void
  onSourcePathChange?: (path: string) => void
  onPlaybackStateChange?: (state: MusicPlaybackState) => void
  onPlaybackControlsChange?: (controls: MusicPlaybackControls | null) => void
  visualizerStyle?: MusicVisualizerStyle
  onVisualizerStyleChange?: (style: MusicVisualizerStyle) => void
  variant?: "module" | "dock"
  actions?: ReactNode
  className?: string
}

export interface MusicPlaybackState {
  hasTrack: boolean
  isPlaying: boolean
  trackCount: number
  currentTime?: number
  duration?: number
  artworkUrl?: string
  trackName?: string
  supportLine?: string
}

export interface MusicPlaybackControls {
  playPrevious(): void
  playNext(): void
  togglePlay(): void
  seekTo(time: number): void
}

const DEFAULT_LOCAL_PATH = "E:\\1Hub\\Music\\焚蝶 - 铁痕电台-MSR&Aurora Sky&Lucien X.flac"
const DEFAULT_TRACK_NAME = "焚蝶"
const DEFAULT_COVER_URL = "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/68/6b/51/686b5103-f58d-3ba6-4f20-3bb55b482078/4711720299471.jpg/600x600bb.jpg"

const MEDIA_CHROME_STYLE = {
  background: "transparent",
  backgroundColor: "transparent",
  color: "hsl(var(--foreground))",
  "--media-font-family": "inherit",
  "--media-background-color": "transparent",
  "--media-primary-color": "hsl(var(--foreground))",
  "--media-secondary-color": "transparent",
  "--media-text-color": "hsl(var(--muted-foreground))",
  "--media-icon-color": "hsl(var(--foreground))",
  "--media-control-background": "transparent",
  "--media-control-hover-background": "hsl(var(--accent) / 0.72)",
  "--media-control-padding": "0",
  "--media-control-height": "1.25rem",
  "--media-button-padding": "0",
  "--media-button-icon-width": "1rem",
  "--media-button-icon-height": "1rem",
  "--media-range-padding": "0",
  "--media-range-track-height": "4px",
  "--media-range-track-border-radius": "999px",
  "--media-range-track-background": "hsl(var(--muted-foreground) / 0.22)",
  "--media-time-range-buffered-color": "hsl(var(--muted-foreground) / 0.18)",
  "--media-range-bar-color": "hsl(var(--primary))",
  "--media-range-thumb-width": "8px",
  "--media-range-thumb-height": "8px",
  "--media-range-thumb-background": "hsl(var(--primary))",
  "--media-range-thumb-box-shadow": "0 0 0 3px hsl(var(--background))",
  "--media-font-size": "11px",
  "--media-focus-box-shadow": "0 0 0 2px hsl(var(--ring) / 0.38)",
} as CSSProperties

const AUDIO_ELEMENT_STYLE = { display: "none" } as CSSProperties
const GLASS_SHADOW_CLASS = "shadow-[0_18px_56px_rgba(0,0,0,0.16)] dark:shadow-[0_22px_70px_rgba(0,0,0,0.36)]"

export function MusicPlayerSurface({
  audioRef: externalAudioRef,
  savedTracks = [],
  savedSourcePath,
  onSavedTracksChange,
  onSourcePathChange,
  onPlaybackStateChange,
  onPlaybackControlsChange,
  visualizerStyle = DEFAULT_MUSIC_VISUALIZER_STYLE,
  onVisualizerStyleChange,
  variant = "module",
  actions,
  className,
}: MusicPlayerSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const internalAudioRef = useRef<HTMLAudioElement>(null)
  const audioRef = externalAudioRef ?? internalAudioRef
  const autoplayAfterTrackChangeRef = useRef(false)
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const responsiveCompact = surfaceSize.width > 0 && (surfaceSize.width < 560 || surfaceSize.height < 300)
  const compact = variant === "dock" || responsiveCompact
  const [sourcePath, setSourcePath] = useState(savedSourcePath || DEFAULT_LOCAL_PATH)
  const [tracks, setTracks] = useState<RuntimeTrack[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [lyricsByPath, setLyricsByPath] = useState<Record<string, LyricLine[]>>({})
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTrack = tracks[activeIndex] ?? tracks[0]
  const activeLyrics = activeTrack ? lyricsByPath[activeTrack.path] ?? [] : []
  const lyricLine = activeTrack ? currentLyricLine(activeLyrics, currentTime) : undefined
  const supportLine = activeTrack
    ? activeSupportLine(activeTrack, isPlaying, lyricLine)
    : "后端文件服务"
  const showLibraryToolbar = !compact || tracks.length === 0 || Boolean(error)

  useEffect(() => {
    if (savedSourcePath && savedSourcePath !== sourcePath) setSourcePath(savedSourcePath)
  }, [savedSourcePath, sourcePath])

  useEffect(() => {
    const el = surfaceRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const applySize = (width: number, height: number) => {
      const next = { width: Math.round(width), height: Math.round(height) }
      setSurfaceSize((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ))
    }

    applySize(el.clientWidth, el.clientHeight)

    const observer = new ResizeObserver(([entry]) => {
      applySize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (tracks.length || !savedTracks.length) return
    const restored = restoreTracks(savedTracks)
    if (!restored.length) {
      if (restoreAttempt >= 12) return
      const retry = window.setTimeout(() => setRestoreAttempt((attempt) => attempt + 1), 250)
      return () => window.clearTimeout(retry)
    }
    setTracks(restored)
    setActiveIndex(0)
  }, [restoreAttempt, savedTracks, tracks.length])

  useEffect(() => {
    if (!tracks.length) {
      setActiveIndex(0)
      return
    }
    setActiveIndex((index) => clamp(index, 0, tracks.length - 1))
  }, [tracks.length])

  useEffect(() => {
    setDuration(0)
  }, [activeTrack?.src])

  useEffect(() => {
    if (!activeTrack) return
    if (Object.prototype.hasOwnProperty.call(lyricsByPath, activeTrack.path)) return

    let cancelled = false
    void loadTrackLyrics(activeTrack).then((lines) => {
      if (cancelled) return
      setLyricsByPath((current) => ({ ...current, [activeTrack.path]: lines }))
    })

    return () => {
      cancelled = true
    }
  }, [activeTrack, lyricsByPath])

  useEffect(() => {
    if (!activeTrack || !autoplayAfterTrackChangeRef.current) return
    autoplayAfterTrackChangeRef.current = false
    const audio = audioRef.current
    if (!audio) return
    void audio.play().catch(() => setIsPlaying(false))
  }, [activeTrack?.src])

  useEffect(() => {
    onPlaybackStateChange?.({
      hasTrack: Boolean(activeTrack),
      isPlaying,
      trackCount: tracks.length || savedTracks.length,
      currentTime,
      duration,
      artworkUrl: activeTrack?.img,
      trackName: activeTrack?.name,
      supportLine: activeTrack ? supportLine : undefined,
    })
  }, [activeTrack, currentTime, duration, isPlaying, onPlaybackStateChange, savedTracks.length, supportLine, tracks.length])

  const libraryLabel = useMemo(() => {
    if (tracks.length > 0) return `${tracks.length} 首`
    if (savedTracks.length > 0) return `上次 ${savedTracks.length} 首`
    return "待载入"
  }, [savedTracks.length, tracks.length])

  async function loadSource(nextSourcePath = sourcePath) {
    const trimmed = nextSourcePath.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    try {
      const localTracks = await resolveLocalAudioTracks(trimmed)
      if (!localTracks.length) {
        throw new Error("这个路径下没有找到可播放的音频文件。")
      }

      const nextTracks = toRuntimeTracks(localTracks)
      setTracks(nextTracks)
      setActiveIndex(0)
      setCurrentTime(0)
      setLyricsByPath({})
      setRestoreAttempt(0)
      onSourcePathChange?.(trimmed)
      onSavedTracksChange?.(nextTracks.map(toPersistedTrack))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function pastePath() {
    const text = await navigator.clipboard?.readText?.()
    if (!text) return
    setSourcePath(text.trim())
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void loadSource()
  }

  function selectTrack(index: number, autoplay = isPlaying) {
    if (!tracks.length) return
    const nextIndex = wrapIndex(index, tracks.length)
    autoplayAfterTrackChangeRef.current = autoplay
    setCurrentTime(0)
    setActiveIndex(nextIndex)
  }

  function playPrevious() {
    selectTrack(activeIndex - 1, isPlaying)
  }

  function playNext(autoplay = isPlaying) {
    if (tracks.length <= 1) {
      const audio = audioRef.current
      if (audio) {
        audio.currentTime = 0
        if (autoplay) void audio.play().catch(() => setIsPlaying(false))
      }
      return
    }
    selectTrack(activeIndex + 1, autoplay)
  }

  useEffect(() => {
    if (!onPlaybackControlsChange) return

    onPlaybackControlsChange({
      playPrevious,
      playNext: () => playNext(),
      togglePlay: () => {
        const audio = audioRef.current
        if (!audio) return
        if (audio.paused) void audio.play().catch(() => setIsPlaying(false))
        else audio.pause()
      },
      seekTo: (time) => {
        const audio = audioRef.current
        if (!audio || !Number.isFinite(time)) return
        const nextTime = clamp(time, 0, Number.isFinite(audio.duration) ? audio.duration : Math.max(time, 0))
        audio.currentTime = nextTime
        setCurrentTime(nextTime)
      },
    })

    return () => onPlaybackControlsChange(null)
  }, [activeIndex, activeTrack?.src, audioRef, isPlaying, onPlaybackControlsChange, tracks.length])

  return (
    <div
      ref={surfaceRef}
      data-music-player-surface={variant}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden text-foreground",
        compact ? "gap-2 bg-transparent p-2" : "gap-3 bg-transparent p-3",
        className
      )}
    >
      {showLibraryToolbar && (
        <MusicLibraryToolbar
          compact={compact}
          loading={loading}
          sourcePath={sourcePath}
          libraryLabel={libraryLabel}
          onLoad={() => void loadSource()}
          onPastePath={() => void pastePath()}
          onSourcePathChange={setSourcePath}
          onSubmit={handleSubmit}
        />
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className={cn(
        "min-h-0 flex-1 overflow-hidden",
        compact ? "rounded-xl" : "rounded-2xl"
      )}>
        {activeTrack ? (
          <ThemedAudioPlayer
            audioRef={audioRef}
            compact={compact}
            activeIndex={activeIndex}
            activeTrack={activeTrack}
            currentTime={currentTime}
            isPlaying={isPlaying}
            loading={loading}
            actions={actions}
            supportLine={supportLine}
            tracks={tracks}
            onEnded={() => playNext(true)}
            onLoad={() => void loadSource()}
            onPlayNext={() => playNext()}
            onPlayPrevious={playPrevious}
            onPlayingChange={setIsPlaying}
            onSelectTrack={selectTrack}
            onDurationChange={setDuration}
            onTimeChange={setCurrentTime}
            visualizerStyle={visualizerStyle}
            onVisualizerStyleChange={onVisualizerStyleChange}
          />
        ) : (
          <EmptyLibrary
            compact={compact}
            loading={loading}
            savedTracks={savedTracks}
            onLoad={() => void loadSource()}
            onUseDefaultPath={() => {
              setSourcePath(DEFAULT_LOCAL_PATH)
              void loadSource(DEFAULT_LOCAL_PATH)
            }}
          />
        )}
      </div>
    </div>
  )
}

function MusicLibraryToolbar({
  compact,
  loading,
  sourcePath,
  libraryLabel,
  onLoad,
  onPastePath,
  onSourcePathChange,
  onSubmit,
}: {
  compact: boolean
  loading: boolean
  sourcePath: string
  libraryLabel: string
  onLoad(): void
  onPastePath(): void
  onSourcePathChange(path: string): void
  onSubmit(event: FormEvent<HTMLFormElement>): void
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        compact ? "min-h-9" : "min-h-11 rounded-xl border border-border/[0.45] bg-card/[0.18] px-2 py-1.5 backdrop-blur-2xl backdrop-saturate-150",
        !compact && GLASS_SHADOW_CLASS
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-muted/55 text-primary",
          compact ? "size-8" : "size-10"
        )}>
          <Disc3 className={compact ? "size-4" : "size-5"} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className={cn("truncate font-semibold leading-tight", compact ? "text-sm" : "text-base")}>本地音乐库</h3>
            <Badge variant="secondary" className="shrink-0 text-[10px]">{libraryLabel}</Badge>
          </div>
          {!compact && (
            <p className="truncate text-xs text-muted-foreground">后端文件服务播放，不走浏览器上传。</p>
          )}
        </div>
      </div>

      <form className="flex min-w-0 flex-1 items-center gap-1.5" onSubmit={onSubmit}>
        <Input
          value={sourcePath}
          onChange={(event) => onSourcePathChange(event.target.value)}
          className={cn("h-8 min-w-0 text-xs", compact && "hidden")}
          placeholder="输入本地音频文件或文件夹路径"
          aria-label="本地音乐路径"
        />
        <Button type="button" size="icon-sm" variant="ghost" onClick={onPastePath} title="粘贴路径" aria-label="粘贴路径">
          <Clipboard />
        </Button>
        <Button type="button" size={compact ? "icon-sm" : "sm"} variant={compact ? "ghost" : "secondary"} disabled={loading} onClick={onLoad} title="载入路径" aria-label="载入路径">
          {loading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FolderOpen data-icon="inline-start" />}
          {!compact && "载入"}
        </Button>
      </form>
    </div>
  )
}

function ThemedAudioPlayer({
  audioRef,
  compact,
  activeIndex,
  activeTrack,
  actions,
  currentTime,
  isPlaying,
  loading,
  supportLine,
  tracks,
  onEnded,
  onLoad,
  onPlayNext,
  onPlayPrevious,
  onPlayingChange,
  onSelectTrack,
  onDurationChange,
  onTimeChange,
  visualizerStyle,
  onVisualizerStyleChange,
}: {
  audioRef: RefObject<HTMLAudioElement | null>
  compact: boolean
  activeIndex: number
  activeTrack: RuntimeTrack
  actions?: ReactNode
  currentTime: number
  isPlaying: boolean
  loading: boolean
  supportLine: string
  tracks: RuntimeTrack[]
  onEnded(): void
  onLoad(): void
  onPlayNext(): void
  onPlayPrevious(): void
  onPlayingChange(playing: boolean): void
  onSelectTrack(index: number, autoplay?: boolean): void
  onDurationChange(duration: number): void
  onTimeChange(time: number): void
  visualizerStyle: MusicVisualizerStyle
  onVisualizerStyleChange?: (style: MusicVisualizerStyle) => void
}) {
  const showQueue = !compact && tracks.length > 1

  return (
    <MediaController
      audio
      style={MEDIA_CHROME_STYLE}
      className={cn(
        "relative isolate flex h-full min-h-0 flex-col overflow-hidden border border-border/50 bg-card/[0.16] text-foreground backdrop-blur-2xl backdrop-saturate-150",
        GLASS_SHADOW_CLASS,
        compact ? "justify-center gap-2 rounded-xl px-2 py-2" : "gap-3 rounded-2xl p-3"
      )}
    >
      <audio
        key={activeTrack.path}
        ref={audioRef}
        slot="media"
        preload="metadata"
        style={AUDIO_ELEMENT_STYLE}
        onEnded={onEnded}
        onDurationChange={(event) => onDurationChange(safeMediaTime(event.currentTarget.duration))}
        onLoadedMetadata={(event) => {
          onTimeChange(event.currentTarget.currentTime)
          onDurationChange(safeMediaTime(event.currentTarget.duration))
        }}
        onPause={() => onPlayingChange(false)}
        onPlay={() => onPlayingChange(true)}
        onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime)}
      >
        <source src={activeTrack.src} type={activeTrack.type} />
      </audio>

      <MusicAmbientLayer />

      <div className={cn(
        "relative z-10 grid min-w-0 items-center gap-3",
        compact
          ? "grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(220px,0.95fr)_minmax(260px,1.35fr)_auto]"
          : "grid-cols-[minmax(230px,0.9fr)_minmax(280px,1.4fr)_auto]"
      )}>
        <TrackIdentity
          compact={compact}
          isPlaying={isPlaying}
          supportLine={supportLine}
          track={activeTrack}
        />

        <div className={cn(
          "min-w-0",
          compact && "order-last col-span-2 xl:order-none xl:col-span-1"
        )}>
          <div className="flex items-center justify-center gap-1.5">
            <Button type="button" variant="ghost" size={compact ? "icon-sm" : "icon"} className="rounded-full" onClick={onPlayPrevious} aria-label="上一首" title="上一首">
              <SkipBack />
            </Button>
            <MediaPlayButton
              noTooltip
              className={cn(
                "grid place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90",
                compact ? "size-9" : "size-10",
                "[--media-icon-color:hsl(var(--primary-foreground))] [--media-control-hover-background:transparent]"
              )}
            >
              <Play slot="play" className="size-4 fill-current" />
              <Pause slot="pause" className="size-4 fill-current" />
            </MediaPlayButton>
            <Button type="button" variant="ghost" size={compact ? "icon-sm" : "icon"} className="rounded-full" onClick={onPlayNext} aria-label="下一首" title="下一首">
              <SkipForward />
            </Button>
          </div>

          <div className={cn("mt-2 grid grid-cols-[2.8rem_minmax(0,1fr)_2.8rem] items-center gap-2", compact && "mt-1.5")}>
            <MediaTimeDisplay noToggle className="justify-end text-[10px] font-medium text-muted-foreground" />
            <MediaTimeRange className="w-full min-w-0 [--media-control-display:flex]" />
            <MediaDurationDisplay className="text-[10px] font-medium text-muted-foreground" />
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5">
          <Button type="button" variant="ghost" size="icon-sm" disabled={loading} onClick={onLoad} title="载入音乐" aria-label="载入音乐">
            {loading ? <Loader2 className="animate-spin" /> : <Library />}
          </Button>
          <div className={cn("hidden items-center gap-1 sm:flex", compact && "xl:flex")}>
            <MediaMuteButton noTooltip className="grid size-8 place-items-center rounded-md transition-colors hover:bg-accent">
              <Volume1 slot="low" className="size-4" />
              <Volume1 slot="medium" className="size-4" />
              <Volume2 slot="high" className="size-4" />
              <Volume1 slot="off" className="size-4 opacity-55" />
            </MediaMuteButton>
            <MediaVolumeRange className="w-20 [--media-control-display:flex] [--media-range-thumb-width:7px] [--media-range-thumb-height:7px]" />
          </div>
          {onVisualizerStyleChange && (
            <MusicVisualizerStyleControl
              compact={compact}
              value={visualizerStyle}
              onValueChange={onVisualizerStyleChange}
            />
          )}
          {actions}
        </div>
      </div>

      {showQueue && (
        <TrackQueue
          activeIndex={activeIndex}
          currentTime={currentTime}
          tracks={tracks}
          onSelectTrack={onSelectTrack}
        />
      )}
    </MediaController>
  )
}

function MusicVisualizerStyleControl({
  compact,
  value,
  onValueChange,
}: {
  compact: boolean
  value: MusicVisualizerStyle
  onValueChange(style: MusicVisualizerStyle): void
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" title="顶栏频谱动画">
      <span className="sr-only">顶栏频谱动画</span>
      <NativeSelect
        size="sm"
        value={value}
        onChange={(event) => onValueChange(normalizeMusicVisualizerStyle(event.target.value))}
        aria-label="顶栏频谱动画"
        className={cn("h-8 truncate text-xs", compact ? "w-[7.75rem]" : "w-[9.5rem]")}
      >
        <NativeSelectOptGroup label="LDRS">
          {MUSIC_VISUALIZER_STYLE_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelectOptGroup>
      </NativeSelect>
    </div>
  )
}

function MusicAmbientLayer() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,hsl(var(--card)/0.22),transparent_54%,hsl(var(--muted)/0.14)),linear-gradient(90deg,hsl(var(--primary)/0.08),transparent_40%,hsl(var(--accent)/0.08))]" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0,transparent_18px,hsl(var(--foreground)/0.018)_18px,hsl(var(--foreground)/0.018)_19px)] opacity-45 dark:opacity-30" />
      <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-[22px] backdrop-saturate-150 dark:bg-white/[0.02]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/55 dark:bg-white/12" />
    </div>
  )
}

function TrackIdentity({
  compact,
  isPlaying,
  supportLine,
  track,
}: {
  compact: boolean
  isPlaying: boolean
  supportLine: string
  track: RuntimeTrack
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TrackArtwork compact={compact} track={track} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-semibold leading-tight", compact ? "text-sm" : "text-base")} title={track.name}>
          {track.name}
        </div>
        <div
          className={cn(
            "mt-1 truncate text-xs leading-tight",
            isPlaying ? "text-primary" : "text-muted-foreground"
          )}
          title={supportLine}
        >
          {supportLine}
        </div>
      </div>
    </div>
  )
}

function TrackArtwork({ compact, track }: { compact: boolean; track: RuntimeTrack }) {
  const sizeClass = compact ? "size-12" : "size-16"

  return (
    <div className={cn(
      "relative shrink-0 overflow-hidden rounded-xl border border-white/35 bg-muted/60 shadow-[0_12px_32px_rgba(0,0,0,0.20)] dark:border-white/12 dark:shadow-[0_14px_36px_rgba(0,0,0,0.38)]",
      sizeClass
    )}>
      {track.img ? (
        <img src={track.img} alt={track.name} className="size-full object-cover" draggable={false} />
      ) : (
        <div className="grid size-full place-items-center bg-muted text-primary">
          <Disc3 className={compact ? "size-5" : "size-6"} />
        </div>
      )}
    </div>
  )
}

function TrackQueue({
  activeIndex,
  currentTime,
  tracks,
  onSelectTrack,
}: {
  activeIndex: number
  currentTime: number
  tracks: RuntimeTrack[]
  onSelectTrack(index: number, autoplay?: boolean): void
}) {
  return (
    <div className="relative z-10 min-h-0 flex-1 overflow-hidden rounded-xl border border-border/[0.35] bg-background/[0.18] shadow-inner backdrop-blur-xl backdrop-saturate-150">
      <div className="flex h-8 items-center justify-between px-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <ListMusic className="size-3.5" />
          <span>播放队列</span>
        </div>
        <span className="text-[10px] text-muted-foreground">{tracks.length} 首</span>
      </div>
      <ScrollArea className="h-[calc(100%-2rem)]">
        <div className="flex flex-col gap-0.5 px-1 pb-1">
          {tracks.map((track, index) => (
            <button
              key={track.path}
              type="button"
              className={cn(
                "grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/60",
                index === activeIndex && "bg-accent text-accent-foreground"
              )}
              onClick={() => onSelectTrack(index, true)}
            >
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{track.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{track.writer ?? track.relativePath ?? track.fileName}</span>
              </span>
              <span className="text-[10px] text-muted-foreground">
                {index === activeIndex ? formatTimeLabel(currentTime) : formatFileSize(track.size)}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function EmptyLibrary({
  compact,
  loading,
  savedTracks,
  onLoad,
  onUseDefaultPath,
}: {
  compact: boolean
  loading: boolean
  savedTracks: PersistedTrack[]
  onLoad(): void
  onUseDefaultPath(): void
}) {
  if (compact) {
    return (
      <div className={cn(
        "relative isolate flex h-full min-h-[84px] items-center gap-3 overflow-hidden rounded-xl border border-border/50 bg-card/[0.16] p-2 text-left backdrop-blur-2xl backdrop-saturate-150",
        GLASS_SHADOW_CLASS
      )}>
        <MusicAmbientLayer />
        <div className="relative z-10 grid size-12 shrink-0 place-items-center rounded-lg border border-border/40 bg-background/20 backdrop-blur-xl backdrop-saturate-150">
          <ListMusic className="size-5 text-primary" />
        </div>
        <div className="relative z-10 min-w-0 flex-1">
          <p className="truncate text-sm font-medium">载入本地音乐后开始播放</p>
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
            支持 FLAC、MP3、WAV、OGG、M4A 等常见格式。
          </p>
        </div>
        <Button size="sm" disabled={loading} onClick={onLoad} className="relative z-10 hidden h-8 gap-1.5 sm:inline-flex">
          <Music2 data-icon="inline-start" />
          载入
        </Button>
      </div>
    )
  }

  return (
    <div className={cn(
      "relative isolate flex h-full min-h-[180px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-border/50 bg-card/[0.16] p-4 text-center backdrop-blur-2xl backdrop-saturate-150",
      GLASS_SHADOW_CLASS
    )}>
      <MusicAmbientLayer />
      <div className="relative z-10 flex max-w-md flex-col items-center gap-4">
        <div className="grid size-14 place-items-center rounded-full border border-border/40 bg-background/20 shadow-inner backdrop-blur-xl backdrop-saturate-150">
          <ListMusic className="text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">载入本地音乐文件或整个文件夹</p>
          <p className="mt-1 text-xs text-muted-foreground">
            音频文件由 Xiranite 后端文件服务提供 URL 与 Range 流。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={loading} onClick={onLoad} className="gap-1.5">
            <Library data-icon="inline-start" />
            载入路径
          </Button>
          <Button size="sm" variant="outline" disabled={loading} onClick={onUseDefaultPath} className="gap-1.5">
            <Music2 data-icon="inline-start" />
            焚蝶示例
          </Button>
        </div>
        {savedTracks.length > 0 && (
          <>
            <Separator className="max-w-sm" />
            <p className="max-w-sm text-[11px] text-muted-foreground">
              已保存 {savedTracks.length} 首的路径元数据，后端服务可用时会自动恢复播放 URL。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function restoreTracks(savedTracks: PersistedTrack[]): RuntimeTrack[] {
  const restored: RuntimeTrack[] = []
  for (const track of savedTracks) {
    if (!track.path) continue
    try {
      restored.push({
        ...track,
        id: restored.length + 1,
        path: track.path,
        src: localBackendFileUrl(track.path),
        img: track.name.includes(DEFAULT_TRACK_NAME) ? DEFAULT_COVER_URL : undefined,
        description: track.relativePath ?? track.path,
      })
    } catch {
      return []
    }
  }
  return restored
}

function toRuntimeTracks(tracks: LocalAudioTrack[]): RuntimeTrack[] {
  return tracks.map((track, index) => ({
    ...track,
    id: index + 1,
    img: track.name.includes(DEFAULT_TRACK_NAME) ? DEFAULT_COVER_URL : undefined,
    description: track.relativePath ?? track.path,
  }))
}

function toPersistedTrack(track: RuntimeTrack): PersistedTrack {
  return {
    name: track.name,
    writer: track.writer,
    lyricLine: track.lyricLine,
    fileName: track.fileName,
    path: track.path,
    relativePath: track.relativePath,
    size: track.size,
    type: track.type,
  }
}

function activeSupportLine(track: RuntimeTrack, isPlaying: boolean, lyricLine: string | undefined): string {
  if (lyricLine) return lyricLine
  if (track.lyricLine) return track.lyricLine

  if (isPlaying) {
    if (track.writer) return `正在播放 · ${track.writer}`
    if (track.relativePath) return `正在播放 · ${track.relativePath}`
    return "正在播放"
  }

  return track.writer ?? track.relativePath ?? track.fileName ?? "本地音频"
}

async function loadTrackLyrics(track: RuntimeTrack): Promise<LyricLine[]> {
  const embedded = await loadEmbeddedLyrics(track)
  if (embedded.length) return embedded

  for (const candidate of lyricPathCandidates(track.path)) {
    try {
      const response = await fetch(localBackendFileUrl(candidate), { cache: "no-store" })
      if (!response.ok) continue
      const lines = parseLrc(await response.text())
      if (lines.length) return lines
    } catch {
      continue
    }
  }
  return []
}

async function loadEmbeddedLyrics(track: RuntimeTrack): Promise<LyricLine[]> {
  try {
    const response = await fetch(localBackendFileUrl(track.path))
    if (!response.ok || !response.body) return []

    const metadata = await parseWebStream(response.body, track.type, {
      skipPostHeaders: true,
      skipCovers: true,
    })
    return extractEmbeddedLyrics(metadata.common.lyrics)
  } catch {
    return []
  }
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatTimeLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, "0")}`
}

function safeMediaTime(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

function formatFileSize(size: number | undefined): string {
  if (!size || !Number.isFinite(size)) return ""
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(size > 100 * 1024 * 1024 ? 0 : 1)} MB`
}
