import { useState } from "react"
import type { ClassfAction, ClassfData, ClassfPlacementMode, ClassfTransferMode, ClassfWorkItemMode } from "@xiranite/node-classf/core"
import { AlertTriangle, Archive, BarChart3, Clipboard, Copy, Folder, FolderTree, Layers3, Play, RotateCcw, ShieldAlert, Sparkles, Terminal, Trash2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Input } from "@/components/ui/input"
import { PathTextarea } from "@/components/ui/path-input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
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
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS, NODE_ICON, PLACEMENT_MODES, PLAN_ICON, TRANSFER_MODES } from "./constants"
import { BlacklistKeywordsEditor } from "./BlacklistKeywordsEditor"
import { ClassfPlanRows, ClassfPlanTree } from "./ClassfPlanTree"
import { ClassfQueueControls } from "./ClassfQueueControls"
import { analyzeClassfPlan } from "./planAnalysis"
import type { ClassfCardState, ClassfStatusMeta } from "./types"

export interface ClassfMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  action: ClassfAction
  actionMeta: (typeof ACTIONS)[number]
  configFilePath?: string
  configDirty: boolean
  data: ClassfCardState
  defaults?: Partial<ClassfCardState>
  logs: string[]
  paths: string[]
  progress: number
  planCurrent: boolean
  result: ClassfData | null
  running: boolean
  status: ClassfStatusMeta
  tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  onActionChange: (value: ClassfAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: ClassfAction) => void
  onImportDeletionHistory: () => Promise<{ path: string; csv: string } | undefined>
  onPastePaths: () => void
  onPatch: (patch: Partial<ClassfCardState>) => void
  onRevealPath?: (path: string) => Promise<void>
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onOpenConfigFile?: () => Promise<void> | void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function ClassfMd3eView(props: ClassfMd3eViewProps) {
  const [inspectLens, setInspectLens] = useState<"tree" | "matrix" | "analysis" | "logs">("tree")
  const live = props.action === "classify" && !(props.data.dryRun ?? true)
  const label =
    props.action === "plan"
      ? props.tNode("actions.generatePlan", "生成计划")
      : props.data.dryRun ?? true
        ? props.tNode("actions.dryClassify", "预演分类")
        : props.tNode("actions.liveClassify", "执行分类")

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={live}
      running={props.running}
      disabled={!props.paths.length}
      compact={compact}
      label={label}
      idleIcon={live ? <ShieldAlert /> : <Play />}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="classf"
        surface={props.surface}
        testId="classf-md3e-surface"
        collapsedTestId="classf-collapsed-view"
        icon={NODE_ICON}
        title="ClassF"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.paths.length} 项源 · ${props.result?.readyCount ?? 0} 可执行`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const analysis = analyzeClassfPlan(props.result)
  const stats = [
    { label: "来源", value: props.paths.length, tone: "primary" as const },
    { label: "可执行", value: props.result?.readyCount ?? 0, tone: "secondary" as const },
    { label: "already", value: analysis.alreadyCount, tone: "tertiary" as const },
    { label: "del", value: analysis.delCount, tone: "danger" as const },
    { label: "wait", value: analysis.waitCount, tone: "neutral" as const },
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
      nodeId="classf"
      surface={props.surface}
      data-testid="classf-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={NODE_ICON}
          title="ClassF"
          domainTag="TRIAGE MATRIX"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.paths.length} 个归档源 · ${props.planCurrent ? "计划已同步" : "待刷新计划"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="classf-header-toolbar"
          actions={
            <>
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.result?.items.length}
                icon={Copy}
                label={props.tNode("actions.copyResults", "复制结果")}
                onClick={props.onCopyResults}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.logs.length}
                icon={Terminal}
                label={props.tNode("actions.copyLogs", "复制日志")}
                onClick={props.onCopyLogs}
              />
              <NodeConfigPopover
                configPath={props.configFilePath}
                defaults={props.defaults}
                dirty={props.configDirty}
                disabled={props.running}
                t={props.tNode}
                onOpenFile={props.onOpenConfigFile}
                onReload={props.onReloadDefaults}
                onRestore={props.onRestoreDefault}
                onSave={props.onSaveDefault}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label={props.tNode("actions.clear", "清空状态")}
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
              ? "classf-portrait-view"
              : "classf-compact-view"
            : "classf-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/classf:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.45fr)]">
          <div
            data-testid="classf-scan-sources"
            className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5"
          >
            <Md3eTonalZone
              tone="primary"
              eyebrow="INGESTION & WORK ITEMS"
              title={props.tNode("sections.scanSources", "扫描来源与工作项")}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="工作项类型"
                  options={[
                    { value: "files" as ClassfWorkItemMode, label: props.tNode("workItemModes.files", "压缩包文件"), icon: Archive },
                    { value: "folders" as ClassfWorkItemMode, label: props.tNode("workItemModes.folders", "已解压文件夹"), icon: Folder },
                    { value: "mixed" as ClassfWorkItemMode, label: props.tNode("workItemModes.mixed", "混合"), icon: Layers3 },
                  ]}
                  value={props.data.workItemMode ?? "files"}
                  disabled={props.running}
                  onChange={(workItemMode) => props.onPatch({ workItemMode })}
                />
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                  <PathTextarea
                    id="classf-paths"
                    aria-label="classf paths"
                    className="h-14 min-h-14 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                    disabled={props.running}
                    placeholder={props.tNode("placeholders.sameaRoots", "例如 D:/set/reviewed.zip")}
                    value={props.data.pathsText ?? ""}
                    onValueChange={(pathsText) => props.onPatch({ pathsText })}
                  />
                  <div className="flex flex-col gap-1">
                    <ActionIconButton
                      shapeRole="secondary"
                      disabled={props.running}
                      icon={Clipboard}
                      label={props.tNode("actions.paste", "粘贴路径")}
                      onClick={props.onPastePaths}
                    />
                    <ActionIconButton
                      shapeRole="accent"
                      disabled={props.running || !props.data.pathsText}
                      icon={Trash2}
                      label={props.tNode("actions.clearPaths", "清空路径")}
                      onClick={() => props.onPatch({ pathsText: "" })}
                    />
                  </div>
                </div>
                <Textarea
                  aria-label="classf crashu sources"
                  className="h-9 min-h-9 resize-none rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                  disabled={props.running}
                  placeholder={props.tNode("placeholders.crashuSources", "CrashU 来源目录，每行一个；留空使用默认库")}
                  rows={1}
                  value={props.data.crashuSourcesText ?? ""}
                  onChange={(event) => props.onPatch({ crashuSourcesText: event.currentTarget.value })}
                />
                <BlacklistKeywordsEditor
                  data={props.data}
                  disabled={props.running}
                  t={props.tNode}
                  onImportDeletionHistory={props.onImportDeletionHistory}
                  onPatch={props.onPatch}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="QUEUE & PLACEMENT"
              title="分流队列与放置规则"
            >
              <div className="flex flex-col gap-2">
                <ClassfQueueControls
                  data={props.data}
                  disabled={props.running}
                  t={props.tNode}
                  onPatch={props.onPatch}
                />
                <Md3eChoiceChips
                  ariaLabel="放置位置模式"
                  options={PLACEMENT_MODES.map((m) => ({
                    value: m.value as ClassfPlacementMode,
                    label: props.tNode(`placementModes.${m.value}`, m.label),
                    icon: m.icon,
                  }))}
                  value={props.data.placementMode ?? "local"}
                  disabled={props.running}
                  onChange={(placementMode) => props.onPatch({ placementMode })}
                />
                {(props.data.placementMode ?? "local") === "root" ? (
                  <Input
                    id="classf-target"
                    aria-label="classf target"
                    disabled={props.running}
                    className="rounded-[14px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] text-xs"
                    placeholder={props.tNode("placeholders.targetRequired", "根目录分流必须填写目标根目录")}
                    value={props.data.targetDir ?? ""}
                    onChange={(event) => props.onPatch({ targetDir: event.currentTarget.value })}
                  />
                ) : null}
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="tertiary"
              eyebrow="EXECUTION GATE"
              title={props.tNode("sections.executionGate", "执行门")}
              testId="classf-execution-gate"
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="执行阶段"
                  options={ACTIONS.map((a) => ({
                    value: a.value,
                    label: props.tNode(`actions.${a.value}`, a.shortLabel),
                    icon: a.icon,
                  }))}
                  value={props.action}
                  disabled={props.running}
                  onChange={props.onActionChange}
                />
                <Md3eChoiceChips
                  ariaLabel="传输模式"
                  options={TRANSFER_MODES.map((tm) => ({
                    value: tm.value as ClassfTransferMode,
                    label: props.tNode(`transferModes.${tm.value}`, tm.label),
                    icon: tm.icon,
                  }))}
                  value={props.data.transferMode ?? "move"}
                  disabled={props.running}
                  onChange={(transferMode) => props.onPatch({ transferMode })}
                />
                <Md3eConnectedGroup>
                  <Md3eSwitchRow
                    icon={props.data.dryRun ?? true ? ShieldAlert : Sparkles}
                    label={props.tNode("fields.dryRun", "预演模式")}
                    checked={props.data.dryRun ?? true}
                    disabled={props.running}
                    onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
                  />
                </Md3eConnectedGroup>
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="CLASSIFICATION MATRIX"
            title={props.tNode("tabs.matrix", "分类矩阵与诊断工作台")}
            testId="classf-classification-matrix"
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "tree", label: props.tNode("tabs.tree", "文件树"), icon: FolderTree, badge: props.result?.items.length ?? props.paths.length },
                  { id: "matrix", label: props.tNode("tabs.matrix", "分类矩阵"), icon: PLAN_ICON },
                  { id: "analysis", label: props.tNode("tabs.analysis", "分析"), icon: BarChart3 },
                  { id: "logs", label: props.tNode("tabs.logs", "日志"), icon: Terminal, badge: props.logs.length },
                ]}
                value={inspectLens}
                onChange={setInspectLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div
              data-testid="classf-analysis"
              className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2"
            >
              {inspectLens === "tree" ? (
                <ClassfPlanTree
                  onRevealPath={props.onRevealPath}
                  planCurrent={props.planCurrent}
                  result={props.result}
                  runningItem={props.data.runningItem}
                  t={props.tNode}
                />
              ) : inspectLens === "matrix" ? (
                <ClassfPlanRows
                  items={props.result?.items ?? []}
                  paths={props.paths}
                  runningItem={props.data.runningItem}
                  t={props.tNode}
                />
              ) : inspectLens === "analysis" ? (
                <ScrollArea className="h-full">
                  <div className="grid grid-cols-2 gap-2 p-2">
                    <div className="rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] p-3">
                      <div className="text-[10px] text-muted-foreground">already 占比</div>
                      <div className="mt-1 font-mono text-base font-black">{analysis.alreadyCount} · {analysis.alreadyRatio}%</div>
                    </div>
                    <div className="rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] p-3">
                      <div className="text-[10px] text-muted-foreground">del 占比</div>
                      <div className="mt-1 font-mono text-base font-black">{analysis.delCount} · {analysis.delRatio}%</div>
                    </div>
                    <div className="rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] p-3">
                      <div className="text-[10px] text-muted-foreground">wait 占比</div>
                      <div className="mt-1 font-mono text-base font-black">{analysis.waitCount} · {analysis.waitRatio}%</div>
                    </div>
                    <div className="rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] p-3">
                      <div className="text-[10px] text-muted-foreground">最大目录层级</div>
                      <div className="mt-1 font-mono text-base font-black">{analysis.maxDepth}</div>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                <ScrollArea className="h-full">
                  <div className="flex flex-col gap-1.5 p-2 font-mono text-xs text-muted-foreground">
                    {props.logs.length ? (
                      props.logs.map((line, idx) => (
                        <div key={`${line}:${idx}`} className="rounded-[12px] bg-[var(--md3e-surface-high,var(--card))] px-2.5 py-1.5">
                          {line}
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center">运行日志会显示在这里。</div>
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
                {live ? "实际执行模式" : "预演安全模式"}
              </Md3eStatusPill>
              {!props.planCurrent && props.result?.items.length ? (
                <Md3eStatusPill tone="danger">
                  <AlertTriangle className="mr-1 inline size-3" />
                  计划已失效
                </Md3eStatusPill>
              ) : null}
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `可执行 ${props.result?.readyCount ?? 0} 项`}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
