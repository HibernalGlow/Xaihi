import { useState } from "react"
import type { TimeuAction, TimeuData } from "@xiranite/node-timeu/core"
import { AlertTriangle, Clipboard, Clock3, Copy, FileClock, FolderInput, History, RotateCcw, ShieldAlert, Sparkles, Terminal, Trash2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Input } from "@/components/ui/input"
import { PathTextarea } from "@/components/ui/path-input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { tNode } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, NODE_ICON } from "./constants"
import type { TimeuCardState, TimeuStatusMeta } from "./types"

export interface TimeuMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: TimeuAction
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  data: TimeuCardState
  defaults?: Partial<TimeuCardState>
  logs: string[]
  paths: string[]
  progress: number
  result: TimeuData | null
  running: boolean
  status: TimeuStatusMeta
  onActionChange: (value: TimeuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: TimeuAction) => void
  onPastePaths: () => void
  onPatch: (patch: Partial<TimeuCardState>) => void
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function TimeuMd3eView(props: TimeuMd3eViewProps) {
  const [lens, setLens] = useState<"records" | "errors" | "logs">("records")
  const dryRun = props.data.dryRun ?? true
  const live = props.action !== "scan" && !dryRun
  const label =
    props.action === "scan"
      ? tNode("timeu", "actionLabel.scan", "扫描时间")
      : props.action === "backup"
        ? tNode("timeu", "actionLabel.backup", "备份时间")
        : tNode("timeu", "actionLabel.restore", "恢复时间")

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={live}
      running={props.running}
      compact={compact}
      label={label}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="timeu"
        surface={props.surface}
        testId="timeu-md3e-surface"
        collapsedTestId="timeu-collapsed-view"
        icon={NODE_ICON}
        title="TimeU"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.paths.length} 条路径 · ${label}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const issueLines = [
    ...(props.result?.errors ?? []),
    ...(props.result?.plan ?? [])
      .filter((item) => item.reason && item.status !== "pending")
      .map((item) => `${item.path}: ${item.reason}`),
  ]

  const stats = [
    { label: tNode("timeu", "stats.paths", "路径"), value: props.paths.length, tone: "primary" as const },
    { label: tNode("timeu", "stats.scanned", "扫描"), value: props.result?.scannedCount ?? 0, tone: "secondary" as const },
    { label: tNode("timeu", "stats.backup", "备份"), value: props.result?.backupCount ?? 0, tone: "tertiary" as const },
    { label: tNode("timeu", "stats.restored", "恢复"), value: props.result?.restoredCount ?? 0, tone: "primary" as const },
    { label: tNode("timeu", "stats.skipped", "跳过"), value: props.result?.skippedCount ?? 0, tone: "neutral" as const },
  ]

  const statusTone =
    props.status.tone === "error"
      ? "danger"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "secondary"
          : "neutral"

  const planItems =
    props.result?.plan ??
    props.paths.map((path) => ({
      path,
      operation: props.action === "restore" ? ("restore" as const) : ("backup" as const),
      status: "pending" as const,
    }))

  return (
    <Md3eNodeSurface
      nodeId="timeu"
      surface={props.surface}
      data-testid="timeu-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title="TimeU"
          domainTag="TIMESTAMP VAULT"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.paths.length} 条路径 · ${label} · ${dryRun ? "预览模式" : "真实写入"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="timeu-header-toolbar"
          actions={
            <>
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.result?.plan.length}
                icon={Copy}
                label="复制结果"
                onClick={props.onCopyResults}
              />
              <NodeConfigButton
                nodeKey="timeu"
                configDirty={props.configDirty}
                defaults={props.defaults}
                disabled={props.running}
                onResetOverride={props.onRestoreDefault}
                onRestoreDefault={props.onRestoreDefault}
                onSaveDefault={props.onSaveDefault}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label={tNode("timeu", "actions.clearState", "清空状态")}
                onClick={props.onReset}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div
        data-testid={
          props.compactSurface
            ? props.portraitCompact
              ? "timeu-portrait-view"
              : "timeu-compact-view"
            : "timeu-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/timeu:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.42fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="PATH QUEUE & RECORD"
              title={tNode("timeu", "sections.pathQueue", "路径队列与快照文件")}
              badge={<Md3eStatusPill tone="primary">{props.paths.length} 项</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <PathTextarea
                    id="timeu-paths"
                    aria-label="timeu paths"
                    className="h-20 min-h-20 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                    disabled={props.running}
                    placeholder={tNode("timeu", "placeholder.paths", "每行一个文件或目录\nD:/archive")}
                    value={props.data.pathsText ?? ""}
                    onValueChange={(pathsText) => props.onPatch({ pathsText })}
                  />
                  <div className="flex flex-col gap-1">
                    <ActionIconButton
                      shapeRole="secondary"
                      disabled={props.running}
                      icon={Clipboard}
                      label={tNode("timeu", "actions.pastePath", "粘贴路径")}
                      onClick={props.onPastePaths}
                    />
                    <ActionIconButton
                      shapeRole="accent"
                      disabled={props.running || !props.data.pathsText}
                      icon={Trash2}
                      label={tNode("timeu", "actions.clearPath", "清空路径")}
                      onClick={() => props.onPatch({ pathsText: "" })}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="timeu-record" className="mb-1 block text-[10px] font-bold text-muted-foreground">
                    {tNode("timeu", "fields.record", "记录文件")}
                  </label>
                  <Input
                    id="timeu-record"
                    disabled={props.running}
                    className="h-8 rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                    placeholder={tNode("timeu", "placeholder.record", "留空则在首个路径旁生成 timeu-timestamps.json")}
                    value={props.data.recordPath ?? ""}
                    onChange={(event) => props.onPatch({ recordPath: event.currentTarget.value })}
                  />
                </div>
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="TIMESTAMP OPERATION"
              title={tNode("timeu", "sections.execution", "时间戳动作与开关")}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="TimeU 动作"
                  options={ACTIONS.map((a) => ({
                    value: a.value,
                    label:
                      a.value === "scan"
                        ? tNode("timeu", "actionShortLabel.scan", "扫描")
                        : a.value === "backup"
                          ? tNode("timeu", "actionShortLabel.backup", "备份")
                          : tNode("timeu", "actionShortLabel.restore", "恢复"),
                    icon: a.icon,
                  }))}
                  value={props.action}
                  disabled={props.running}
                  onChange={props.onActionChange}
                />
                <Md3eConnectedGroup>
                  <Md3eSwitchRow
                    icon={dryRun ? ShieldAlert : Sparkles}
                    label={tNode("timeu", "switches.dryRun", "预览")}
                    checked={dryRun}
                    disabled={props.running}
                    onCheckedChange={(nextDry) => props.onPatch({ dryRun: nextDry })}
                  />
                  <Md3eSwitchRow
                    icon={FolderInput}
                    label={tNode("timeu", "switches.recursive", "递归")}
                    checked={props.data.recursive ?? true}
                    disabled={props.running}
                    onCheckedChange={(recursive) => props.onPatch({ recursive })}
                  />
                  <Md3eSwitchRow
                    icon={FileClock}
                    label={tNode("timeu", "switches.includeDirectories", "含目录")}
                    checked={props.data.includeDirectories ?? false}
                    disabled={props.running}
                    onCheckedChange={(includeDirectories) => props.onPatch({ includeDirectories })}
                  />
                </Md3eConnectedGroup>
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="TIME LEDGER"
            title={tNode("timeu", "sections.timeRecords", "时间记录与偏移对照")}
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "records", label: tNode("timeu", "tabs.records", "记录"), icon: History, badge: planItems.length },
                  { id: "errors", label: tNode("timeu", "tabs.errors", "问题"), icon: AlertTriangle, badge: issueLines.length },
                  { id: "logs", label: tNode("timeu", "tabs.logs", "日志"), icon: Terminal, badge: props.logs.length },
                ]}
                value={lens}
                onChange={setLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              {lens === "records" ? (
                <ScrollArea className="h-full">
                  {planItems.length ? (
                    <div className="flex flex-col gap-1.5 p-1">
                      {planItems.slice(0, 160).map((item, idx) => {
                        const current = "current" in item ? item.current : undefined
                        const stored = "stored" in item ? item.stored : undefined
                        return (
                          <div
                            key={`${item.path}:${idx}`}
                            className="flex flex-col gap-1.5 rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2 text-xs transition-all hover:rounded-[22px]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <Clock3 className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
                                <span className="truncate font-mono font-bold">{item.path}</span>
                              </div>
                              <Md3eStatusPill
                                tone={
                                  item.status === "error"
                                    ? "danger"
                                    : item.status === "success"
                                      ? "secondary"
                                      : "primary"
                                }
                              >
                                {item.status}
                              </Md3eStatusPill>
                            </div>
                            {(current || stored) ? (
                              <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] text-muted-foreground">
                                <div className="rounded-[10px] bg-[var(--md3e-surface-lowest,var(--muted))] px-2 py-1">
                                  现 mtime: {current?.mtimeMs ? new Date(current.mtimeMs).toLocaleString() : "—"}
                                </div>
                                <div className="rounded-[10px] bg-[var(--md3e-surface-lowest,var(--muted))] px-2 py-1">
                                  档 mtime: {stored?.mtimeMs ? new Date(stored.mtimeMs).toLocaleString() : "—"}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex h-44 items-center justify-center p-4 text-center text-xs text-muted-foreground">
                      {tNode("timeu", "empty.timestampRows", "运行后显示当前时间、记录时间和恢复计划。")}
                    </div>
                  )}
                </ScrollArea>
              ) : lens === "errors" ? (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-1.5 p-2 font-mono text-xs text-muted-foreground">
                    {issueLines.length ? (
                      issueLines.map((line, i) => (
                        <div key={`${line}:${i}`} className="rounded-[12px] bg-destructive/10 px-2.5 py-1.5 text-destructive">
                          {line}
                        </div>
                      ))
                    ) : (
                      <div className="py-10 text-center">{tNode("timeu", "empty.noIssues", "暂无问题")}</div>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-full">
                  <pre className="p-2 font-mono text-xs leading-5 text-muted-foreground">
                    {props.logs.length ? props.logs.join("\n") : tNode("timeu", "empty.logsHere", "运行日志会显示在这里。")}
                  </pre>
                </ScrollArea>
              )}
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={live ? "danger" : "secondary"}>
                {dryRun ? tNode("timeu", "badges.preview", "预览") : tNode("timeu", "badges.write", "写入")}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `${props.paths.length} 条路径准备就绪`}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
