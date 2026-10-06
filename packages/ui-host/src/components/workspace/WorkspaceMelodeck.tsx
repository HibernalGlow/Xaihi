import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react"
import { motion, useDragControls, type PanInfo } from "motion/react"
import {
  DEFAULT_FOLIA_PLAYER_PREFERENCES,
  FoliaBarSurface,
  FoliaPlayerProvider,
  FoliaRemoteSurface,
  FoliaUnifiedPanel,
  type FoliaTrack,
  type FoliaPlayerPreferences,
} from "@hibernalglow/folia-player"
import "@hibernalglow/folia-player/styles.css"
import { Disc3, GripHorizontal, Maximize2, Minus, PanelBottom, Pause, PictureInPicture2, Play, SkipBack, SkipForward, X } from "lucide-react"
import type { MusicPlaybackControls, MusicPlaybackState, PersistedTrack } from "@/components/modules/musicPlayer/MusicPlayerSurface"
import type { MusicVisualizerStyle } from "@/components/modules/musicPlayer/visualizerStyles"
import { Button } from "@/components/ui/button"
import { MelodeckIslandMoreMenu } from "@/components/workspace/MelodeckIslandMoreMenu"
import { NodeSurfaceChrome, type NodeSurfaceChromeAction } from "@/components/workspace/NodeSurfaceChrome"
import { DynamicIsland, DynamicIslandProvider } from "@/components/ui/dynamic-island"
import { useDynamicIslandSize } from "@/components/ui/dynamic-island-context"
import { useLocalBackendStatus } from "@/hooks/useLocalBackendStatus"
import { localBackendConnectionKey, localBackendFileUrl } from "@/backend/localBackendConfig"
import { cn } from "@/lib/utils"
import { startupDebug, startupDebugAsync } from "@/lib/startupDebug"
import { createLogger } from "@/lib/logger"

const logger = createLogger("melodeck.config")
import {
  DEFAULT_MELODECK_CONFIG,
  loadMelodeckConfig,
  MELODECK_CONFIG_CHANGED_EVENT,
  saveMelodeckConfig,
  type MelodeckFloatingOffset,
  type MelodeckFloatingSize,
} from "@/nodes/melodeck/config"
import { foliaMelodeckHost } from "@/nodes/melodeck/foliaHost"
import { clampMelodeckFloatingOffset } from "@/nodes/melodeck/floatingPanelGeometry"
import { loadAndMigrateMelodeckLibrary, saveMelodeckLibrary } from "@/nodes/melodeck/libraryMigration"
import { useFoliaHostTheme } from "@/nodes/melodeck/foliaTheme"
import { useMelodeckThemeMode } from "@/nodes/melodeck/useMelodeckThemeMode"
import { useWorkspaceStore } from "@/store/workspaceStore"
import type { XiraniteFoliaTrack } from "@/nodes/melodeck/foliaTypes"
import { MelodeckFoliaBridge } from "@/nodes/melodeck/MelodeckFoliaBridge"
import { MelodeckFloatingResizeHandle } from "@/nodes/melodeck/MelodeckFloatingResizeHandle"

type DockMode = "bottom" | "floating" | "fullscreen"
type MelodeckIslandVariant = "full" | "mini"

interface MelodeckContextValue {
  collapsed: boolean
  mode: DockMode
  audioRef: RefObject<HTMLAudioElement | null>
  playbackControlsRef: RefObject<MusicPlaybackControls | null>
  playback: MusicPlaybackState
  visualizerStyle: MusicVisualizerStyle
  surfaceMounted: boolean
  savedTracks: PersistedTrack[]
  sourcePath: string
  floatingOffset: MelodeckFloatingOffset
  floatingSize: MelodeckFloatingSize
  autoStart: boolean
  playerEnabled: boolean
  playerEngine: "folia" | "legacy"
  followFullscreenWithFloating: boolean
  setCollapsed(collapsed: boolean): void
  setMode(mode: DockMode): void
  setPlaybackControls(controls: MusicPlaybackControls | null): void
  setPlaybackState(state: MusicPlaybackState): void
  setVisualizerStyle(style: MusicVisualizerStyle): void
  setSurfaceMounted(mounted: boolean): void
  setSavedTracks(tracks: PersistedTrack[]): void
  setSourcePath(path: string): void
  setFloatingOffset(offset: MelodeckFloatingOffset): void
  setFloatingSize(size: MelodeckFloatingSize): void
  setAutoStart(autoStart: boolean): void
  setPlayerEngine(engine: "folia" | "legacy"): void
  setFollowFullscreenWithFloating(follow: boolean): void
  shutdownPlayer(): void
  startPlayer(): void
}

const EMPTY_PLAYBACK_STATE: MusicPlaybackState = {
  hasTrack: false,
  isPlaying: false,
  trackCount: 0,
}
const MELODECK_GLASS_SHADOW_CLASS = "shadow-[0_14px_44px_rgba(0,0,0,0.16)] dark:shadow-[0_20px_64px_rgba(0,0,0,0.34)]"
const MELODECK_REMOTE_CONTROL_COLORS = {
  primaryBackground: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  secondaryBackground: "var(--accent)",
  secondaryForeground: "var(--accent-foreground)",
}
const MusicPlayerSurface = lazy(() =>
  import("@/components/modules/musicPlayer/MusicPlayerSurface").then((module) => ({
    default: module.MusicPlayerSurface,
  })),
)
const MusicVisualizerIcon = lazy(() =>
  import("@/components/modules/musicPlayer/MusicVisualizerIcon").then((module) => ({
    default: module.MusicVisualizerIcon,
  })),
)
const MelodeckContext = createContext<MelodeckContextValue | null>(null)

