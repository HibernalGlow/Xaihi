import type { ComponentType } from "react"
import {
  Activity,
  BookOpen,
  ChevronRight,
  Database,
  Grid,
  History,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  ShieldAlert,
  SplitSquareVertical,
  Trash2,
  Wrench,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export type AppMenuPage = "root" | "workspaces" | "views" | "layouts"

interface AppMenuRootProps {
  hazardMode: boolean
  openDevToolsLabel: string
  onExit: () => void
  onHazard: () => void
  onNavigate: (page: AppMenuPage) => void
  onOpenDashboard: () => void
  onOpenDeletions: () => void
  onOpenDevTools: () => void
  onOpenHistory: () => void
  onOpenOperations: () => void
  onOpenRegistry: () => void
  onOpenSettings: () => void
}

export function AppMenuRoot({
  hazardMode,
  openDevToolsLabel,
  onExit,
  onHazard,
  onNavigate,
  onOpenDashboard,
  onOpenDeletions,
  onOpenDevTools,
  onOpenHistory,
  onOpenOperations,
  onOpenRegistry,
  onOpenSettings,
}: AppMenuRootProps) {
  return (
    <div data-testid="app-menu" className="p-1.5">
      <div className="flex items-center justify-between px-2.5 pb-2 pt-1">
        <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">XIRANITE</span>
        <span className="font-mono text-[9px] tracking-widest text-muted-foreground/55">COMMAND</span>
      </div>

      <div className="grid gap-0.5">
        <AppMenuRow icon={Settings} label="设置" shortcut="Alt+P" onSelect={onOpenSettings} />
        <AppMenuRow icon={LayoutDashboard} label="面板" hasSubmenu onSelect={() => onNavigate("views")} />
        <AppMenuRow icon={Grid} label="工作空间" hasSubmenu onSelect={() => onNavigate("workspaces")} />
        <AppMenuRow icon={SplitSquareVertical} label="布局" hasSubmenu onSelect={() => onNavigate("layouts")} />
      </div>

      <Separator className="my-1.5" />

      <div className="grid gap-0.5">
        <AppMenuRow icon={Plus} label="模块库" onSelect={onOpenRegistry} />
        <AppMenuRow icon={Activity} label="节点运行" onSelect={onOpenOperations} />
        <AppMenuRow icon={History} label="运行历史" shortcut="Alt+H" onSelect={onOpenHistory} />
        <AppMenuRow icon={Trash2} label="删除历史" onSelect={onOpenDeletions} />
        <AppMenuRow icon={Database} label="数据仪表盘" onSelect={onOpenDashboard} />
      </div>

      <Separator className="my-1.5" />

      <div className="grid gap-0.5">
        <AppMenuRow icon={BookOpen} label="运行时设置" onSelect={onOpenSettings} />
        <AppMenuRow icon={Wrench} label={openDevToolsLabel} shortcut="F12" onSelect={onOpenDevTools} />
        <AppMenuRow
          active={hazardMode}
          icon={ShieldAlert}
          label={hazardMode ? "Hazard On" : "Hazard"}
          shortcut={hazardMode ? "ON" : "ARM"}
          tone="danger"
          onSelect={onHazard}
        />
      </div>

      <Separator className="my-1.5" />

      <AppMenuRow icon={LogOut} label="退出应用" tone="danger" onSelect={onExit} />
    </div>
  )
}

export function AppMenuRow({
  active = false,
  hasSubmenu = false,
  icon: Icon,
  label,
  onSelect,
  shortcut,
  tone = "default",
}: {
  active?: boolean
  hasSubmenu?: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onSelect: () => void
  shortcut?: string
  tone?: "default" | "danger"
}) {
  const danger = tone === "danger"
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active && "bg-foreground text-background shadow-sm",
        !active && !danger && "text-foreground hover:bg-muted/65",
        !active && danger && "text-destructive hover:bg-destructive/10",
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? <span className="shrink-0 text-[10px] tracking-wide opacity-55">{shortcut}</span> : null}
      {hasSubmenu ? <ChevronRight className="size-3.5 shrink-0 opacity-55 transition-transform group-hover:translate-x-0.5" /> : null}
    </button>
  )
}
