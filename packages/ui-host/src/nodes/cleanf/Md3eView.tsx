import { useState } from "react"
import type { CleanfData, CleanfPresetId } from "@xiranite/node-cleanf/core"
import { Copy, Eye, FolderSearch, ListChecks, Play, RotateCcw, ShieldAlert, Sparkles, Trash2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Input } from "@/components/ui/input"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eMultiChoiceChips,
  Md3eNodeSurface,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import { tNode, type useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { NODE_ICON, PRESET_METAS } from "./constants"
import { AdvancedOptionsPopover, LogPanel, PathInput, ResultList } from "./controls"
import type { CleanfCardState, CleanfPhase, CleanfStatusMeta } from "./types"

export interface CleanfMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configFilePath?: string
  data: CleanfCardState
  defaults?: Partial<CleanfCardState>
  logs: string[]
  pathCount: number
  phase: CleanfPhase
  previewMode: boolean
  progress: number
  result: CleanfData | null
  running: boolean
  selectedPresets: CleanfPresetId[]
  status: CleanfStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (override?: Partial<CleanfCardState>) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePath: () => void
  onPatch: (patch: Partial<CleanfCardState>) => void
  onReloadDefaults: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onTogglePreset: (id: CleanfPresetId) => void
  onUndoLastCleanup: () => void
}