export function WorkspaceMelodeckProvider({ children }: { children: ReactNode }) {
  const backendStatus = useLocalBackendStatus()
  const { isDaylight, setDaylight } = useMelodeckThemeMode()
  const foliaTheme = useFoliaHostTheme()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackControlsRef = useRef<MusicPlaybackControls | null>(null)
  const applyingConfigRef = useRef(false)
  const startupPreferenceAppliedRef = useRef(false)
  const skipNextSaveRef = useRef(false)
  const skipNextLibrarySaveRef = useRef(false)
  const [collapsed, setCollapsed] = useState(true)
  const [mode, setModeState] = useState<DockMode>(DEFAULT_MELODECK_CONFIG.mode)
  const [playback, setPlaybackState] = useState<MusicPlaybackState>(EMPTY_PLAYBACK_STATE)
  const [visualizerStyle, setVisualizerStyle] = useState<MusicVisualizerStyle>(DEFAULT_MELODECK_CONFIG.visualizer_style)
  const [surfaceMounted, setSurfaceMounted] = useState(false)
  const [savedTracks, setSavedTracks] = useState<PersistedTrack[]>([])
  const [sourcePath, setSourcePath] = useState("")
  const [libraryRoots, setLibraryRoots] = useState<string[]>([])
  const [preferences, setPreferences] = useState<FoliaPlayerPreferences>(DEFAULT_FOLIA_PLAYER_PREFERENCES)
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)
  const [autoStart, setAutoStart] = useState(DEFAULT_MELODECK_CONFIG.auto_start)
  const [playerEnabled, setPlayerEnabled] = useState(false)
  const [playerEngine, setPlayerEngine] = useState<"folia" | "legacy">("folia")
  const [followFullscreenWithFloating, setFollowFullscreenWithFloating] = useState(false)
  const [floatingOffset, setFloatingOffset] = useState<MelodeckFloatingOffset>(DEFAULT_MELODECK_CONFIG.floating_offset)
  const [floatingSize, setFloatingSize] = useState<MelodeckFloatingSize>(DEFAULT_MELODECK_CONFIG.floating_size)
  const [configLoaded, setConfigLoaded] = useState(false)
  const backendKey = backendStatus.data?.status === "ready"
    ? localBackendConnectionKey(backendStatus.data.config)
    : ""
  const setPlaybackControls = useCallback((controls: MusicPlaybackControls | null) => {
    playbackControlsRef.current = controls
  }, [])
  const startPlayer = useCallback(() => setPlayerEnabled(true), [])
  const shutdownPlayer = useCallback(() => {
    audioRef.current?.pause()
    playbackControlsRef.current = null
    setPlayerEnabled(false)
    setSurfaceMounted(false)
    setCollapsed(true)
    setPlaybackState(EMPTY_PLAYBACK_STATE)
  }, [])
  const foliaTracks = useMemo(() => savedTracks.flatMap<XiraniteFoliaTrack>((track) => track.path ? [{
    id: track.path,
    path: track.path,
    src: localBackendFileUrl(track.path),
    title: track.metadata?.title ?? track.name,
    artist: track.metadata?.artist ?? track.writer,
    album: track.metadata?.album,
    duration: track.metadata?.duration,
    coverUrl: track.metadata?.coverUrl,
    replayGainTrackDb: track.metadata?.replayGainTrackDb,
    replayGainAlbumDb: track.metadata?.replayGainAlbumDb,
    mimeType: track.type,
    fileSize: track.size,
    xiraniteSource: {
      title: track.name,
      artist: track.writer,
      fileName: track.fileName,
      relativePath: track.relativePath,
      lastModified: track.lastModified,
    },
  }] : []), [savedTracks])
  const handleFoliaTracksChange = useCallback((tracks: FoliaTrack[]) => {
    setSavedTracks(tracks.map((track) => {
      const source = (track as XiraniteFoliaTrack).xiraniteSource
      return {
        name: source?.title ?? track.title,
        writer: source?.artist ?? track.artist,
        fileName: source?.fileName,
        relativePath: source?.relativePath,
        lastModified: source?.lastModified,
        path: track.path,
        size: track.fileSize,
        type: track.mimeType,
        metadata: source ? {
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          replayGainTrackDb: track.replayGainTrackDb,
          replayGainAlbumDb: track.replayGainAlbumDb,
          coverUrl: track.coverUrl,
        } : undefined,
      }
    }))
  }, [])
  const handleLibraryRootsChange = useCallback((roots: string[]) => {
    setLibraryRoots(roots)
    setSourcePath(roots[0] ?? "")
  }, [])
  const setMode = useCallback((nextMode: DockMode) => {
    if (nextMode === "fullscreen") {
      openStandardMelodeckFullscreen()
      setModeState("floating")
      return
    }
    setModeState(nextMode)
  }, [])

  useEffect(() => {
    if (!backendKey) return
    let cancelled = false

    const refreshMelodeckConfig = () => {
      applyingConfigRef.current = true
      // Load-apply must not round-trip a save of the same snapshot; that was
      // blocking the event loop for ~1s on every desktop boot (see startup debug).
      skipNextSaveRef.current = true
      startupDebugAsync("melodeck:provider:config-load", async () => {
        const config = await loadMelodeckConfig()
        const storedTracks = await loadAndMigrateMelodeckLibrary(config)
        return { config, storedTracks }
      }).then(({ config, storedTracks }) => {
        if (cancelled) return
        startupDebug("melodeck:provider:apply:begin", { savedTracks: storedTracks.length })
        setModeState(config.mode === "fullscreen" ? "floating" : config.mode ?? DEFAULT_MELODECK_CONFIG.mode)
        skipNextLibrarySaveRef.current = true
        setSavedTracks(storedTracks)
        setSourcePath(config.source_path ?? "")
        setLibraryRoots(config.library?.roots ?? (config.source_path ? [config.source_path] : []))
        setPreferences((current) => ({
          ...current,
          volume: config.playback?.volume ?? DEFAULT_FOLIA_PLAYER_PREFERENCES.volume,
          loopMode: config.playback?.loop_mode ?? DEFAULT_FOLIA_PLAYER_PREFERENCES.loopMode,
          replayGainMode: config.playback?.replay_gain_mode ?? DEFAULT_FOLIA_PLAYER_PREFERENCES.replayGainMode,
          backgroundMetadataEnabled: typeof config.visualizer?.backgroundMetadataEnabled === "boolean"
            ? config.visualizer.backgroundMetadataEnabled
            : DEFAULT_FOLIA_PLAYER_PREFERENCES.backgroundMetadataEnabled,
          outputDeviceId: config.playback?.output_device_id,
          ...(config.visualizer as Partial<FoliaPlayerPreferences> | undefined),
        }))
        setActiveTrackId(config.playback?.active_track_id ?? null)
        const nextAutoStart = config.auto_start ?? DEFAULT_MELODECK_CONFIG.auto_start
        setAutoStart(nextAutoStart)
        if (!startupPreferenceAppliedRef.current) {
          startupPreferenceAppliedRef.current = true
          setPlayerEnabled(nextAutoStart)
        }
        setPlayerEngine(config.player_engine ?? "folia")
        setFollowFullscreenWithFloating(config.surfaces?.follow_fullscreen_with_floating ?? false)
        const nextFloatingSize = config.floating_size ?? DEFAULT_MELODECK_CONFIG.floating_size
        setFloatingSize(nextFloatingSize)
        setFloatingOffset(clampMelodeckFloatingOffset(
          config.floating_offset ?? DEFAULT_MELODECK_CONFIG.floating_offset,
          nextFloatingSize,
        ))
        setVisualizerStyle(config.visualizer_style ?? DEFAULT_MELODECK_CONFIG.visualizer_style)
        setConfigLoaded(true)
        startupDebug("melodeck:provider:apply:end")
        queueMicrotask(() => {
          applyingConfigRef.current = false
        })
      }).catch((error) => {
        applyingConfigRef.current = false
        skipNextSaveRef.current = false
        if (!startupPreferenceAppliedRef.current) {
          startupPreferenceAppliedRef.current = true
          setPlayerEnabled(DEFAULT_MELODECK_CONFIG.auto_start)
        }
        logger.warn("Config load failed", error)
      })
    }

    refreshMelodeckConfig()
    window.addEventListener(MELODECK_CONFIG_CHANGED_EVENT, refreshMelodeckConfig)
    return () => {
      cancelled = true
      window.removeEventListener(MELODECK_CONFIG_CHANGED_EVENT, refreshMelodeckConfig)
    }
  }, [backendKey])

  useEffect(() => {
    if (!backendKey || !configLoaded || applyingConfigRef.current) return
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      startupDebug("melodeck:provider:config-save:begin")
      startupDebugAsync("melodeck:provider:config-save", () => saveMelodeckConfig({
        auto_start: autoStart,
        mode,
        saved_tracks: undefined,
        source_path: sourcePath,
        floating_offset: floatingOffset,
        floating_size: floatingSize,
        visualizer_style: visualizerStyle,
        playback: {
          volume: preferences.volume,
          loop_mode: preferences.loopMode,
          replay_gain_mode: preferences.replayGainMode,
          output_device_id: preferences.outputDeviceId,
          active_track_id: activeTrackId ?? undefined,
        },
        library: { roots: libraryRoots },
        surfaces: { mode, collapsed, follow_fullscreen_with_floating: followFullscreenWithFloating },
        visualizer: {
          visualizerMode: preferences.visualizerMode,
          background: preferences.background,
          themeAnimationIntensity: preferences.themeAnimationIntensity,
          visualizerTunings: preferences.visualizerTunings,
          lyricsFontScale: preferences.lyricsFontScale,
          subtitleFontScale: preferences.subtitleFontScale,
          showHarmonySubtitle: preferences.showHarmonySubtitle,
          showSubtitleTranslation: preferences.showSubtitleTranslation,
          backgroundMetadataEnabled: preferences.backgroundMetadataEnabled,
          staticMode: preferences.staticMode,
          disableHomeDynamicBackground: preferences.disableHomeDynamicBackground,
          visualizerFrameRate: preferences.visualizerFrameRate,
          hidePlayerProgressBar: preferences.hidePlayerProgressBar,
          hidePlayerTranslationSubtitle: preferences.hidePlayerTranslationSubtitle,
          hidePlayerRightPanelButton: preferences.hidePlayerRightPanelButton,
          showOpenPanelCloseButton: preferences.showOpenPanelCloseButton,
          alwaysShowPlayerBackButton: preferences.alwaysShowPlayerBackButton,
        },
        player_engine: playerEngine,
      }, { broadcast: false })).catch((error) => {
        logger.warn("Config save failed", error)
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activeTrackId, autoStart, backendKey, collapsed, configLoaded, floatingOffset, floatingSize, followFullscreenWithFloating, libraryRoots, mode, playerEngine, preferences, sourcePath, visualizerStyle])

  useEffect(() => {
    if (!configLoaded) return
    if (skipNextLibrarySaveRef.current) {
      skipNextLibrarySaveRef.current = false
      return
    }
    const timer = window.setTimeout(() => {
      void saveMelodeckLibrary(savedTracks).catch((error) => {
        logger.warn("Melodeck library database save failed", error)
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [configLoaded, savedTracks])

  return (
    <MelodeckContext.Provider
      value={{
        collapsed,
        mode,
        audioRef,
        playbackControlsRef,
        playback,
        visualizerStyle,
        surfaceMounted,
        savedTracks,
        sourcePath,
        floatingOffset,
        floatingSize,
        autoStart,
        playerEnabled,
        setCollapsed,
        setMode,
        setPlaybackControls,
        setPlaybackState,
        setVisualizerStyle,
        setSurfaceMounted,
        setSavedTracks,
        setSourcePath,
        setFloatingOffset,
        setFloatingSize,
        setAutoStart,
        playerEngine,
        setPlayerEngine,
        followFullscreenWithFloating,
        setFollowFullscreenWithFloating,
        shutdownPlayer,
        startPlayer,
      }}
    >
      <FoliaPlayerProvider
        tracks={foliaTracks}
        onTracksChange={handleFoliaTracksChange}
        libraryRoots={libraryRoots}
        onLibraryRootsChange={handleLibraryRootsChange}
        host={foliaMelodeckHost}
        theme={foliaTheme}
        isDaylight={isDaylight}
        onDaylightChange={setDaylight}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        initialActiveTrackId={activeTrackId}
        onActiveTrackChange={setActiveTrackId}
        enabled={playerEnabled && playerEngine === "folia"}
        onEnableRequest={startPlayer}
      >
        <MelodeckFoliaBridge
          enabled={playerEnabled && playerEngine === "folia"}
          setPlaybackControls={setPlaybackControls}
          setPlaybackState={setPlaybackState}
        />
        {children}
      </FoliaPlayerProvider>
    </MelodeckContext.Provider>
  )
}

export function WorkspaceMelodeckTopBarSlot() {
  const variant = useTopBarMusicIslandVariant()

  if (variant === "full") {
    return (
      <div data-melodeck="topbar-slot-full" className="xiranite-app-region-no-drag relative z-[2400] h-12 w-[206px] shrink-0 overflow-visible">
        <DynamicIslandProvider
          initialSize="minimalLeading"
          presets={{
            minimalLeading: { width: 206, aspectRatio: 34 / 206, borderRadius: 17 },
            compact: { width: 396, aspectRatio: 156 / 396, borderRadius: 22 },
          }}
        >
          <MelodeckIsland variant="full" />
        </DynamicIslandProvider>
      </div>
    )
  }

  return (
    <div data-melodeck="topbar-slot-mini" className="xiranite-app-region-no-drag relative z-[2400] h-12 w-[64px] shrink-0 overflow-visible">
      <DynamicIslandProvider
        initialSize="minimalLeading"
        presets={{
          minimalLeading: { width: 64, aspectRatio: 36 / 64, borderRadius: 18 },
          compact: { width: 320, aspectRatio: 156 / 320, borderRadius: 22 },
        }}
      >
        <MelodeckIsland variant="mini" />
      </DynamicIslandProvider>
    </div>
  )
}

function useTopBarMusicIslandVariant(): MelodeckIslandVariant {
  const [variant, setVariant] = useState<MelodeckIslandVariant>(() => (
    typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches ? "full" : "mini"
  ))

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)")
    const updateVariant = () => setVariant(query.matches ? "full" : "mini")
    updateVariant()
    query.addEventListener("change", updateVariant)
    return () => query.removeEventListener("change", updateVariant)
  }, [])

  return variant
}

function MelodeckIsland({ variant }: { variant: MelodeckIslandVariant }) {
  const dock = useMelodeck()
  const { isDaylight } = useMelodeckThemeMode()
  const islandRef = useRef<HTMLDivElement>(null)
  const { state, setSize } = useDynamicIslandSize()
  const expanded = state.size === "compact"
  const miniVariant = variant === "mini"
  const collapsedMini = miniVariant && !expanded
  const showSpectrum = dock.playback.isPlaying
  const primaryTrack = dock.playback.trackName ?? dock.savedTracks[0]?.name
  const trackLabel = primaryTrack ?? "音乐播放器"
  const fallbackStateLabel = dock.playback.isPlaying
    ? (dock.collapsed ? "后台播放" : "正在播放")
    : dock.collapsed
      ? "后台待机"
      : dock.mode === "bottom" ? "底栏显示" : "浮窗显示"
  const stateLabel = dock.playback.supportLine?.trim() || fallbackStateLabel
  const gridMapBackground = isDaylight ? "rgba(250, 249, 246, 0.95)" : "rgba(9, 9, 11, 0.95)"

  useEffect(() => {
    if (!expanded) return

    function collapseFromOutside(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest("[data-melodeck-island-menu]")) return
      if (target instanceof Node && islandRef.current?.contains(target)) return
      setSize("minimalLeading")
    }

    window.addEventListener("pointerdown", collapseFromOutside, true)
    return () => window.removeEventListener("pointerdown", collapseFromOutside, true)
  }, [expanded, setSize])

  function showInMode(mode: DockMode) {
    dock.startPlayer()
    dock.setMode(mode)
    dock.setSurfaceMounted(true)
    dock.setCollapsed(mode === "fullscreen" ? !dock.followFullscreenWithFloating : false)
    setSize("minimalLeading")
  }

  function hidePanel() {
    dock.setSurfaceMounted(true)
    dock.setCollapsed(true)
    setSize("minimalLeading")
  }

  function shutdownPlayer() {
    dock.shutdownPlayer()
    setSize("minimalLeading")
  }

  return (
    <DynamicIsland
      id={`melodeck-topbar-island-${variant}`}
      transition={{ type: "spring", stiffness: 340, damping: 30, mass: 0.72 }}
      className={cn(
        "absolute right-0 top-[7px] mx-0 max-w-[calc(100vw-9rem)] border-0 bg-transparent text-foreground shadow-none ring-0",
      )}
    >
      <div
        ref={islandRef}
        data-melodeck-island-state={expanded ? "expanded" : "collapsed"}
        data-melodeck-island-variant={variant}
        onPointerDownCapture={() => !dock.playerEnabled && dock.startPlayer()}
        style={{ borderRadius: "inherit" }}
        className={cn(
          "relative h-full w-full min-w-0 overflow-hidden",
          expanded ? "p-0" : collapsedMini ? "p-1" : "px-2 py-1",
        )}
      >
        {!expanded && (
          <div
            data-melodeck-island-collapsed-shell
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 z-0 rounded-[inherit] border border-border/55 bg-background/78 ring-1 ring-border/25 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/62",
              !dock.collapsed && "ring-primary/16",
            )}
            style={{ backgroundColor: gridMapBackground }}
          />
        )}
        {expanded ? (
          <div className="relative size-full min-h-0 overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <motion.div
              data-melodeck-island-morph-summary
              className={cn(
                "pointer-events-none absolute right-0 top-0 z-10 flex items-center overflow-hidden",
                miniVariant
                  ? cn("h-9 w-16 gap-1 px-2 py-1", showSpectrum ? "justify-between" : "justify-center")
                  : "h-[34px] w-[206px] gap-1.5 px-3 py-1",
              )}
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 0.98 }}
              transition={{ delay: 0.06, duration: 0.18, ease: "easeOut" }}
              style={{ transformOrigin: "top right" }}
            >
              <MusicIslandCollapsedSummary
                mini={miniVariant}
                artworkUrl={dock.playback.artworkUrl}
                trackLabel={trackLabel}
                stateLabel={stateLabel}
                showSpectrum={showSpectrum}
                isPlaying={dock.playback.isPlaying}
                visualizerStyle={dock.visualizerStyle}
              />
            </motion.div>
            <motion.div
              data-melodeck-island-expanded-content
              className="relative size-full min-h-0 overflow-hidden"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: { delay: 0.08, duration: 0.22, ease: "easeOut" },
                scale: { delay: 0.06, type: "spring", stiffness: 420, damping: 32, mass: 0.55 },
              }}
              style={{ transformOrigin: "top right" }}
            >
              <div className="size-full">
                {dock.playerEngine === "folia"
                  ? <FoliaRemoteSurface className="h-full w-full" controlColors={MELODECK_REMOTE_CONTROL_COLORS} />
                  : <LegacyTopBarRemote />}
              </div>
              <MelodeckIslandMoreMenu
                autoStart={dock.autoStart}
                followFullscreenWithFloating={dock.followFullscreenWithFloating}
                playerEnabled={dock.playerEnabled}
                visualizerStyle={dock.visualizerStyle}
                onAutoStartChange={dock.setAutoStart}
                onFollowFullscreenWithFloatingChange={dock.setFollowFullscreenWithFloating}
                onHidePanel={hidePanel}
                onShutdownPlayer={shutdownPlayer}
                onShowInMode={showInMode}
                onVisualizerStyleChange={dock.setVisualizerStyle}
              />
            </motion.div>
          </div>
        ) : (
          <motion.button
            type="button"
            className={cn(
              "relative z-10 flex min-w-0 items-center rounded-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              collapsedMini
                ? cn("size-full gap-1 px-1 hover:bg-muted/45", showSpectrum ? "justify-between" : "justify-center")
                : "h-full w-full gap-1.5 px-1 hover:bg-muted/35",
            )}
            onClick={() => setSize("compact")}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.14, ease: "easeOut" }}
            aria-expanded={false}
            title="展开音乐灵动岛"
            aria-label="展开音乐灵动岛"
          >
            <MusicIslandCollapsedSummary
              mini={collapsedMini}
              artworkUrl={dock.playback.artworkUrl}
              trackLabel={trackLabel}
              stateLabel={stateLabel}
              showSpectrum={showSpectrum}
              isPlaying={dock.playback.isPlaying}
              visualizerStyle={dock.visualizerStyle}
            />
          </motion.button>
        )}
      </div>
    </DynamicIsland>
  )
}

