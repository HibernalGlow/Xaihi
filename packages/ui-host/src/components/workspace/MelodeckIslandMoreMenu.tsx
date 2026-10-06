import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"
import { AudioWaveform, Ellipsis, Maximize2, PanelBottom, PictureInPicture2, Power, X } from "lucide-react"
import {
  MUSIC_VISUALIZER_STYLE_OPTIONS,
  normalizeMusicVisualizerStyle,
  type MusicVisualizerStyle,
} from "@/components/modules/musicPlayer/visualizerStyles"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type MelodeckProjectionMode = "bottom" | "floating" | "fullscreen"

const loadMusicVisualizerIcon = () => import("@/components/modules/musicPlayer/MusicVisualizerIcon")
const MusicVisualizerIcon = lazy(() => loadMusicVisualizerIcon().then((module) => ({
  default: module.MusicVisualizerIcon,
})))

interface MelodeckIslandMoreMenuProps {
  autoStart: boolean
  followFullscreenWithFloating: boolean
  playerEnabled: boolean
  visualizerStyle: MusicVisualizerStyle
  onAutoStartChange(autoStart: boolean): void
  onFollowFullscreenWithFloatingChange(follow: boolean): void
  onHidePanel(): void
  onShutdownPlayer(): void
  onShowInMode(mode: MelodeckProjectionMode): void
  onVisualizerStyleChange(style: MusicVisualizerStyle): void
}

const ACTION_BUTTON_CLASS = "grid size-5 place-items-center bg-transparent opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 [&_svg]:size-3"

export function MelodeckIslandMoreMenu({
  autoStart,
  followFullscreenWithFloating,
  playerEnabled,
  visualizerStyle,
  onAutoStartChange,
  onFollowFullscreenWithFloatingChange,
  onHidePanel,
  onShutdownPlayer,
  onShowInMode,
  onVisualizerStyleChange,
}: MelodeckIslandMoreMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (menuOpen) void loadMusicVisualizerIcon()
  }, [menuOpen])

  return (
    <div data-melodeck-island-actions className="absolute right-2 top-2 z-[100] flex items-center gap-0.5 text-muted-foreground">
      <ProjectionButton icon={<PanelBottom />} label="固定到底栏" onClick={() => onShowInMode("bottom")} />
      <ProjectionButton icon={<PictureInPicture2 />} label="切换为浮动窗口" onClick={() => onShowInMode("floating")} />
      <ProjectionButton icon={<Maximize2 />} label="进入标准全屏" onClick={() => onShowInMode("fullscreen")} />
      <ProjectionButton danger icon={<X />} label="隐藏音乐 dock" onClick={onHidePanel} />
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-melodeck-island-menu
            data-melodeck-visualizer-style={visualizerStyle}
            className={ACTION_BUTTON_CLASS}
            aria-label="更多播放选项"
            title="更多"
          >
            <Ellipsis />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-melodeck-island-menu align="end" sideOffset={6} className="z-[10000] min-w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <AudioWaveform />
              调整波形
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent data-melodeck-island-menu className="z-[10001] max-h-80 min-w-44 overflow-y-auto">
              <DropdownMenuRadioGroup
                value={visualizerStyle}
                onValueChange={(value) => onVisualizerStyleChange(normalizeMusicVisualizerStyle(value))}
              >
                {MUSIC_VISUALIZER_STYLE_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value} className="min-h-10 gap-2">
                    <span
                      data-melodeck-visualizer-preview={option.value}
                      className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/60 text-primary"
                      aria-hidden="true"
                    >
                      {option.value === "None" ? (
                        <span className="text-[9px] font-medium text-muted-foreground">无</span>
                      ) : menuOpen ? (
                        <Suspense fallback={<span className="size-3 animate-pulse rounded-full bg-current/25" />}>
                          <MusicVisualizerIcon compact isPlaying style={option.value} />
                        </Suspense>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={followFullscreenWithFloating}
            onCheckedChange={(checked) => onFollowFullscreenWithFloatingChange(checked === true)}
          >
            全屏时同步打开浮窗
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={autoStart}
            onCheckedChange={(checked) => onAutoStartChange(checked === true)}
          >
            应用启动时自动启动
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!playerEnabled}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={onShutdownPlayer}
          >
            <Power />
            彻底关闭播放器
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ProjectionButton({
  danger = false,
  icon,
  label,
  onClick,
}: {
  danger?: boolean
  icon: ReactNode
  label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`${ACTION_BUTTON_CLASS} ${danger ? "hover:text-destructive" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  )
}
