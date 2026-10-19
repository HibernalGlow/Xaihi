import { useState } from "react"
import type { CrashuData } from "@xiranite/node-crashu/core"
import { Copy, FolderSearch, Gauge, MoveRight, RotateCcw, Search, ShieldAlert, Sparkles } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { PathInput } from "@/components/ui/path-input"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStageLensBar,
  Md3eStepperSlider,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import { tNode } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { DEFAULT_THRESHOLD, NODE_ICON } from "./constants"
import { AdvancedOptionsPopover, ConflictPicker, DirectionPicker, MatchPlanBoard, RichLogPanel, SourcePathsInput, TargetNamesInput } from "./controls"
import type { CrashuAction, CrashuCardState, CrashuPhase, CrashuStatusMeta } from "./types"

export interface CrashuMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configFilePath?: string
  data: CrashuCardState
  defaults?: Partial<CrashuCardState>
  dryRun: boolean
  logs: string[]
  phase: CrashuPhase
  progress: number
  result: CrashuData | null
  running: boolean
  sourcePaths: string[]
  status: CrashuStatusMeta
  targetNames: string[]
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: CrashuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPatch: (patch: Partial<CrashuCardState>) => void
  onPasteSources: () => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function CrashuMd3eView(props: CrashuMd3eViewProps) {
  const [lens, setLens] = useState<"results" | "logs">("results")
  const disabled = !props.sourcePaths.length || !props.data.destinationPath
  const label = props.dryRun
    ? tNode("crashu", "actions.dryMove", "预演移动")
    : tNode("crashu", "actions.liveMove", "真实移动")

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={!props.dryRun}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={<MoveRight />}
      onExecute={() => props.onExecute("move")}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="crashu"
        surface={props.surface}
        testId="crashu-md3e-surface"
        collapsedTestId="crashu-collapsed-view"
        icon={NODE_ICON}
        title={tNode("crashu", "name", "Crashu")}
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.sourcePaths.length} 源 · ${props.targetNames.length} 目标 · ${props.dryRun ? "预演" : "真实"}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const stats = [
    { label: tNode("crashu", "stats.sources", "源"), value: props.result?.sourceCount ?? props.sourcePaths.length, tone: "primary" as const },
    { label: tNode("crashu", "stats.targets", "目标"), value: props.result?.targetCount ?? props.targetNames.length, tone: "secondary" as const },
    { label: tNode("crashu", "stats.matches", "匹配"), value: props.result?.similarFound ?? 0, tone: "tertiary" as const },
    { label: tNode("crashu", "stats.moved", "移动"), value: props.result?.movedCount ?? 0, tone: "primary" as const },
    { label: tNode("crashu", "stats.skipped", "跳过"), value: props.result?.skippedCount ?? 0, tone: "neutral" as const },
  ]

  const statusTone =
    props.status.tone === "error"
      ? "danger"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "secondary"
          : "neutral"

  const matches = props.result?.similarFolders ?? []

  return (
    <Md3eNodeSurface
      nodeId="crashu"
      surface={props.surface}
      data-testid="crashu-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title={tNode("crashu", "name", "Crashu")}
          domainTag="SIMILARITY COLLIDER"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.sourcePaths.length} 源 / ${props.targetNames.length} 目标 / ${props.dryRun ? "预演模式" : "真实执行"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="crashu-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="primary"
                disabled={props.running || !props.sourcePaths.length}
                icon={Search}
                label={tNode("crashu", "actions.scanMatch", "扫描匹配")}
                onClick={() => props.onExecute("scan")}
              />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running || !props.sourcePaths.length}
                icon={FolderSearch}
                label={tNode("crashu", "actions.plan", "生成计划")}
                onClick={() => props.onExecute("plan")}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.result}
                icon={Copy}
                label={tNode("crashu", "copyResults", "复制结果")}
                onClick={props.onCopyResults}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label={tNode("crashu", "actions.clearState", "清空状态")}
                onClick={props.onReset}
              />
              <NodeConfigButton
                nodeKey="crashu"
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
              ? "crashu-portrait-view"
              : "crashu-compact-view"
            : "crashu-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/crashu:grid-cols-[minmax(280px,1.05fr)_minmax(0,1.4fr)]">
          <div
            data-testid="crashu-source-panel"
            className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5"
          >
            <Md3eTonalZone
              tone="primary"
              eyebrow="SOURCE & TARGET CANDIDATES"
              title={tNode("crashu", "zone.input", "匹配输入")}
            >
              <div className="flex flex-col gap-2">
                <SourcePathsInput
                  compact={props.compactSurface}
                  disabled={props.running}
                  pathCount={props.sourcePaths.length}
                  value={props.data.sourcePathsText ?? ""}
                  onChange={(sourcePathsText) => props.onPatch({ sourcePathsText })}
                  onClear={() => props.onPatch({ sourcePathsText: "" })}
                  onPaste={props.onPasteSources}
                />
                <TargetNamesInput
                  compact={props.compactSurface}
                  disabled={props.running || Boolean(props.data.targetPath?.trim())}
                  targetCount={props.targetNames.length}
                  value={props.data.targetNamesText ?? ""}
                  onChange={(targetNamesText) => props.onPatch({ targetNamesText })}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="DESTINATION & THRESHOLD"
              title={tNode("crashu", "zone.gate", "执行闸门")}
            >
              <div className="flex flex-col gap-2">
                <div>
                  <label
                    htmlFor={`crashu-gate-${tNode("crashu", "labels.destination", "移动目标根目录")}`}
                    className="mb-1 block text-[10px] font-bold text-muted-foreground"
                  >
                    {tNode("crashu", "labels.destination", "移动目标根目录")}
                  </label>
                  <PathInput
                    id={`crashu-gate-${tNode("crashu", "labels.destination", "移动目标根目录")}`}
                    disabled={props.running}
                    placeholder="D:/destination"
                    value={props.data.destinationPath ?? ""}
                    onValueChange={(destinationPath) => props.onPatch({ destinationPath })}
                  />
                </div>

                <Md3eConnectedGroup>
                  <Md3eStepperSlider
                    icon={Gauge}
                    label={tNode("crashu", "labels.threshold", "相似度阈值")}
                    value={props.data.similarityThreshold ?? DEFAULT_THRESHOLD}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={props.running}
                    onChange={(similarityThreshold) => props.onPatch({ similarityThreshold })}
                  />
                  <Md3eSwitchRow
                    icon={props.dryRun ? ShieldAlert : Sparkles}
                    label={props.dryRun ? "预演：不移动文件夹" : "真实：将移动文件夹"}
                    ariaLabel={tNode("crashu", "aria.previewSwitch", "crashu 预演切换")}
                    checked={props.dryRun}
                    disabled={props.running}
                    onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
                  />
                </Md3eConnectedGroup>

                <div className="grid grid-cols-1 gap-2 @md/crashu:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] font-bold text-muted-foreground">
                      {tNode("crashu", "labels.moveDirection", "移动方向")}
                    </div>
                    <DirectionPicker
                      disabled={props.running}
                      value={props.data.moveDirection ?? "to_target"}
                      onChange={(moveDirection) => props.onPatch({ moveDirection })}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-bold text-muted-foreground">
                      {tNode("crashu", "labels.conflictPolicy", "冲突策略")}
                    </div>
                    <ConflictPicker
                      disabled={props.running}
                      value={props.data.conflictPolicy ?? "skip"}
                      onChange={(conflictPolicy) => props.onPatch({ conflictPolicy })}
                    />
                  </div>
                </div>
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="SIMILARITY SPECTRUM"
            title={tNode("crashu", "matrix.similarityIndex", "相似度索引与碰撞计划")}
            testId="crashu-match-matrix"
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "results", label: tNode("crashu", "tabs.results", "结果"), badge: matches.length },
                  { id: "logs", label: tNode("crashu", "tabs.logs", "日志"), badge: props.logs.length },
                ]}
                value={lens}
                onChange={setLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col gap-2 overflow-hidden"
          >
            <div className="grid min-h-6 shrink-0 grid-flow-col auto-cols-fr gap-1 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))] p-1.5">
              {matches.length ? (
                matches.slice(0, 14).map((match) => (
                  <div
                    key={`${match.path}:${match.target}`}
                    className="rounded-full bg-[var(--md3e-primary,var(--primary))] transition-all"
                    style={{ opacity: Math.max(0.25, match.similarity) }}
                    title={`${match.name}: ${Math.round(match.similarity * 100)}%`}
                  />
                ))
              ) : (
                <div className="rounded-full bg-muted" />
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              {lens === "results" ? (
                <MatchPlanBoard compact={props.compactSurface} result={props.result} />
              ) : (
                <RichLogPanel compact={props.compactSurface} logs={props.logs} onCopy={props.onCopyLogs} />
              )}
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={props.dryRun ? "secondary" : "danger"}>
                {props.dryRun ? "DRY-RUN 预演" : "LIVE 真实移动"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `已配置 ${props.sourcePaths.length} 个源目录`}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