export function CleanfMd3eView(props: CleanfMd3eViewProps) {
  const [inspectLens, setInspectLens] = useState<"results" | "logs">("results")
  const [compactLens, setCompactLens] = useState<"setup" | "inspect">("setup")

  const dangerous = !props.previewMode
  const actionLabel = props.previewMode
    ? tNode("cleanf", "actions.dryClean", "预演清理")
    : tNode("cleanf", "actions.liveClean", "真实清理")

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={!props.pathCount}
      compact={compact}
      label={actionLabel}
      idleIcon={dangerous ? <Trash2 /> : <Play />}
      onExecute={() => props.onExecute()}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="cleanf"
        surface={props.surface}
        testId="cleanf-surface"
        collapsedTestId="cleanf-collapsed-view"
        icon={NODE_ICON}
        title="Cleanf"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.pathCount} 条路径 · ${props.selectedPresets.length} 预设 · ${props.previewMode ? "预演" : "真实"}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const presetOptions = PRESET_METAS.map((meta) => ({
    value: meta.id,
    label: tNode("cleanf", meta.labelKey, meta.id),
  }))

  const stats = [
    { label: tNode("cleanf", "stats.total", "总计"), value: props.result?.totalRemoved ?? 0, tone: "primary" as const },
    { label: tNode("cleanf", "stats.skipped", "跳过"), value: props.result?.skipped ?? 0, tone: "neutral" as const },
    { label: tNode("cleanf", "stats.preview", "预演项"), value: props.result?.previewFiles.length ?? 0, tone: "secondary" as const },
    { label: tNode("cleanf", "stats.presets", "预设"), value: props.selectedPresets.length, tone: "tertiary" as const },
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
      nodeId="cleanf"
      surface={props.surface}
      data-testid="cleanf-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title="Cleanf"
          domainTag="CLEAN STUDIO"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.pathCount} 路径 · ${props.selectedPresets.length} 预设 · ${props.previewMode ? "预演保护" : "回收站实执"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="cleanf-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.result}
                icon={Copy}
                label={tNode("cleanf", "actions.copyResults", "复制结果")}
                onClick={props.onCopyResults}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.logs.length}
                icon={Eye}
                label={tNode("cleanf", "copyLogs", "复制日志")}
                onClick={props.onCopyLogs}
              />
              <ActionIconButton
                shapeRole="tertiary"
                disabled={props.running}
                icon={RotateCcw}
                label={tNode("cleanf", "actions.undoLastCleanup", "撤销上次清理")}
                onClick={props.onUndoLastCleanup}
              />
              <NodeConfigPopover
                configPath={props.configFilePath}
                defaults={props.defaults}
                dirty={props.configDirty}
                disabled={props.running}
                t={props.t}
                onOpenFile={props.onOpenConfigFile}
                onReload={props.onReloadDefaults}
                onRestore={props.onRestoreDefault}
                onSave={props.onSaveDefault}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label={tNode("cleanf", "actions.clearState", "清空状态")}
                onClick={props.onReset}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      {props.compactSurface ? (
        <div
          data-testid={props.portraitCompact ? "cleanf-portrait-view" : "cleanf-compact-view"}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-2">
            <Md3eStageLensBar
              items={[
                { id: "setup", label: "目录与预设", badge: props.pathCount },
                { id: "inspect", label: "结果摘要", badge: props.result?.totalRemoved ?? 0 },
              ]}
              value={compactLens}
              onChange={setCompactLens}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {compactLens === "setup" ? (
              <div className="flex flex-col gap-2">
                <Md3eTonalZone tone="primary" title="扫描目标路径" eyebrow="TARGET PATHS">
                  <PathInput
                    compact
                    disabled={props.running}
                    pathCount={props.pathCount}
                    value={props.data.pathText ?? ""}
                    onChange={(pathText) => props.onPatch({ pathText })}
                    onClear={() => props.onPatch({ pathText: "" })}
                    onPaste={props.onPastePath}
                  />
                </Md3eTonalZone>
                <Md3eTonalZone tone="secondary" title="清理预设芯片" eyebrow="PRESETS">
                  <Md3eMultiChoiceChips
                    options={presetOptions}
                    values={props.selectedPresets}
                    disabled={props.running}
                    onToggle={props.onTogglePreset}
                  />
                </Md3eTonalZone>
              </div>
            ) : (
              <Md3eTonalZone tone="default" title="结果摘要" className="h-full">
                <ResultList compact result={props.result} />
              </Md3eTonalZone>
            )}
          </div>

          <Md3eCommandDock
            testId="cleanf-execution-gate"
            leading={
              <div data-testid="cleanf-primary-switches" className="min-w-0 flex-1">
                <Md3eSwitchRow
                  icon={props.previewMode ? ShieldAlert : Sparkles}
                  label="预演模式"
                  checked={props.previewMode}
                  disabled={props.running}
                  onCheckedChange={(previewMode) => props.onPatch({ previewMode })}
                />
              </div>
            }
            trailing={primaryCta(true)}
          />
        </div>
      ) : (
        <div
          data-testid="cleanf-full-view"
          className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
        >
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @2xl/cleanf:grid-cols-[minmax(260px,0.95fr)_minmax(0,1.35fr)]">
            <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
              <Md3eTonalZone
                tone="primary"
                eyebrow="SCAN TARGETS"
                title={tNode("cleanf", "labels.input", "输入")}
                badge={<Md3eStatusPill tone="primary">{props.pathCount} 路径</Md3eStatusPill>}
              >
                <PathInput
                  disabled={props.running}
                  pathCount={props.pathCount}
                  value={props.data.pathText ?? ""}
                  onChange={(pathText) => props.onPatch({ pathText })}
                  onClear={() => props.onPatch({ pathText: "" })}
                  onPaste={props.onPastePath}
                />
              </Md3eTonalZone>

              <Md3eTonalZone
                tone="secondary"
                eyebrow="CLEANUP MATRIX"
                title={tNode("cleanf", "labels.presets", "清理预设")}
                badge={<Md3eStatusPill tone="secondary">{props.selectedPresets.length} 项激活</Md3eStatusPill>}
              >
                <Md3eMultiChoiceChips
                  ariaLabel="清理预设选择"
                  options={presetOptions}
                  values={props.selectedPresets}
                  disabled={props.running}
                  onToggle={props.onTogglePreset}
                />
              </Md3eTonalZone>

              <Md3eTonalZone
                tone="tertiary"
                eyebrow="SAFETY GATE"
                title={tNode("cleanf", "labels.gate", "执行闸门")}
                testId="cleanf-execution-gate"
              >
                <Md3eConnectedGroup data-testid="cleanf-primary-switches">
                  <Md3eSwitchRow
                    icon={props.previewMode ? ShieldAlert : Sparkles}
                    label="预演模式"
                    description={props.previewMode ? "仅扫描生成待删清单，不改动磁盘" : "真实清理并移入系统回收站"}
                    checked={props.previewMode}
                    disabled={props.running}
                    onCheckedChange={(previewMode) => props.onPatch({ previewMode })}
                  />
                  <div className="flex items-center gap-2 bg-[var(--md3e-surface-lowest,var(--muted))]/80 px-3 py-2">
                    <FolderSearch className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
                    <Input
                      aria-label="排除关键词"
                      placeholder="排除关键词（逗号分隔）"
                      value={props.data.excludeKeywords ?? ""}
                      disabled={props.running}
                      onChange={(e) => props.onPatch({ excludeKeywords: e.target.value })}
                      className="h-7 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
                    />
                  </div>
                </Md3eConnectedGroup>
              </Md3eTonalZone>
            </div>

            <Md3eTonalZone
              tone="default"
              eyebrow="INSPECTION STREAM"
              title={tNode("cleanf", "labels.preview", "待删预览")}
              actions={
                <Md3eStageLensBar
                  items={[
                    { id: "results", label: tNode("cleanf", "tabs.results", "结果"), badge: props.result?.previewFiles.length ?? 0, icon: ListChecks },
                    { id: "logs", label: tNode("cleanf", "tabs.logs", "日志"), badge: props.logs.length },
                  ]}
                  value={inspectLens}
                  onChange={setInspectLens}
                />
              }
              bodyClassName="flex min-h-0 flex-col overflow-hidden"
            >
              <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
                {inspectLens === "results" ? (
                  <ResultList result={props.result} />
                ) : (
                  <LogPanel logs={props.logs} onCopy={props.onCopyLogs} />
                )}
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eCommandDock
            leading={
              <div className="flex flex-wrap items-center gap-2">
                <Md3eStatusPill tone={props.previewMode ? "secondary" : "danger"}>
                  {props.previewMode ? "DRY-RUN 预演保护" : "LIVE 回收站实执"}
                </Md3eStatusPill>
                <span className="truncate text-xs text-muted-foreground">
                  {props.data.progressText || `${props.pathCount} 条路径准备就绪`}
                </span>
              </div>
            }
            trailing={primaryCta(false)}
          />
        </div>
      )}
    </Md3eNodeSurface>
  )
}
