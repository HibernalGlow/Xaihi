import type { GifuAction, GifuData } from "@xiranite/node-gifu/core"
import { Film, Play, RotateCcw, Square } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStatusPill,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS } from "./constants"
import { OptionsPopover, OutputFields, PathsInput, RuntimeOptions } from "./controls"
import { GifuResultTabs } from "./results"
import type { GifuCardState, GifuStatusMeta } from "./types"

export interface GifuMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: GifuAction
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  configFilePath?: string
  data: GifuCardState
  defaults?: Partial<GifuCardState>
  logs: string[]
  pathCount: number
  progress: number
  result: GifuData | null
  running: boolean
  status: GifuStatusMeta
  onActionChange: (value: GifuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: GifuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePaths: () => void
  onPatch: (patch: Partial<GifuCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function GifuMd3eView(props: GifuMd3eViewProps) {
  const dryRun = props.data.dryRun ?? true
  const label = props.action === "make" ? "运行生成" : props.action === "inspect" ? "运行检查" : "运行计划"

  const primaryCta = (compact?: boolean) =>
    props.running ? (
      <Button aria-label="gifu running" disabled size={compact ? "icon-sm" : "sm"} variant="secondary" className="rounded-full">
        <Square />
        {!compact && <span>运行中</span>}
      </Button>
    ) : (
      <ExecuteButton
        compact={compact}
        dangerous={props.action === "make" && !dryRun}
        disabled={props.running}
        idleIcon={<Play />}
        label={label}
        onExecute={() => props.onExecute(props.action)}
      />
    )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="gifu"
        surface={props.surface}
        testId="gifu-md3e-surface"
        collapsedTestId="gifu-collapsed-view"
        icon={Film}
        title="Gifu"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.pathCount} 条路径 · ${props.actionMeta.shortLabel}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const stats = [
    { label: "输入路径", value: props.pathCount, tone: "primary" as const },
    { label: "归档数", value: props.result?.archives.length ?? 0, tone: "secondary" as const },
    { label: "就绪", value: props.result?.readyCount ?? 0, tone: "tertiary" as const },
    { label: "已生成", value: props.result?.createdCount ?? 0, tone: "primary" as const },
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
      nodeId="gifu"
      surface={props.surface}
      data-testid="gifu-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Film}
          title="Gifu"
          domainTag="ANIMATION COMPILER"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={props.data.progressText || props.actionMeta.description}
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="gifu-header-toolbar"
          actions={
            <>
              <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="accent"
                disabled={props.running}
                icon={RotateCcw}
                label="清空状态"
                onClick={props.onReset}
              />
              <NodeConfigButton
                nodeKey="gifu"
                configDirty={props.configDirty}
                configFilePath={props.configFilePath}
                defaults={props.defaults}
                disabled={props.running}
                onOpenConfigFile={props.onOpenConfigFile}
                onResetOverride={props.onResetOverride}
                onRestoreDefault={props.onRestoreDefault}
                onSaveDefault={props.onSaveDefault}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div
        data-testid={
          props.compactSurface
            ? props.portraitCompact
              ? "gifu-portrait-view"
              : "gifu-compact-view"
            : "gifu-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div
          data-testid="gifu-wide-layout"
          className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/gifu:grid-cols-[minmax(280px,1.04fr)_minmax(0,1.4fr)]"
        >
          <div
            data-testid="gifu-control-panel"
            className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5"
          >
            <Md3eTonalZone
              tone="primary"
              eyebrow="ANIMATION SOURCES"
              title="动画编译台输入"
              badge={<Md3eStatusPill tone="primary">{props.pathCount} 个输入</Md3eStatusPill>}
            >
              <PathsInput
                compact={props.compactSurface}
                data={props.data}
                disabled={props.running}
                onPaste={props.onPastePaths}
                onPatch={props.onPatch}
              />
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="ACTION & FORMAT"
              title="编译动作与帧率参数"
              testId="gifu-action-deck"
            >
              <div className="flex flex-col gap-2.5">
                <Md3eChoiceChips
                  ariaLabel="Gifu 编译动作"
                  options={ACTIONS.map((a) => ({ value: a.value, label: a.label, icon: a.icon }))}
                  value={props.action}
                  disabled={props.running}
                  onChange={(nextAct) => {
                    props.onActionChange(nextAct)
                  }}
                />
                <OutputFields data={props.data} disabled={props.running} onPatch={props.onPatch} />
                {!props.compactSurface ? (
                  <RuntimeOptions data={props.data} disabled={props.running} onPatch={props.onPatch} />
                ) : null}
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="COMPILED ARCHIVES & COMMAND"
            title="编译队列与命令回读"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <GifuResultTabs
                compact={props.compactSurface}
                logs={props.logs}
                result={props.result}
                running={props.running}
                onCopyLogs={props.onCopyLogs}
                onCopyResults={props.onCopyResults}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={dryRun ? "secondary" : "danger"}>
                {dryRun ? "DRY-RUN 预演" : "LIVE 编译输出"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                格式 {(props.data.format ?? "webp").toUpperCase()} · {props.pathCount} 个输入
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
