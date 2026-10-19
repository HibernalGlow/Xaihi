import { useState } from "react"
import type { NameuAction, NameuData, NameuMode } from "@xiranite/node-nameu/core"
import { AlertTriangle, Clipboard, Copy, FileArchive, FilePenLine, FolderInput, GitCompare, ListChecks, RotateCcw, ShieldAlert, Sparkles, Terminal, Trash2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { PathTextarea } from "@/components/ui/path-input"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, MODES, NODE_ICON } from "./constants"
import type { NameuCardState, NameuStatusMeta } from "./types"

export interface NameuMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: NameuAction
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  data: NameuCardState
  defaults?: Partial<NameuCardState>
  logs: string[]
  paths: string[]
  progress: number
  result: NameuData | null
  running: boolean
  status: NameuStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: NameuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: NameuAction) => void
  onPastePaths: () => void
  onPatch: (patch: Partial<NameuCardState>) => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function NameuMd3eView(props: NameuMd3eViewProps) {
  const [lens, setLens] = useState<"plan" | "issues" | "logs">("plan")
  const dryRun = props.data.dryRun ?? true
  const live = props.action === "rename" && !dryRun

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      compact={compact}
      running={props.running}
      dangerous={live}
      label={props.actionMeta.label}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="nameu"
        surface={props.surface}
        testId="nameu-md3e-surface"
        collapsedTestId="nameu-collapsed-view"
        icon={NODE_ICON}
        title="NameU"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.paths.length} 条路径 · ${props.actionMeta.shortLabel}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const issueLines = [
    ...(props.result?.errors ?? []),
    ...(props.result?.items ?? [])
      .filter((item) => item.reason && item.status !== "ready")
      .map((item) => `${item.sourcePath}: ${item.reason}`),
  ]

  const stats = [
    { label: "路径", value: props.paths.length, tone: "primary" as const },
    { label: "扫描", value: props.result?.scannedCount ?? 0, tone: "secondary" as const },
    { label: "待改", value: props.result?.readyCount ?? 0, tone: "tertiary" as const },
    { label: "已改", value: props.result?.renamedCount ?? 0, tone: "primary" as const },
    { label: "冲突", value: props.result?.conflictCount ?? 0, tone: "danger" as const },
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
      nodeId="nameu"
      surface={props.surface}
      data-testid="nameu-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title="NameU"
          domainTag="ARTIST RENAMER"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.paths.length} 条路径 · ${props.actionMeta.label} · ${dryRun ? "预览模式" : "真实改名"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="nameu-header-toolbar"
          actions={
            <>
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.result?.items.length}
                icon={Copy}
                label="复制计划"
                onClick={props.onCopyResults}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.logs.length}
                icon={Terminal}
                label="复制日志"
                onClick={props.onCopyLogs}
              />
              <NodeConfigPopover
                configPath={props.configPath}
                defaults={props.defaults as Record<string, unknown> | undefined}
                dirty={props.configDirty}
                disabled={props.running}
                loading={props.configLoading}
                t={props.t}
                onOpenFile={props.onOpenConfigFile}
                onReload={props.onLoadDefaults}
                onRestore={props.onRestoreDefault}
                onSave={props.onSaveDefault}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label="清空状态"
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
              ? "nameu-portrait-view"
              : "nameu-compact-view"
            : "nameu-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/nameu:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.42fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="LIBRARY & ARTIST PATHS"
              title="库目录或艺术家目录"
              badge={<Md3eStatusPill tone="primary">{props.paths.length} 条</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="路径模式"
                  options={MODES.map((m) => ({ value: m.value as NameuMode, label: m.label, icon: m.icon }))}
                  value={props.data.mode ?? "multi"}
                  disabled={props.running}
                  onChange={(mode) => props.onPatch({ mode })}
                />
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <PathTextarea
                    id="nameu-paths"
                    aria-label="nameu paths"
                    className="h-20 min-h-20 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                    disabled={props.running}
                    placeholder={"每行一个目录\nD:/archives"}
                    value={props.data.pathsText ?? ""}
                    onValueChange={(pathsText) => props.onPatch({ pathsText })}
                  />
                  <div className="flex flex-col gap-1">
                    <ActionIconButton
                      shapeRole="secondary"
                      disabled={props.running}
                      icon={Clipboard}
                      label="粘贴路径"
                      onClick={props.onPastePaths}
                    />
                    <ActionIconButton
                      shapeRole="accent"
                      disabled={props.running || !props.data.pathsText}
                      icon={Trash2}
                      label="清空路径"
                      onClick={() => props.onPatch({ pathsText: "" })}
                    />
                  </div>
                </div>
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="NAMING RULES & STAGE"
              title="改名阶段与规范开关"
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="改名动作"
                  options={ACTIONS.map((a) => ({ value: a.value, label: a.shortLabel, icon: a.icon }))}
                  value={props.action}
                  disabled={props.running}
                  onChange={props.onActionChange}
                />
                <Md3eConnectedGroup>
                  <Md3eSwitchRow
                    icon={dryRun ? ShieldAlert : Sparkles}
                    label="预览"
                    description="仅生成改名对照表而不改动磁盘文件"
                    checked={dryRun}
                    disabled={props.running}
                    onCheckedChange={(nextDry) => props.onPatch({ dryRun: nextDry })}
                  />
                  <Md3eSwitchRow
                    icon={FilePenLine}
                    label="补作者名"
                    description="自动从父级画师目录名补全前缀标签"
                    checked={props.data.addArtistName ?? true}
                    disabled={props.running}
                    onCheckedChange={(addArtistName) => props.onPatch({ addArtistName })}
                  />
                  <Md3eSwitchRow
                    icon={FolderInput}
                    label="递归"
                    description="递归扫描子级目录中的归档与文件夹"
                    checked={props.data.recursive ?? true}
                    disabled={props.running}
                    onCheckedChange={(recursive) => props.onPatch({ recursive })}
                  />
                  <Md3eSwitchRow
                    icon={ListChecks}
                    label="整理目录"
                    description="规范化画师目录括号与空格格式"
                    checked={props.data.normalizeFolders ?? true}
                    disabled={props.running}
                    onCheckedChange={(normalizeFolders) => props.onPatch({ normalizeFolders })}
                  />
                </Md3eConnectedGroup>
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="DIFF WORKBENCH"
            title="改名计划与前后差分检视"
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "plan", label: "计划", icon: GitCompare, badge: props.result?.items.length ?? 0 },
                  { id: "issues", label: "问题", icon: AlertTriangle, badge: issueLines.length },
                  { id: "logs", label: "日志", icon: Terminal, badge: props.logs.length },
                ]}
                value={lens}
                onChange={setLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              {lens === "plan" ? (
                <ScrollArea className="h-full">
                  {(props.result?.items.length ?? 0) > 0 ? (
                    <div className="flex flex-col gap-1.5 p-1">
                      {props.result!.items.slice(0, 180).map((item, idx) => (
                        <div
                          key={`${item.sourcePath}:${idx}`}
                          className="flex items-start justify-between gap-2 rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2 text-xs transition-all hover:rounded-[22px]"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <FileArchive className="mt-0.5 size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
                            <div className="min-w-0">
                              <div className="truncate font-mono text-[11px] text-muted-foreground line-through">
                                {item.sourceName}
                              </div>
                              <div className="truncate font-mono text-xs font-bold text-foreground">
                                → {item.targetName}
                              </div>
                              {item.artistName ? (
                                <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                  {item.artistName}{item.reason ? ` · ${item.reason}` : ""}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <Md3eStatusPill
                            tone={
                              item.status === "conflict" || item.status === "error"
                                ? "danger"
                                : item.status === "renamed"
                                  ? "secondary"
                                  : "primary"
                            }
                          >
                            {item.status}
                          </Md3eStatusPill>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-44 items-center justify-center p-4 text-center text-xs text-muted-foreground">
                      {props.paths.length ? "运行预览后显示改名计划。" : "输入目录后预览改名计划。"}
                    </div>
                  )}
                </ScrollArea>
              ) : lens === "issues" ? (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-1.5 p-2 font-mono text-xs text-muted-foreground">
                    {issueLines.length ? (
                      issueLines.map((line, i) => (
                        <div key={`${line}:${i}`} className="rounded-[12px] bg-destructive/10 px-2.5 py-1.5 text-destructive">
                          {line}
                        </div>
                      ))
                    ) : (
                      <div className="py-10 text-center">暂无问题</div>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-full">
                  <pre className="p-2 font-mono text-xs leading-5 text-muted-foreground">
                    {props.logs.length ? props.logs.join("\n") : "运行日志会显示在这里。"}
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
                {live ? "写入模式" : "预览保护"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || props.actionMeta.description}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
