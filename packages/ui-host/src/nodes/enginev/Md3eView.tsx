import { useState } from "react"
import type { NodeComponentProps } from "@xiranite/contract"
import type { EngineVAction, EngineVData } from "@xiranite/node-enginev/core"
import { Copy, Eye, Image, Images, RotateCcw, Settings2, SlidersHorizontal, Sparkles } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS } from "./constants"
import { FilterFields, FilterPopover, GallerySettingsPopover, OptionsFields, OptionsPopover, PathInput } from "./controls"
import { ResultTabs } from "./ResultPanels"
import type { EngineVCardState, EngineVNodeConfig, EngineVStatusMeta, EngineVUiConfig } from "./types"
import { WallpaperGallery } from "./WallpaperGallery"

export interface EnginevMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: EngineVAction
  actionMeta: (typeof ACTIONS)[number]
  actionTrayPinned: boolean
  configDirty: boolean
  configFilePath?: string
  data: EngineVCardState
  defaults?: Partial<EngineVCardState>
  uiDefaults?: EngineVUiConfig
  galleryWallpapers: EngineVData["wallpapers"]
  host: NodeComponentProps<EngineVCardState, EngineVNodeConfig>["host"]
  logs: string[]
  progress: number
  result: EngineVData | null
  running: boolean
  selectedIds: string[]
  status: EngineVStatusMeta
  tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  wallpapers: EngineVData["wallpapers"]
  onActionChange: (value: EngineVAction) => void
  onActionTrayPinnedChange: (pinned: boolean) => void
  onCopyLogs: () => void
  onCopyPath: (path: string) => void
  onCopyResults: () => void
  onExecute: (value?: EngineVAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<EngineVCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onToggleWallpaper: (id: string) => void
}