function MusicIslandCollapsedSummary({
  mini,
  artworkUrl,
  trackLabel,
  stateLabel,
  showSpectrum,
  isPlaying,
  visualizerStyle,
}: {
  mini: boolean
  artworkUrl?: string
  trackLabel: string
  stateLabel: string
  showSpectrum: boolean
  isPlaying: boolean
  visualizerStyle: MusicVisualizerStyle
}) {
  return (
    <>
      <MusicIslandArtwork artworkUrl={artworkUrl} trackLabel={trackLabel} size={mini ? "lg" : "md"} />
      {mini ? (
        showSpectrum && <MusicIslandSpectrum compact isPlaying={isPlaying} style={visualizerStyle} />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[10.5px] font-semibold leading-none">{trackLabel}</span>
            <span className="mt-0.5 block truncate text-[8.5px] leading-none text-muted-foreground">{stateLabel}</span>
          </div>
          {showSpectrum && <MusicIslandSpectrum isPlaying={isPlaying} style={visualizerStyle} />}
        </>
      )}
    </>
  )
}

function MusicIslandArtwork({
  artworkUrl,
  trackLabel,
  size = "md",
}: {
  artworkUrl?: string
  trackLabel: string
  size?: "md" | "lg"
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-border/45 bg-muted/55 text-primary shadow-[0_4px_14px_color-mix(in_oklch,var(--foreground)_16%,transparent)]",
        size === "lg" ? "size-7 rounded-[0.75rem]" : "size-6 rounded-[0.625rem]",
      )}
    >
      {artworkUrl ? (
        <img src={artworkUrl} alt={trackLabel} className="size-full object-cover" draggable={false} />
      ) : (
        <Disc3 className={cn("text-primary-foreground/85", size === "lg" ? "size-4" : "size-3.5")} />
      )}
    </span>
  )
}

