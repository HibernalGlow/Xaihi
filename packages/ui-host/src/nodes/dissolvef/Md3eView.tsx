import type { DissolvefConflictMode, DissolvefData } from "@xiranite/node-dissolvef/core"
import { Eye, FolderTree, Gauge, History, Layers, PackageOpen, RotateCcw, ShieldAlert, Sparkles, Undo2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eMultiChoiceChips,
  Md3eNodeSurface,
  Md3eStepperSlider,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import { tNode, type useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { BUNDLE_MODES, CONFLICT_MODES, DEFAULT_THRESHOLD, DISSOLVE_ICON, NODE_ICON } from "./constants"
import { AdvancedOptionsPopover, DissolveHistoryBoard, DissolvePlanBoard, PathInput, RichLogPanel } from "./controls"
import type { DissolvefAction, DissolvefCardState, DissolvefStatusMeta } from "./types"
import { useState } from "react"
import { Md3eStageLensBar } from "@/nodes/shared/Md3eExpressiveKit"

export interface DissolvefMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configFilePath?: string
  data: DissolvefCardState
  defaults?: Partial<DissolvefCardState>
  direct: boolean
  logs: string[]
  preview: boolean
  progress: number
  result: DissolvefData | null
  running: boolean
  selectedModes: string[]
  status: DissolvefStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onCopyLogs: () => void
  onExecute: (action: DissolvefAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPastePath: () => void
  onPatch: (patch: Partial<DissolvefCardState>) => void
  onReloadDefaults: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onSetDirect: (direct: boolean) => void
  onToggleMode: (mode: "nested" | "media" | "archive") => void
}

export function DissolvefMd3eView(props: DissolvefMd3eViewProps) {
  const [lens, setLens] = useState<"plan" | "history" | "logs">("plan")
  const disabled = !props.data.pathText?.trim()
  const dangerous = !props.preview
  const label = props.preview
    ? tNode("dissolvef", "actions.dryDissolve", "预演溶解")
    : tNode("dissolvef", "actions.liveDissolve", "真实溶解")
  const DissolveIcon = DISSOLVE_ICON

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={disabled}
      compact={compact}
      size={compact ? "xs" : "sm"}
      label={label}
      idleIcon={<DissolveIcon />}
      onExecute={() => props.onExecute("dissolve")}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="dissolvef"
        surface={props.surface}
        testId="dissolvef-surface"
        collapsedTestId="dissolvef-collapsed-view"
        icon={NODE_ICON}
        title={tNode("dissolvef", "name", "DissolveF")}
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.direct ? "直提" : "捆绑"} · ${props.preview ? "预演" : "真实"}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const stats = [
    { label: tNode("dissolvef", "stats.total", "总计"), value: props.result?.totalCount ?? 0, tone: "primary" as const },
    { label: tNode("dissolvef", "stats.nested", "嵌套"), value: props.result?.nestedCount ?? 0, tone: "secondary" as const },
    { label: tNode("dissolvef", "stats.media", "媒体"), value: props.result?.mediaCount ?? 0, tone: "tertiary" as const },
    { label: tNode("dissolvef", "stats.archive", "归档"), value: props.result?.archiveCount ?? 0, tone: "neutral" as const },
    { label: tNode("dissolvef", "stats.skipped", "跳过"), value: props.result?.skippedCount ?? 0, tone: "neutral" as const },
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
      nodeId="dissolvef"
      surface={props.surface}
      data-testid="dissolvef-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title={tNode("dissolvef", "name", "DissolveF")}
          domainTag="TOPOLOGY DISSOLVER"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.direct ? "直提模式" : "智能捆绑溶解"} · ${props.preview ? "预演保护" : "真实执行"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="dissolvef-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover
                data={props.data}
                direct={props.direct}
                disabled={props.running}
                onPatch={props.onPatch}
              />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running}
                icon={History}
                label={tNode("dissolvef", "actions.history", "读取历史")}
                onClick={() => props.onExecute("history")}
              />
              <ActionIconButton
                shapeRole="tertiary"
                disabled={props.running || !(props.result?.history?.length ?? 0)}
                icon={Undo2}
                label={tNode("dissolvef", "actions.undoRecent", "撤销最近")}
                onClick={() => props.onExecute("undo")}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label={tNode("dissolvef", "actions.clearState", "清空状态")}
                onClick={props.onReset}
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
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div
        data-testid={
          props.compactSurface
            ? props.portraitCompact
              ? "dissolvef-portrait-view"
              : "dissolvef-compact-view"
            : "dissolvef-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/dissolvef:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.4fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="TARGET FOLDER"
              title="待溶解根目录"
            >
              <PathInput
                compact
                disabled={props.running}
                value={props.data.pathText ?? ""}
                onChange={(pathText) => props.onPatch({ pathText })}
                onClear={() => props.onPatch({ pathText: "" })}
                onPaste={props.onPastePath}
              />
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="DISSOLVE STRATEGY"
              title={tNode("dissolvef", "workspace.rules", "溶解规则")}
              badge={
                <Md3eStatusPill tone="secondary">
                  {props.direct ? "直提" : `${props.selectedModes.length} 项捆绑`}
                </Md3eStatusPill>
              }
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="溶解主模式"
                  options={[
                    { value: "bundle", label: "智能捆绑溶解", icon: Layers },
                    { value: "direct", label: "直接上提全部", icon: PackageOpen },
                  ]}
                  value={props.direct ? "direct" : "bundle"}
                  disabled={props.running}
                  onChange={(v) => props.onSetDirect(v === "direct")}
                />
                {!props.direct ? (
                  <Md3eMultiChoiceChips
                    ariaLabel="捆绑子模式"
                    options={BUNDLE_MODES.map((m) => ({
                      value: m.value,
                      label: m.label,
                      sublabel: m.shortLabel,
                    }))}
                    values={props.selectedModes as Array<"nested" | "media" | "archive">}
                    disabled={props.running}
                    onToggle={props.onToggleMode}
                  />
                ) : null}
              </div>
            </Md3eTonalZone>

            <Md3eConnectedGroup>
              <Md3eSwitchRow
                icon={FolderTree}
                label="保护首层目录"
                description="保留顶层子目录结构，仅向下溶解深层嵌套"
                checked={props.data.protectFirstLevel ?? true}
                disabled={props.running || props.direct}
                onCheckedChange={(protectFirstLevel) => props.onPatch({ protectFirstLevel })}
              />
              <Md3eSwitchRow
                icon={Sparkles}
                label="名称相似度校验"
                description="仅当父子名称高度相似时才自动上提"
                checked={props.data.enableSimilarity ?? true}
                disabled={props.running || props.direct}
                onCheckedChange={(enableSimilarity) => props.onPatch({ enableSimilarity })}
              />
              {(props.data.enableSimilarity ?? true) && !props.direct ? (
                <Md3eStepperSlider
                  icon={Gauge}
                  label="相似度阈值"
                  value={props.data.similarityThreshold ?? DEFAULT_THRESHOLD}
                  min={0.1}
                  max={1}
                  step={0.05}
                  disabled={props.running}
                  onChange={(similarityThreshold) => props.onPatch({ similarityThreshold })}
                />
              ) : null}
            </Md3eConnectedGroup>

            <Md3eTonalZone
              tone="tertiary"
              eyebrow="COLLISION POLICY"
              title="同名冲突裁决"
            >
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] font-bold text-muted-foreground">文件冲突</div>
                <Md3eChoiceChips
                  ariaLabel="文件冲突策略"
                  options={CONFLICT_MODES.map((c) => ({ value: c.value, label: c.label }))}
                  value={(props.data.fileConflict as DissolvefConflictMode) ?? "auto"}
                  disabled={props.running}
                  onChange={(fileConflict) => props.onPatch({ fileConflict })}
                />
                <div className="mt-1 text-[10px] font-bold text-muted-foreground">目录冲突</div>
                <Md3eChoiceChips
                  ariaLabel="目录冲突策略"
                  options={CONFLICT_MODES.map((c) => ({ value: c.value, label: c.label }))}
                  value={(props.data.dirConflict as DissolvefConflictMode) ?? "auto"}
                  disabled={props.running}
                  onChange={(dirConflict) => props.onPatch({ dirConflict })}
                />
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="TOPOLOGY PREVIEW"
            title={tNode("dissolvef", "workspace.topology", "结构变换预览")}
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "plan", label: tNode("dissolvef", "tabs.plan", "计划"), badge: props.result?.totalCount ?? 0 },
                  { id: "history", label: tNode("dissolvef", "tabs.history", "历史"), badge: props.result?.history?.length ?? 0 },
                  { id: "logs", label: tNode("dissolvef", "tabs.logs", "日志"), badge: props.logs.length },
                ]}
                value={lens}
                onChange={setLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              {lens === "plan" ? (
                <DissolvePlanBoard compact={props.compactSurface} result={props.result} />
              ) : lens === "history" ? (
                <DissolveHistoryBoard
                  compact={props.compactSurface}
                  result={props.result}
                  onUndo={() => props.onExecute("undo")}
                />
              ) : (
                <RichLogPanel compact={props.compactSurface} logs={props.logs} onCopy={props.onCopyLogs} />
              )}
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          testId="dissolvef-execution-gate"
          leading={
            <Md3eSwitchRow
              icon={props.preview ? Eye : ShieldAlert}
              label={props.preview ? "预演：不移动或删除" : "真实：将移动并删除空壳"}
              ariaLabel={tNode("dissolvef", "aria.previewSwitch", "dissolvef preview switch")}
              checked={props.preview}
              disabled={props.running}
              onCheckedChange={(preview) => props.onPatch({ preview })}
              className="py-1"
            />
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
