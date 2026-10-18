import { TooltipProvider } from "@/components/ui/tooltip"
import type { NodeComponentProps } from "@xiranite/contract"
import type { KisakiCardState, KisakiNodeConfig } from "./types"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import { useNodeSurface } from "@/nodes/shared/useNodeSurface"
import { useMd3eActive } from "@/nodes/shared/controls"
import { Md3eNodeSurface } from "@/nodes/shared/Md3eShapeContext"
import { useKisakiWorkbench } from "./views/model"
import { Collapsed, Compact, Full } from "./views/KisakiWorkspaceView"
import { Md3eKisakiCollapsed, Md3eKisakiCompact, Md3eKisakiFull } from "./views/KisakiMd3eWorkbench"

export function Component({ compId, host }: NodeComponentProps<KisakiCardState, Partial<KisakiNodeConfig>>) {
  "use no memo"
  const surface = useNodeSurface()
  const md3e = useMd3eActive()
  const { t, language } = useNodeI18n("kisaki")
  const view = useKisakiWorkbench({ compId, host, surface, t, language })
  const compact = surface.mode === "compact" || surface.mode === "portrait" || surface.width < 760

  let hostTheme: string | undefined
  try {
    hostTheme = host.env?.theme
  } catch {
    // 宿主没随握手带环境快照时平稳退化
  }

  return (
    <TooltipProvider>
      {md3e ? (
        <Md3eNodeSurface
          nodeId="kisaki"
          surface={surface}
          data-testid="czkawka-surface"
          data-ui-variant="md3e"
          data-surface-mode={surface.mode}
          data-surface-width={surface.width}
          data-host-theme={hostTheme}
          className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] bg-transparent text-foreground"
        >
          {surface.mode === "collapsed" ? (
            <Md3eKisakiCollapsed {...view} />
          ) : compact ? (
            <Md3eKisakiCompact {...view} />
          ) : (
            <Md3eKisakiFull {...view} />
          )}
        </Md3eNodeSurface>
      ) : (
        <div
          ref={surface.ref}
          data-testid="czkawka-surface"
          data-ui-variant="legacy"
          data-surface-mode={surface.mode}
          data-surface-width={surface.width}
          data-host-theme={hostTheme}
          className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-transparent text-foreground"
        >
          {surface.mode === "collapsed" ? <Collapsed {...view} /> : compact ? <Compact {...view} /> : <Full {...view} />}
        </div>
      )}
    </TooltipProvider>
  )
}

export { scanInput } from "./views/model"