function MusicIslandSpectrum({
  compact = false,
  isPlaying,
  style,
}: {
  compact?: boolean
  isPlaying: boolean
  style: MusicVisualizerStyle
}) {
  if (style === "None") return null

  return (
    <span
      data-melodeck-island-spectrum
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-border/45 bg-muted/35 text-primary shadow-inner backdrop-blur-md",
        compact ? "h-6 w-8" : "h-6 w-11",
      )}
    >
      <Suspense fallback={null}>
        <MusicVisualizerIcon compact={compact} isPlaying={isPlaying} style={style} />
      </Suspense>
    </span>
  )
}

function LegacyTopBarRemote() {
  const dock = useMelodeck()
  const controls = dock.playbackControlsRef.current
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/55 bg-card/70 p-2">
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/45 bg-muted/55">
        {dock.playback.artworkUrl ? <img src={dock.playback.artworkUrl} alt="" className="size-full object-cover" /> : <Disc3 className="size-5 text-primary" />}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-sm">{dock.playback.trackName ?? "Music"}</strong>
        <span className="block truncate text-xs text-muted-foreground">{dock.playback.supportLine ?? "Legacy"}</span>
      </div>
      <Button variant="ghost" size="icon-xs" onClick={() => controls?.playPrevious()} aria-label="上一首"><SkipBack /></Button>
      <Button size="icon-xs" onClick={() => controls?.togglePlay()} aria-label={dock.playback.isPlaying ? "暂停" : "播放"}>{dock.playback.isPlaying ? <Pause /> : <Play />}</Button>
      <Button variant="ghost" size="icon-xs" onClick={() => controls?.playNext()} aria-label="下一首"><SkipForward /></Button>
    </div>
  )
}

