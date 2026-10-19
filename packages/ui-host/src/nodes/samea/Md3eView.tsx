import { useState } from "react"
import type { SameaAction, SameaData } from "@xiranite/node-samea/core"
import { Archive, Bot, Clipboard, FolderInput, RotateCcw, ScanSearch, ShieldAlert, SlidersHorizontal, Sparkles, Terminal, UserRound, X } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
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
  Md3eStepperSlider,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import type { SameaCardState, SameaFilterTab } from "./types"

const FILTERS: Array<{
  id: SameaFilterTab
  label: string
  key: keyof Pick<SameaCardState, "artistBlacklist" | "pathBlacklist" | "regexBlacklist">
}> = [
  { id: "artist", label: "画师黑名单", key: "artistBlacklist" },
  { id: "path", label: "路径黑名单", key: "pathBlacklist" },
  { id: "regex", label: "正则排除", key: "regexBlacklist" },
]

export interface SameaMd3eViewProps {
  surface: NodeSurface
  action: SameaAction
  compact: boolean
  configDirty: boolean
  data: SameaCardState
  defaults?: Partial<SameaCardState>
  filterTab: SameaFilterTab
  paths: string[]
  result: SameaData | null
  running: boolean
  draftFilter: string
  onAction: (action: SameaAction) => void
  onAddFilter: () => void
  onDraftFilter: (value: string) => void
  onFilterTab: (tab: SameaFilterTab) => void
  onPatch: (patch: Partial<SameaCardState>) => void
  onPaste: () => Promise<void>
  onRemoveFilter: (value: string) => void
  onRestoreDefaults: () => void
  onSaveDefaults: () => Promise<void>
}

