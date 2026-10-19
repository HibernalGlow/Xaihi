import type { MigratefAction, MigratefData, MigratefMode } from "@xiranite/node-migratef/core"
import { Copy, FolderSync, History, Play, RotateCcw, ShieldAlert, Sparkles, Undo2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, MODES } from "./constants"
import { AdvancedOptionsPopover, ResultTabs, SourceInput, TargetInput } from "./controls"
import type { MigratefActionMode, MigratefCardState, MigratefPhase, MigratefStatusMeta } from "./types"

export interface MigratefMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: MigratefActionMode
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  configFilePath?: string
  data: MigratefCardState
  defaults?: Partial<MigratefCardState>
  dryRun: boolean
  logs: string[]
  mode: MigratefMode
  modeMeta: (typeof MODES)[number]
  phase: MigratefPhase
  progress: number
  result: MigratefData | null
  running: boolean
  sourceCount: number
  status: MigratefStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: MigratefActionMode) => void
  onCopyLogs: () => void
  onExecute: (action: MigratefAction, override?: Partial<MigratefCardState>) => void
  onModeChange: (value: MigratefMode) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPasteSource: () => void
  onPasteTarget: () => void
  onPatch: (patch: Partial<MigratefCardState>) => void
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
  onUndo: (batchId?: string) => void
}

export function MigratefMd3eView(props: MigratefMd3eViewProps) {
  const disabled = !props.sourceCount || !props.data.targetPath?.trim()
  const label = props.dryRun ? `预演${props.actionMeta.shortLabel}` : `真实${props.actionMeta.shortLabel}`

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={!props.dryRun}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={props.dryRun ? <Play /> : <ShieldAlert />}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="migratef"
        surface={props.surface}
        testId="migratef-md3e-surface"
        collapsedTestId="migratef-collapsed-view"
        icon={FolderSync}
        title="MigrateF"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.sourceCount} 源 · ${props.modeMeta.shortLabel} · ${props.dryRun ? "预演" : "真实"}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const stats = [
    { label: "总计", value: props.result?.totalCount ?? 0, tone: "primary" as const },
    { label: "迁移", value: props.result?.migratedCount ?? 0, tone: "secondary" as const },
    { label: "跳过", value: props.result?.skippedCount ?? 0, tone: "neutral" as const },
    { label: "失败", value: props.result?.failedCount ?? props.result?.errorCount ?? 0, tone: "danger" as const },
    { label: "批次", value: props.result?.operationId ? props.result.operationId.slice(0, 6) : "-", tone: "tertiary" as const },
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
      nodeId="migratef"
      surface={props.surface}
      data-testid="migratef-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={FolderSync}
          title="MigrateF"
          domainTag="MIGRATION PIPELINE"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.modeMeta.label} · ${props.actionMeta.label} · ${props.dryRun ? "预演" : "真实执行"} · ${props.sourceCount} 源`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="migratef-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running}
                icon={History}
                label="读取历史"
                onClick={() => props.onExecute("history")}
              />
              <ActionIconButton
                shapeRole="tertiary"
                disabled={props.running}
                icon={Undo2}
                label="撤销最近"
                onClick={() => props.onUndo()}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.logs.length}
                icon={Copy}
                label="复制日志"
                onClick={props.onCopyLogs}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label="清空状态"
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
              ? "migratef-portrait-view"
              : "migratef-compact-view"
            : "migratef-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/migratef:grid-cols-[minmax(280px,1fr)_minmax(0,1.4fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="TOPOLOGY & ACTION"
              title="结构与迁移方式"
              badge={<Md3eStatusPill tone="primary">{props.modeMeta.shortLabel} · {props.actionMeta.shortLabel}</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="目录结构模式"
                  options={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
                  value={props.mode}
                  disabled={props.running}
                  onChange={props.onModeChange}
                />
                <Md3eChoiceChips
                  ariaLabel="迁移动作"
                  options={ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
                  value={props.action}
                  disabled={props.running}
                  onChange={props.onActionChange}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="SOURCE → DESTINATION"
              title="迁移管道端点"
              badge={<Md3eStatusPill tone="secondary">{props.sourceCount} 个源</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2.5">
                <SourceInput
                  compact={props.compactSurface}
                  disabled={props.running}
                  pathCount={props.sourceCount}
                  value={props.data.sourceText ?? ""}
                  onChange={(sourceText) => props.onPatch({ sourceText })}
                  onClear={() => props.onPatch({ sourceText: "" })}
                  onPaste={props.onPasteSource}
                />
                <TargetInput
                  compact={props.compactSurface}
                  disabled={props.running}
                  value={props.data.targetPath ?? ""}
                  onChange={(targetPath) => props.onPatch({ targetPath })}
                  onPaste={props.onPasteTarget}
                />
              </div>
            </Md3eTonalZone>

            <Md3eConnectedGroup>
              <Md3eSwitchRow
                icon={props.dryRun ? ShieldAlert : Sparkles}
                label="预演模式"
                description={props.dryRun ? "仅生成迁移计划与冲突校验" : "真实移动或复制文件到目标目录"}
                checked={props.dryRun}
                disabled={props.running}
                onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
              />
            </Md3eConnectedGroup>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="MANIFEST & TELEMETRY"
            title="迁移清单与批次检视"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
            actions={
              props.result?.operationId ? (
                <Button
                  disabled={props.running}
                  size="xs"
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => props.onUndo(props.result?.operationId)}
                >
                  <Undo2 className="size-3.5" />
                  撤销批次 {props.result.operationId.slice(0, 6)}
                </Button>
              ) : null
            }
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <ResultTabs
                compact={props.compactSurface}
                logs={props.logs}
                result={props.result}
                onCopyLogs={props.onCopyLogs}
                onUndo={props.onUndo}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={props.dryRun ? "secondary" : "danger"}>
                {props.dryRun ? "预演模式" : "真实写入"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `${props.sourceCount} 个源路径 → ${props.data.targetPath || "未指定目标"}`}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