export function WorkspaceMelodeckPanel() {
  const dock = useMelodeck()
  const dragControls = useDragControls()
  const dragBoundsRef = useRef<HTMLDivElement>(null)
  const backgroundMode = dock.collapsed
  const [floatingPanelOpen, setFloatingPanelOpen] = useState(true)
  const [floatingSizePreview, setFloatingSizePreview] = useState<MelodeckFloatingSize | null>(null)
  const floatingSize = floatingSizePreview ?? dock.floatingSize

  useEffect(() => {
    if (!dock.collapsed) dock.setSurfaceMounted(true)
  }, [dock.collapsed, dock.setSurfaceMounted])

  useEffect(() => {
    if (dock.collapsed || dock.mode !== "floating") {
      setFloatingPanelOpen(true)
      setFloatingSizePreview(null)
    }
  }, [dock.collapsed, dock.mode])

  function handleDragStart(event: ReactPointerEvent<HTMLElement>) {
    if (dock.mode !== "floating") return
    event.preventDefault()
    dragControls.start(event)
  }

  function handleDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (dock.mode !== "floating") return
    dock.setFloatingOffset(clampMelodeckFloatingOffset({
      x: dock.floatingOffset.x + info.offset.x,
      y: dock.floatingOffset.y + info.offset.y,
    }, floatingSize))
  }

  function handleFloatingSizeCommit(size: MelodeckFloatingSize) {
    setFloatingSizePreview(null)
    dock.setFloatingSize(size)
    dock.setFloatingOffset(clampMelodeckFloatingOffset(dock.floatingOffset, size))
  }

  const dockModeLabel = dock.mode === "bottom" ? "底栏 dock" : dock.mode === "fullscreen" ? "全屏 dock" : "浮动窗口"
  const bottomActions = dock.mode === "bottom" ? (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => dock.setPlayerEngine(dock.playerEngine === "folia" ? "legacy" : "folia")}
        title="切换播放器引擎"
      >
        {dock.playerEngine === "folia" ? "Folia" : "Legacy"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => dock.setMode("floating")}
        title="切换为浮动窗口"
        aria-label="切换为浮动窗口"
      >
        <PictureInPicture2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => dock.setMode("fullscreen")}
        title="切换为全屏 dock"
        aria-label="切换为全屏 dock"
      >
        <Maximize2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="hover:text-destructive"
        onClick={() => dock.setCollapsed(true)}
        title="隐藏音乐 dock，继续后台播放"
        aria-label="隐藏音乐 dock，继续后台播放"
      >
        <X />
      </Button>
    </div>
  ) : undefined

  const directProjectionActions: NodeSurfaceChromeAction[] = [
    ...(dock.mode === "floating" ? [{
      key: "collapse",
      label: "暂时收起浮窗",
      icon: <Minus className="h-3 w-3" />,
      onClick: () => setFloatingPanelOpen(false),
    } satisfies NodeSurfaceChromeAction] : []),
    dock.mode === "bottom"
      ? {
          key: "floating",
          label: "切换为浮动窗口",
          icon: <PictureInPicture2 className="h-3 w-3" />,
          onClick: () => dock.setMode("floating"),
        }
      : {
          key: "bottom",
          label: "固定到底栏",
          icon: <PanelBottom className="h-3 w-3" />,
          tone: "minimize",
          onClick: () => dock.setMode("bottom"),
        },
    {
      key: "fullscreen",
      label: "进入标准全屏",
      icon: <Maximize2 className="h-3 w-3" />,
      tone: "maximize",
      onClick: () => dock.setMode("fullscreen"),
    },
    {
      key: "hide",
      label: "隐藏音乐 dock",
      icon: <X className="h-3 w-3" />,
      tone: "close",
      danger: true,
      onClick: () => dock.setCollapsed(true),
    },
  ]
  const directProjection = dock.playerEngine === "folia" && dock.mode !== "fullscreen"
  const directDragHandle = dock.mode === "floating" ? (
    <span
      data-melodeck-part="drag-handle"
      className="grid size-6 cursor-grab touch-none place-items-center active:cursor-grabbing"
      onPointerDown={handleDragStart}
      title="拖动浮窗"
      aria-label="拖动浮窗"
    >
      <GripHorizontal className="size-3.5" />
    </span>
  ) : undefined

  if (backgroundMode && !dock.surfaceMounted) return null

  return (
    <div
      ref={dragBoundsRef}
      className={cn(
        "pointer-events-none fixed z-[1300]",
        backgroundMode ? "left-0 top-0 size-px overflow-hidden" : "inset-3",
      )}
      aria-hidden={backgroundMode}
    >
      <motion.div
        layout={floatingSizePreview === null}
        drag={!backgroundMode && dock.mode === "floating"}
        dragControls={dragControls}
        dragListener={!backgroundMode && directProjection && dock.mode === "floating"}
        dragMomentum={false}
        dragElastic={0.02}
        dragConstraints={dragBoundsRef}
        onDragEnd={handleDragEnd}
        onPointerDownCapture={() => !dock.playerEnabled && dock.startPlayer()}
        animate={!backgroundMode && dock.mode !== "floating" ? { x: 0, y: 0 } : undefined}
        style={!backgroundMode && dock.mode === "floating" ? {
          ...dock.floatingOffset,
          ...(floatingPanelOpen ? floatingSize : {}),
        } : undefined}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        data-melodeck="panel"
        data-melodeck-mode={dock.mode}
        data-melodeck-projection={directProjection ? "direct" : "framed"}
        data-melodeck-direct-drag={!backgroundMode && directProjection && dock.mode === "floating" ? "true" : undefined}
        data-melodeck-floating-size={dock.mode === "floating" && floatingPanelOpen ? `${floatingSize.width}x${floatingSize.height}` : undefined}
        className={cn(
          "absolute bottom-0",
          directProjection ? "group overflow-visible" : "overflow-hidden",
          backgroundMode
            ? "pointer-events-none left-0 top-0 size-px opacity-0"
            : cn(
              "pointer-events-auto opacity-100 transition-opacity duration-200",
              dock.mode === "bottom"
                ? directProjection
                  ? "left-0 right-0 mx-auto h-24 w-[min(36rem,calc(100vw-1.5rem))]"
                  : "left-0 right-0 mx-auto h-[clamp(112px,14vh,132px)] max-w-5xl"
                : dock.mode === "fullscreen"
                  ? "inset-0"
                  : directProjection
                    ? floatingPanelOpen
                      ? "right-0 max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)]"
                      : "right-0 size-12"
                    : "right-0 max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)]",
            ),
        )}
      >
        {directProjection ? (
          <>
            {dock.mode === "floating" && floatingPanelOpen && (
              <div
                data-melodeck-part="toolbar-drag-region"
                className="absolute inset-x-0 top-0 z-[90] h-10 cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={handleDragStart}
                aria-label="拖动浮窗"
              />
            )}
            {(dock.mode !== "floating" || floatingPanelOpen) && (
              <div
                data-melodeck-part="surface-chrome"
                data-melodeck-bottom-chrome={dock.mode === "bottom" || undefined}
                className="pointer-events-none absolute inset-0 z-[100]"
              >
                <NodeSurfaceChrome
                  actions={directProjectionActions}
                  dragHandle={directDragHandle}
                  moduleId="melodeck"
                  moduleName="Melo deck"
                  stateLabel={dock.mode === "bottom" ? "底栏" : "浮窗"}
                  hideIdleIndicator={dock.mode === "bottom"}
                />
              </div>
            )}
            {dock.mode === "bottom" ? (
              <FoliaBarSurface
                className="h-full"
                onOpenPanel={() => dock.setMode("floating")}
                onOpenFloating={() => dock.setMode("floating")}
                onOpenFullscreen={() => dock.setMode("fullscreen")}
              />
            ) : (
              <FoliaUnifiedPanel
                className="h-full"
                open={floatingPanelOpen}
                onOpenChange={setFloatingPanelOpen}
                onOpenFullscreen={() => dock.setMode("fullscreen")}
                extraSettings={<button type="button" className="folia-icon-button" onClick={() => dock.setPlayerEngine("legacy")} title="Legacy" aria-label="Legacy"><Disc3 /></button>}
              />
            )}
          </>
        ) : (
        <div className={cn(
          "xiranite-app-region-no-drag relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card/[0.16] backdrop-blur-2xl backdrop-saturate-150",
          MELODECK_GLASS_SHADOW_CLASS,
          dock.mode !== "bottom" && "border-border/65 shadow-[0_26px_90px_rgba(0,0,0,0.26)] dark:shadow-[0_30px_96px_rgba(0,0,0,0.52)]"
        )}>
          <MelodeckAmbientLayer />
          {dock.mode !== "bottom" && (
            <div className="relative z-10 flex h-9 shrink-0 items-center gap-2 border-b border-border/30 bg-background/[0.14] px-2 text-muted-foreground backdrop-blur-2xl backdrop-saturate-150">
              <div
                data-melodeck-part="drag-handle"
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1",
                  dock.mode === "floating" && "cursor-grab touch-none active:cursor-grabbing",
                )}
                onPointerDown={handleDragStart}
              >
                <GripHorizontal className="size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold leading-none text-foreground">音乐播放器</p>
                  <p className="mt-0.5 truncate text-[10px] leading-none">{dockModeLabel} · 后端文件服务</p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => dock.setMode("bottom")}
                  title="固定到底栏"
                  aria-label="固定到底栏"
                >
                  <PanelBottom />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => dock.setMode("fullscreen")}
                  title={dock.mode === "fullscreen" ? "切换为浮动窗口" : "切换为全屏 dock"}
                  aria-label={dock.mode === "fullscreen" ? "切换为浮动窗口" : "切换为全屏 dock"}
                >
                  <Maximize2 />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="hover:text-destructive"
                  onClick={() => dock.setCollapsed(true)}
                  title="隐藏音乐 dock，继续后台播放"
                  aria-label="隐藏音乐 dock，继续后台播放"
                >
                  <X />
                </Button>
              </div>
            </div>
          )}

          <div className="relative z-10 min-h-0 flex-1">
            {dock.playerEngine === "legacy" ? (
              <Suspense fallback={<div className="relative z-10 grid min-h-0 flex-1 place-items-center p-4 text-xs text-muted-foreground">Loading music player...</div>}>
                <MusicPlayerSurface
                  audioRef={dock.audioRef}
                  savedTracks={dock.savedTracks}
                  savedSourcePath={dock.sourcePath}
                  onSavedTracksChange={dock.setSavedTracks}
                  onSourcePathChange={dock.setSourcePath}
                  onPlaybackControlsChange={dock.setPlaybackControls}
                  onPlaybackStateChange={dock.setPlaybackState}
                  visualizerStyle={dock.visualizerStyle}
                  onVisualizerStyleChange={dock.setVisualizerStyle}
                  variant={dock.mode === "bottom" ? "dock" : "module"}
                  actions={bottomActions}
                  className="h-full"
                />
              </Suspense>
            ) : dock.mode === "bottom" ? (
              <FoliaBarSurface
                className="h-full"
                onOpenPanel={() => dock.setMode("floating")}
                onOpenFloating={() => dock.setMode("floating")}
                onOpenFullscreen={() => dock.setMode("fullscreen")}
              />
            ) : (
              <FoliaUnifiedPanel
                className="h-full"
                onOpenFullscreen={() => dock.setMode("fullscreen")}
                extraSettings={<button type="button" className="folia-icon-button" onClick={() => dock.setPlayerEngine("legacy")} title="Legacy" aria-label="Legacy"><Disc3 /></button>}
              />
            )}
          </div>
        </div>
        )}
        {!backgroundMode && dock.mode === "floating" && floatingPanelOpen ? (
          <MelodeckFloatingResizeHandle
            size={floatingSize}
            onPreview={setFloatingSizePreview}
            onCommit={handleFloatingSizeCommit}
          />
        ) : null}
      </motion.div>
    </div>
  )
}

