import { useState } from "react"
import type { ClassqAction, ClassqData, ClassqTransferMode } from "@xiranite/node-classq/core"
import { AlertTriangle, Clipboard, Copy, File, Folder, ListTree, Play, RotateCcw, Search, ShieldAlert, Sparkles, Terminal, Trash2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Input } from "@/components/ui/input"
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
import { ACTIONS, NODE_ICON, PLAN_ICON, TRANSFER_MODES } from "./constants"
import type { ClassqCardState, ClassqStatusMeta } from "./types"

export interface ClassqMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: ClassqAction
  actionMeta: (typeof ACTIONS)[number]
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  data: ClassqCardState
  defaults?: Partial<ClassqCardState>
  logs: string[]
  progress: number
  result: ClassqData | null
  roots: string[]
  running: boolean
  status: ClassqStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: ClassqAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: ClassqAction) => void
  onPastePaths: () => void
  onPatch: (patch: Partial<ClassqCardState>) => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onReset: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function ClassqMd3eView(props: ClassqMd3eViewProps) {
  const [lens, setLens] = useState<"plan" | "issues" | "logs">("plan")
  const dryRun = props.data.dryRun ?? true
  const live = props.action === "classify" && !dryRun
  const label =
    props.action === "plan"
      ? props.t("actions.scanRoots", "扫描目录")
      : dryRun
        ? props.t("actions.previewClassify", "预演分类")
        : props.t("actions.liveClassify", "执行分类")

  const primaryCta = (compact?: boolean, overrideAction?: ClassqAction) => {
    const act = overrideAction ?? props.action
    const actLabel =
      act === "plan"
        ? props.t("actions.scanRoots", "扫描目录")
        : dryRun
          ? props.t("actions.previewClassify", "预演分类")
          : props.t("actions.liveClassify", "执行分类")
    return (
      <ExecuteButton
        compact={compact}
        running={props.running}
        dangerous={act === "classify" && !dryRun}
        idleIcon={act === "plan" ? <Search /> : <Play />}
        label={actLabel}
        variant={act === "plan" ? "secondary" : undefined}
        onExecute={() => props.onExecute(act)}
      />
    )
  }

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="classq"
        surface={props.surface}
        testId="classq-surface"
        collapsedTestId="classq-collapsed-view"
        icon={NODE_ICON}
        title="ClassQ"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.roots.length} 个根目录 · 就绪 ${props.result?.readyCount ?? 0}`
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
    { label: props.t("metrics.roots", "根目录"), value: props.roots.length, tone: "primary" as const },
    { label: props.t("metrics.keyword", "关键词"), value: props.result?.keywordCount ?? 0, tone: "secondary" as const },
    { label: props.t("metrics.wait", "等待"), value: props.result?.waitCount ?? 0, tone: "tertiary" as const },
    { label: props.t("metrics.ready", "就绪"), value: props.result?.readyCount ?? 0, tone: "primary" as const },
    { label: props.t("metrics.moved", "已移动"), value: props.result?.movedCount ?? 0, tone: "secondary" as const },
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
      nodeId="classq"
      surface={props.surface}
      data-testid="classq-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title="ClassQ"
          domainTag="RECURSIVE ROUTER"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            props.t("identity.subtitle", "关键词递归分类与等待项分流引擎")
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          actions={
            <>
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.result?.items.length}
                icon={Copy}
                label="Copy results"
                onClick={props.onCopyResults}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.logs.length}
                icon={Terminal}
                label="Copy logs"
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
                label="Clear state"
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
              ? "classq-portrait-view"
              : "classq-compact-view"
            : "classq-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div
          data-testid="classq-spatial-workbench"
          className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/classq:grid-cols-[minmax(280px,1fr)_minmax(0,1.45fr)]"
        >
          <div
            data-testid="classq-command-deck"
            className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5"
          >
            <Md3eTonalZone
              tone="primary"
              eyebrow="RECURSIVE ROOTS"
              title={props.t("command.input", "递归扫描根目录")}
              badge={<Md3eStatusPill tone="primary">{props.roots.length} 根</Md3eStatusPill>}
            >
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                <PathTextarea
                  id="classq-roots"
                  aria-label="classq roots"
                  className="h-20 min-h-20 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                  disabled={props.running}
                  placeholder={props.t("fields.roots", "根目录，每行一个")}
                  value={props.data.pathsText ?? ""}
                  onValueChange={(pathsText) => props.onPatch({ pathsText })}
                />
                <div className="flex flex-col gap-1">
                  <ActionIconButton
                    shapeRole="secondary"
                    disabled={props.running}
                    icon={Clipboard}
                    label="Paste roots"
                    onClick={props.onPastePaths}
                  />
                  <ActionIconButton
                    shapeRole="accent"
                    disabled={props.running || !props.data.pathsText}
                    icon={Trash2}
                    label="Clear roots"
                    onClick={() => props.onPatch({ pathsText: "" })}
                  />
                </div>
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="KEYWORD ROUTING"
              title={props.t("command.folders", "关键词与等待目录规则")}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-1 text-[10px] font-bold text-muted-foreground">关键词目录</div>
                  <Input
                    id="classq-keyword"
                    aria-label="classq keyword"
                    disabled={props.running}
                    className="h-8 rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                    placeholder="already"
                    value={props.data.keyword ?? ""}
                    onChange={(event) => props.onPatch({ keyword: event.currentTarget.value })}
                  />
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-bold text-muted-foreground">等待目录</div>
                  <Input
                    id="classq-wait"
                    aria-label="classq wait"
                    disabled={props.running}
                    className="h-8 rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                    placeholder="wait"
                    value={props.data.waitKeyword ?? ""}
                    onChange={(event) => props.onPatch({ waitKeyword: event.currentTarget.value })}
                  />
                </div>
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="tertiary"
              eyebrow="EXECUTION & TRANSFER"
              title="动作与传输方式"
              testId="classq-mode-tabs"
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="ClassQ 模式"
                  options={[
                    { value: "plan" as ClassqAction, label: props.t("action.scanShort", "扫描"), icon: Search },
                    { value: "classify" as ClassqAction, label: props.t("action.classifyShort", "分类"), icon: Play },
                  ]}
                  value={props.action}
                  disabled={props.running}
                  onChange={props.onActionChange}
                />
                <Md3eChoiceChips
                  ariaLabel="ClassQ 传输方式"
                  options={TRANSFER_MODES.map((m) => ({
                    value: m.value as ClassqTransferMode,
                    label: m.value === "move" ? props.t("transfer.move", "移动") : props.t("transfer.copy", "复制"),
                    icon: m.icon,
                  }))}
                  value={props.data.transferMode ?? "move"}
                  disabled={props.running}
                  onChange={(transferMode) => props.onPatch({ transferMode })}
                />
                <Md3eConnectedGroup>
                  <Md3eSwitchRow
                    icon={dryRun ? ShieldAlert : Sparkles}
                    label="预演模式 (Dry-Run)"
                    checked={dryRun}
                    disabled={props.running}
                    onCheckedChange={(nextDryRun) => props.onPatch({ dryRun: nextDryRun })}
                  />
                </Md3eConnectedGroup>
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="ROUTE INSPECTION"
            title="递归命中树与等待分流清单"
            testId="classq-results-workspace"
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "plan", label: props.t("tabs.plan", "计划"), icon: PLAN_ICON, badge: props.result?.items.length ?? 0 },
                  { id: "issues", label: props.t("tabs.issues", "问题"), icon: AlertTriangle, badge: issueLines.length },
                  { id: "logs", label: props.t("tabs.log", "日志"), icon: Terminal, badge: props.logs.length },
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
                      {props.result!.items.slice(0, 180).map((item, idx) => {
                        const KindIcon = item.kind === "folder" ? Folder : File
                        return (
                          <div
                            key={`${item.sourcePath}:${idx}`}
                            className="flex items-center justify-between gap-2 rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2 text-xs transition-all hover:rounded-[22px]"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <KindIcon className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
                              <div className="min-w-0">
                                <div className="truncate font-bold">{item.sourceName}</div>
                                <div className="truncate font-mono text-[10px] text-muted-foreground">
                                  → {item.targetRelative}
                                </div>
                              </div>
                            </div>
                            <Md3eStatusPill
                              tone={
                                item.status === "conflict" || item.status === "error"
                                  ? "danger"
                                  : item.stage === "keyword"
                                    ? "secondary"
                                    : "primary"
                              }
                            >
                              {item.status}
                            </Md3eStatusPill>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex h-44 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                      <ListTree className="size-6 opacity-50" />
                      <span>
                        {props.roots.length
                          ? "运行扫描后，这里将呈现关键词目录命中与等待项分流路径"
                          : "请先在左侧添加至少一个扫描根目录"}
                      </span>
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
                      <div className="py-10 text-center">无冲突或异常项</div>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-1.5 p-2 font-mono text-xs text-muted-foreground">
                    {props.logs.length ? (
                      props.logs.map((line, i) => (
                        <div key={`${line}:${i}`} className="rounded-[12px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-1.5">
                          {line}
                        </div>
                      ))
                    ) : (
                      <div className="py-10 text-center">暂无运行日志</div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={live ? "danger" : "secondary"}>
                {live ? "LIVE 实执" : "DRY-RUN 预演"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `${props.roots.length} 个根目录 · 关键词 "${props.data.keyword || "already"}"`}
              </span>
            </div>
          }
          trailing={
            <div className="flex items-center gap-1.5">
              {props.action !== "plan" ? primaryCta(true, "plan") : null}
              {primaryCta(props.compactSurface)}
            </div>
          }
        />
      </div>
    </Md3eNodeSurface>
  )
}
