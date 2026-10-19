import type { MvzAction, MvzData } from "@xiranite/node-mvz/core"
import { parseMvzEntries } from "@xiranite/node-mvz/archive-entries"
import { Copy, FolderOpen, Layers, MapPin, Package, Play, RotateCcw, ShieldAlert, Sparkles } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
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
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, findActionMeta } from "./constants"
import { AdvancedOptionsPopover, EntryInput, OutputInput, RenameFields, ResultTabs } from "./controls"
import type { MvzCardState, MvzPhase, MvzStatusMeta } from "./types"

export interface MvzMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: MvzAction
  actionMeta: ReturnType<typeof findActionMeta>
  archiveCount: number
  configDirty: boolean
  configFilePath?: string
  data: MvzCardState
  defaults?: Partial<MvzCardState>
  dryRun: boolean
  entryCount: number
  logs: string[]
  outputDisabled: boolean
  pathOptionsDisabled: boolean
  phase: MvzPhase
  progress: number
  result: MvzData | null
  running: boolean
  status: MvzStatusMeta
  onActionChange: (value: MvzAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: MvzAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPasteEntries: () => void
  onPasteOutput: () => void
  onPatch: (patch: Partial<MvzCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function MvzMd3eView(props: MvzMd3eViewProps) {
  const disabled = !props.entryCount || (props.action === "rename" && !props.data.pattern?.trim())
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
        nodeId="mvz"
        surface={props.surface}
        testId="mvz-md3e-surface"
        collapsedTestId="mvz-collapsed-view"
        icon={Package}
        title="MVZ"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.entryCount} 条 · ${props.archiveCount} 包 · ${props.actionMeta.shortLabel}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const entries = parseMvzEntries(props.data.entryText ?? "", props.data.separator || "//")

  const stats = [
    { label: "总计", value: props.result?.totalFiles ?? props.entryCount, tone: "primary" as const },
    { label: "压缩包", value: props.result?.totalArchives ?? props.archiveCount, tone: "secondary" as const },
    { label: "成功", value: props.result?.successCount ?? 0, tone: "tertiary" as const },
    { label: "失败", value: props.result?.failedCount ?? 0, tone: "danger" as const },
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
      nodeId="mvz"
      surface={props.surface}
      data-testid="mvz-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Package}
          title="MVZ"
          domainTag="ARCHIVE SURGERY"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.actionMeta.label} · ${props.dryRun ? "预演" : "真实执行"} · ${props.archiveCount} 包 / ${props.entryCount} 条`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="mvz-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running || !props.result?.results.length}
                icon={Copy}
                label="复制结果"
                onClick={props.onCopyResults}
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
              <NodeConfigButton
                nodeKey="mvz"
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
              ? "mvz-portrait-view"
              : "mvz-compact-view"
            : "mvz-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/mvz:grid-cols-[minmax(280px,1.05fr)_minmax(0,1.35fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="ARCHIVE OPERATION"
              title="归档内操作模式"
              badge={<Md3eStatusPill tone="primary">{props.actionMeta.label}</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="归档操作"
                  options={ACTIONS.map((a) => ({ value: a.value, label: a.label, icon: a.icon }))}
                  value={props.action}
                  disabled={props.running}
                  onChange={props.onActionChange}
                />
                {props.action === "rename" ? (
                  <RenameFields
                    compact={props.compactSurface}
                    disabled={props.running}
                    pattern={props.data.pattern}
                    replacement={props.data.replacement}
                    onPatternChange={(pattern) => props.onPatch({ pattern })}
                    onReplacementChange={(replacement) => props.onPatch({ replacement })}
                  />
                ) : null}
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="ARCHIVE ENTRIES"
              title="压缩包条目流 (archive//internal)"
              badge={<Md3eStatusPill tone="secondary">{props.entryCount} 条 / {props.archiveCount} 包</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <EntryInput
                  compact={props.compactSurface}
                  disabled={props.running}
                  entryCount={props.entryCount}
                  archiveCount={props.archiveCount}
                  value={props.data.entryText ?? ""}
                  onChange={(entryText) => props.onPatch({ entryText })}
                  onClear={() => props.onPatch({ entryText: "" })}
                  onPaste={props.onPasteEntries}
                />
                {!props.pathOptionsDisabled ? (
                  <OutputInput
                    compact={props.compactSurface}
                    disabled={props.running || props.outputDisabled}
                    value={props.data.output ?? ""}
                    onChange={(output) => props.onPatch({ output })}
                    onPaste={props.onPasteOutput}
                  />
                ) : null}
              </div>
            </Md3eTonalZone>

            <Md3eConnectedGroup>
              {!props.pathOptionsDisabled ? (
                <>
                  <Md3eSwitchRow
                    icon={MapPin}
                    label="就近输出 (Near)"
                    description="直接提取到各压缩包所在同级目录"
                    checked={props.data.near ?? true}
                    disabled={props.running}
                    onCheckedChange={(near) => props.onPatch({ near })}
                  />
                  <Md3eSwitchRow
                    icon={FolderOpen}
                    label="自动建包名目录"
                    description="以压缩包名创建独立子文件夹"
                    checked={props.data.autoDir ?? true}
                    disabled={props.running}
                    onCheckedChange={(autoDir) => props.onPatch({ autoDir })}
                  />
                  <Md3eSwitchRow
                    icon={Layers}
                    label="扁平提取 (Flatten)"
                    description="忽略包内嵌套目录层级"
                    checked={props.data.flatten ?? false}
                    disabled={props.running}
                    onCheckedChange={(flatten) => props.onPatch({ flatten })}
                  />
                </>
              ) : null}
              <Md3eSwitchRow
                icon={props.dryRun ? ShieldAlert : Sparkles}
                label="预演模式"
                description={props.dryRun ? "仅生成命令与影响预览，不修改归档" : "直接修改或提取压缩包内容"}
                checked={props.dryRun}
                disabled={props.running}
                onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
              />
            </Md3eConnectedGroup>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="EXPLORER & RESULTS"
            title="包内条目快照与执行回读"
            bodyClassName="flex min-h-0 flex-col gap-2 overflow-hidden"
          >
            {entries.length > 0 && !props.result ? (
              <div className="max-h-36 shrink-0 overflow-auto rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/75 p-2">
                <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>待处理条目预览</span>
                  <span>{entries.length} 项</span>
                </div>
                <div className="flex flex-col gap-1">
                  {entries.slice(0, 8).map((item) => (
                    <div
                      key={item.rawLine}
                      className="flex items-center justify-between gap-2 rounded-[12px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-1 text-[11px]"
                    >
                      <span className="truncate font-mono font-semibold text-foreground">
                        {item.internalPath}
                      </span>
                      <span className="max-w-36 shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                        {item.archivePath}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <ResultTabs
                compact={props.compactSurface}
                logs={props.logs}
                result={props.result}
                onCopyLogs={props.onCopyLogs}
                onCopyResults={props.onCopyResults}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={props.dryRun ? "secondary" : "danger"}>
                {props.dryRun ? "DRY-RUN 预演" : "LIVE 实执"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `${props.entryCount} 条目 · ${props.archiveCount} 压缩包`}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