function MelodeckAmbientLayer() {
  return (
    <div data-melodeck-part="ambient-layer" aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,hsl(var(--card)/0.20),transparent_55%,hsl(var(--muted)/0.14)),linear-gradient(90deg,hsl(var(--primary)/0.07),transparent_42%,hsl(var(--accent)/0.07))]" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0,transparent_22px,hsl(var(--foreground)/0.018)_22px,hsl(var(--foreground)/0.018)_23px)] opacity-45 dark:opacity-30" />
      <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-[22px] backdrop-saturate-150 dark:bg-white/[0.02]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/55 dark:bg-white/12" />
    </div>
  )
}

function useMelodeck(): MelodeckContextValue {
  const context = useContext(MelodeckContext)
  if (!context) throw new Error("WorkspaceMelodeck components must be rendered inside WorkspaceMelodeckProvider.")
  return context
}


export function useWorkspaceMelodeck() {
  return useMelodeck()
}

function openStandardMelodeckFullscreen() {
  const store = useWorkspaceStore.getState()
  let component = store.components.find((candidate) => (
    candidate.workspaceId === store.activeWorkspaceId && candidate.moduleId === "melodeck"
  ))
  if (!component) {
    store.deployComponent("melodeck", { viewMode: "cards" })
    const nextStore = useWorkspaceStore.getState()
    component = [...nextStore.components].reverse().find((candidate) => (
      candidate.workspaceId === nextStore.activeWorkspaceId && candidate.moduleId === "melodeck"
    ))
  }
  if (!component) return
  const nextStore = useWorkspaceStore.getState()
  nextStore.setViewMode("cards")
  nextStore.setComponentVisibility(component.id, "cards", true)
  nextStore.setFullscreen(component.id)
}