export function EnginevMd3eView(props: EnginevMd3eViewProps) {
  const [sideLens, setSideLens] = useState<"filters" | "options" | "output">("filters")
  const ActionIcon = props.actionMeta.icon
  const dryRun = props.data.dryRun ?? true
  const dangerous = props.action === "delete" && !dryRun

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      compact={compact}
      dangerous={dangerous}
      running={props.running}
      disabled={props.running}
      idleIcon={<ActionIcon />}
      label={`${props.tNode("buttons.run", "执行")} ${props.actionMeta.shortLabel}`}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="enginev"
        surface={props.surface}
        testId="enginev-md3e-surface"
        icon={Image}
        title="EngineV"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.galleryWallpapers.length} 可见 · ${props.selectedIds.length} 选中`
        }
        progress={props.progress}
        running={props.running}
        action={
          <Button
            aria-label={props.tNode("buttons.quickAction", "快速{{action}}", { action: props.actionMeta.shortLabel })}
            disabled={props.running}
            size="icon-xs"
            className="rounded-full"
            onClick={() => props.onExecute(props.action)}
          >
            <ActionIcon />
          </Button>
        }
      />
    )
  }

  const stats = [
    { label: "总数", value: props.wallpapers.length, tone: "primary" as const },
    { label: "可见", value: props.galleryWallpapers.length, tone: "secondary" as const },
    { label: "选中", value: props.selectedIds.length, tone: "tertiary" as const },
  ]

  const statusTone =
    props.status.tone === "error"
      ? "danger"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "secondary"
          : "neutral"

  return (
    <Md3eNodeSurface
      nodeId="enginev"
      surface={props.surface}
      data-testid={props.surface.mode === "workspace" ? "enginev-workspace-view" : "enginev-md3e-surface"}
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <div data-floating-window-drag-row="true" data-testid="enginev-window-caption-row" className="shrink-0">
        <FloatingWindowNodeHeader>
          <Md3eExpressiveHero
            icon={Image}
            title="EngineV"
            domainTag="WORKSHOP CURATOR"
            statusLabel={props.status.label}
            statusTone={statusTone}
            subtitle={props.data.progressText || props.actionMeta.description}
            progress={props.progress}
            running={props.running}
            stats={stats}
            toolbarTestId="enginev-header-toolbar"
            actions={
              <>
                <FilterPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
                <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
                <GallerySettingsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
                <NodeConfigButton
                  nodeKey="enginev"
                  configDirty={props.configDirty}
                  configFilePath={props.configFilePath}
                  defaults={props.defaults}
                  disabled={props.running}
                  uiDefaults={props.uiDefaults}
                  onOpenConfigFile={props.onOpenConfigFile}
                  onResetOverride={props.onResetOverride}
                  onRestoreDefault={props.onRestoreDefault}
                  onSaveDefault={props.onSaveDefault}
                />
                <ActionIconButton
                  shapeRole="accent"
                  label={props.tNode("buttons.clearState", "Clear state")}
                  icon={RotateCcw}
                  disabled={props.running}
                  onClick={props.onReset}
                />
              </>
            }
          />
        </FloatingWindowNodeHeader>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/enginev:grid-cols-[minmax(280px,0.95fr)_minmax(0,1.55fr)]">
        <aside
          data-testid="enginev-workspace-controls"
          className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5"
        >
          <Md3eTonalZone
            tone="primary"
            eyebrow="WORKSHOP DIRECTORY"
            title="创意工坊路径与动作"
          >
            <div className="flex flex-col gap-2">
              <PathInput
                compact={props.compactSurface}
                data={props.data}
                disabled={props.running}
                onPaste={props.onPaste}
                onPatch={props.onPatch}
              />
              <Md3eChoiceChips
                ariaLabel="EngineV 动作模式"
                options={ACTIONS.map((a) => ({ value: a.value, label: a.shortLabel, icon: a.icon }))}
                value={props.action}
                disabled={props.running}
                onChange={props.onActionChange}
              />
            </div>
          </Md3eTonalZone>

          <Md3eConnectedGroup>
            <Md3eSwitchRow
              icon={Eye}
              label={props.tNode("buttons.dryRun", "预演")}
              checked={dryRun}
              disabled={props.running}
              onCheckedChange={(nextDry) => props.onPatch({ dryRun: nextDry })}
            />
            <Md3eSwitchRow
              icon={Copy}
              label={props.tNode("buttons.copy", "复制")}
              checked={props.data.copyMode ?? false}
              disabled={props.running}
              onCheckedChange={(copyMode) => props.onPatch({ copyMode })}
            />
          </Md3eConnectedGroup>

          <Md3eTonalZone
            tone="secondary"
            eyebrow="CURATION & LOGS"
            title="筛选、导出与输出"
            className="min-h-48 flex-1"
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "filters", label: props.tNode("workspace.filters", "筛选"), icon: SlidersHorizontal },
                  { id: "options", label: props.tNode("workspace.options", "选项"), icon: Settings2 },
                  { id: "output", label: "输出", icon: Sparkles, badge: props.logs.length },
                ]}
                value={sideLens}
                onChange={setSideLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-auto"
          >
            {sideLens === "filters" ? (
              <FilterFields compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
            ) : sideLens === "options" ? (
              <OptionsFields compact data={props.data} disabled={props.running} onPatch={props.onPatch} />
            ) : (
              <div data-testid="enginev-workspace-output" className="min-h-0 flex-1">
                <ResultTabs
                  compact
                  result={props.result}
                  logs={props.logs}
                  onCopyLogs={props.onCopyLogs}
                  onCopyResults={props.onCopyResults}
                />
              </div>
            )}
          </Md3eTonalZone>
        </aside>

        <Md3eTonalZone
          tone="default"
          eyebrow="WALLPAPER GALLERY"
          title="壁纸画廊矩阵"
          testId="enginev-gallery-only"
          badge={
            <Md3eStatusPill tone="primary">
              <Images className="mr-1 inline size-3" />
              {props.galleryWallpapers.length} 可见 · {props.selectedIds.length} 选中
            </Md3eStatusPill>
          }
          bodyClassName="min-h-0 flex-1 overflow-hidden"
        >
          <div className="h-full w-full overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/60">
            <WallpaperGallery
              columns={props.data.galleryColumns}
              compact={props.data.galleryCompact}
              host={props.host}
              showMeta={props.data.galleryShowMeta}
              showPath={props.data.galleryShowPath}
              selectedIds={props.selectedIds}
              wallpapers={props.galleryWallpapers}
              onCopyPath={props.onCopyPath}
              onToggle={props.onToggleWallpaper}
            />
          </div>
        </Md3eTonalZone>
      </div>

      <Md3eCommandDock
        testId="enginev-floating-actions"
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Md3eStatusPill tone={dryRun ? "secondary" : "danger"}>
              {dryRun ? "DRY-RUN 预演" : "LIVE 实执"}
            </Md3eStatusPill>
            <span className="truncate text-xs text-muted-foreground">
              已选中 {props.selectedIds.length} 项 · {props.actionMeta.label}
            </span>
          </div>
        }
        trailing={primaryCta(props.compactSurface)}
      />
    </Md3eNodeSurface>
  )
}