export function SameaMd3eView(props: SameaMd3eViewProps) {
  const { t } = useNodeI18n("samea")
  const [inspectTab, setInspectTab] = useState<"entities" | "filters" | "logs">("entities")
  const classify = props.action === "classify"
  const dryRun = props.data.dryRun ?? true
  const label = classify
    ? t("actions.executeScan", "执行扫描")
    : t("actions.planScan", "规划扫描")

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      compact={compact}
      running={props.running}
      dangerous={classify && dryRun === false}
      label={label}
      onExecute={() => props.onAction(classify ? "classify" : "plan")}
    />
  )

  if (props.surface.mode === "collapsed") {
    const count = props.result?.readyCount ?? props.paths.length
    return (
      <Md3eCollapsedCapsule
        nodeId="samea"
        surface={props.surface}
        testId="samea-surface"
        collapsedTestId="samea-collapsed-view"
        icon={ScanSearch}
        title={t("name", "SameA")}
        badgeText={props.data.phase ?? "idle"}
        statusText={props.data.progressText || `${count} 个归档候选`}
        progress={props.data.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const items = props.result?.items ?? []
  const filterMeta = FILTERS.find((f) => f.id === props.filterTab) ?? FILTERS[0]!
  const filterValues = props.data[filterMeta.key] ?? []
  const phase = props.running ? "running" : props.data.phase ?? "idle"

  const stats = [
    { label: "扫描源", value: props.paths.length, tone: "primary" as const },
    { label: "已扫描", value: props.result?.scannedCount ?? 0, tone: "secondary" as const },
    { label: "就绪项", value: props.result?.readyCount ?? 0, tone: "tertiary" as const },
    { label: "最小频次", value: props.data.minOccurrences ?? 1, tone: "neutral" as const },
  ]

  return (
    <Md3eNodeSurface
      nodeId="samea"
      surface={props.surface}
      data-testid="samea-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={ScanSearch}
          title={t("header.title", "SameA · 画师归档提取器")}
          domainTag="ARTIST CLUSTER"
          statusLabel={phase.toUpperCase()}
          statusTone={phase === "error" ? "danger" : phase === "running" ? "primary" : "secondary"}
          subtitle={
            props.data.progressText ||
            `${props.paths.length} 个归档根目录 · 最小频次 ≥ ${props.data.minOccurrences ?? 1}`
          }
          progress={props.data.progress}
          running={props.running}
          stats={stats}
          actions={
            <>
              <NodeConfigButton
                nodeKey="samea"
                configDirty={props.configDirty}
                defaults={props.defaults}
                disabled={props.running}
                onResetOverride={props.onRestoreDefaults}
                onRestoreDefault={props.onRestoreDefaults}
                onSaveDefault={props.onSaveDefaults}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label={t("actions.reset", "重置")}
                onClick={() =>
                  props.onPatch({ phase: "idle", progress: 0, progressText: "", logs: [], result: null })
                }
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div
        data-testid={props.compact ? "samea-compact-view" : "samea-full-view"}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/samea:grid-cols-[minmax(270px,1fr)_minmax(0,1.45fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="INGESTION ROOTS"
              title={t("sections.sourceControl", "来源控制")}
              actions={
                <ActionIconButton
                  shapeRole="secondary"
                  icon={Clipboard}
                  label={t("source.pastePaths", "粘贴路径")}
                  onClick={() => void props.onPaste()}
                />
              }
            >
              <PathTextarea
                aria-label="samea paths"
                className="min-h-20 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                placeholder={t("source.placeholder", "D:/Archives/Unsorted\nE:/Staging/New")}
                value={props.data.pathsText ?? ""}
                onValueChange={(pathsText) => props.onPatch({ pathsText })}
              />
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="CLUSTERING THRESHOLD"
              title={t("sections.operationGate", "聚类与分流策略")}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="SameA 执行阶段"
                  options={[
                    { value: "plan" as SameaAction, label: "规划扫描 (Plan)", icon: ScanSearch },
                    { value: "classify" as SameaAction, label: "执行分流 (Classify)", icon: Sparkles },
                  ]}
                  value={props.action}
                  disabled={props.running}
                  onChange={(nextAct) => props.onPatch({ action: nextAct })}
                />
                <Md3eConnectedGroup>
                  <Md3eStepperSlider
                    icon={SlidersHorizontal}
                    label={t("operation.minOccurrences", "最小出现次数")}
                    value={props.data.minOccurrences ?? 1}
                    min={1}
                    max={10}
                    step={1}
                    disabled={props.running}
                    onChange={(minOccurrences) => props.onPatch({ minOccurrences })}
                  />
                  <Md3eSwitchRow
                    icon={FolderInput}
                    label={t("operation.centralizeLabel", "集中输出")}
                    description={t("operation.centralizeDesc", "汇总移动到 [00画师分类]")}
                    checked={props.data.centralize ?? false}
                    disabled={props.running}
                    onCheckedChange={(centralize) => props.onPatch({ centralize })}
                  />
                  <Md3eSwitchRow
                    icon={ShieldAlert}
                    label={t("source.ignorePathBlacklist", "忽略路径黑名单")}
                    checked={props.data.ignorePathBlacklist ?? false}
                    disabled={props.running}
                    onCheckedChange={(ignorePathBlacklist) => props.onPatch({ ignorePathBlacklist })}
                  />
                  <Md3eSwitchRow
                    icon={dryRun ? ShieldAlert : Sparkles}
                    label={t("operation.dryRunLabel", "预演模式")}
                    description={t("operation.dryRunDesc", "模拟画师分流而不移动文件")}
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
            eyebrow="ARTIST MATRIX & PROTOCOLS"
            title={t("sections.analysisChamber", "画师聚类舱与过滤协议")}
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "entities", label: "画师矩阵", icon: Bot, badge: items.length },
                  { id: "filters", label: t("sections.filterProtocols", "过滤协议"), icon: ShieldAlert, badge: filterValues.length },
                  { id: "logs", label: "系统日志", icon: Terminal, badge: (props.data.logs ?? []).length },
                ]}
                value={inspectTab}
                onChange={setInspectTab}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2.5">
              {inspectTab === "entities" ? (
                <ScrollArea className="h-full">
                  {items.length ? (
                    <div className="flex flex-col gap-1.5">
                      {items.slice(0, 160).map((item, index) => {
                        const ignored = item.status === "ignored" || item.status === "skipped"
                        const Icon = item.artistName.includes("(") ? Archive : UserRound
                        return (
                          <div
                            key={`${item.sourcePath}:${index}`}
                            className="flex items-center justify-between gap-2 rounded-[16px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2 text-xs transition-all hover:rounded-[22px]"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className="size-4 shrink-0 text-[var(--md3e-primary,var(--primary))]" />
                              <span className={ignored ? "truncate font-mono text-muted-foreground line-through" : "truncate font-mono font-bold"}>
                                {item.artistName || item.sourceName}
                              </span>
                            </div>
                            <Md3eStatusPill
                              tone={
                                item.status === "error" || item.status === "conflict"
                                  ? "danger"
                                  : item.status === "ready" || item.status === "moved"
                                    ? "primary"
                                    : "neutral"
                              }
                            >
                              {item.status}
                            </Md3eStatusPill>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex h-44 items-center justify-center text-center text-xs text-muted-foreground">
                      {t("analysis.empty", "运行预演扫描以填充画师矩阵。")}
                    </div>
                  )}
                </ScrollArea>
              ) : inspectTab === "filters" ? (
                <div className="flex h-full flex-col gap-2.5">
                  <Md3eChoiceChips
                    ariaLabel="排除名单类别"
                    options={FILTERS.map((f) => ({ value: f.id, label: f.label }))}
                    value={props.filterTab}
                    onChange={props.onFilterTab}
                  />
                  <div className="flex gap-1.5">
                    <Input
                      aria-label="samea exclusion"
                      value={props.draftFilter}
                      placeholder={t("filters.addExclusion", "添加排除项…")}
                      className="h-8 rounded-full border-0 bg-[var(--md3e-surface-high,var(--card))] font-mono text-xs"
                      onChange={(event) => props.onDraftFilter(event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          props.onAddFilter()
                        }
                      }}
                    />
                    <Button
                      aria-label="add exclusion"
                      size="sm"
                      className="rounded-full"
                      onClick={props.onAddFilter}
                    >
                      +
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 overflow-auto">
                    {filterValues.map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md3e-secondary-container,var(--secondary))] px-3 py-1 font-mono text-xs font-bold text-[var(--md3e-on-secondary-container,var(--secondary-foreground))]"
                      >
                        <span>{val}</span>
                        <button
                          type="button"
                          aria-label={`remove ${val}`}
                          onClick={() => props.onRemoveFilter(val)}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <pre className="p-2 font-mono text-xs leading-5 text-muted-foreground">
                    {(props.data.logs ?? []).length
                      ? (props.data.logs ?? []).join("\n")
                      : t("logs.idle", "[空闲] SameA 已就绪。默认启用预演模式。")}
                  </pre>
                </ScrollArea>
              )}
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={dryRun ? "secondary" : "danger"}>
                {dryRun ? "DRY-RUN 预演" : "LIVE 真实归档"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || t("analysis.ready", "准备好扫描归档命名模式。")}
              </span>
            </div>
          }
          trailing={primaryCta(props.compact)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
