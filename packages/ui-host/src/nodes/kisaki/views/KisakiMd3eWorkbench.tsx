import * as React from "react"
import { useState } from "react"
import type { KisakiTool } from "@hibernalglow/xaihi-kisaki/core"
import {
  FileText,
  HardDrive,
  Layers,
  PanelLeft,
  PanelRight,
  PanelTopOpen,
  Play,
  Search,
  Settings2,
  Sparkles,
  TableProperties,
  X,
} from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatBytes } from "@/lib/formatters"
import { tt } from "@/lib/i18nText"
import { cn } from "@/lib/utils"
import {
  Md3eCommandDock,
  Md3eExpressiveHero,
  Md3eShapeBadge,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import { StandaloneApplicationSettings } from "@/nodes/shared/StandaloneApplicationContext"
import { useWorkspaceActions } from "@/store/workspaceStore"
import { KisakiCardManager, KisakiCardTabs } from "../card-layout"
import { KisakiFilterPanel } from "../filter-panel"
import { KisakiFloatingAnalysisPanel } from "../floating-analysis-panel"
import { KisakiSimilarityReferenceDialog } from "../similarity-reference-dialog"
import { KisakiTokenEditor } from "../source-inputs"
import { KisakiCardContent } from "./KisakiCardsView"
import { ResultTable } from "./KisakiPanelsView"
import { KISAKI_TOOL_META, getKisakiToolMeta, type KisakiView } from "./model"

function Md3eKisakiSourcePanel(props: KisakiView) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      <KisakiCardTabs
        activeId={props.data.sourcePanelTab}
        layout={props.cardLayout}
        panel="source"
        onActiveChange={(sourcePanelTab) => props.patch({ sourcePanelTab })}
        renderCard={(id) => <KisakiCardContent id={id} props={props} />}
      />
    </div>
  )
}

function Md3eKisakiAnalysisPanel(props: KisakiView) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <KisakiCardTabs
        activeId={props.data.analysisPanelTab}
        layout={props.cardLayout}
        panel="analysis"
        onActiveChange={(analysisPanelTab) => props.patch({ analysisPanelTab })}
        renderCard={(id) => <KisakiCardContent id={id} props={props} />}
      />
    </div>
  )
}

/**
 * Kisaki MD3E 完整表现力取证甲板（Forensic Command Deck）
 * 彻底摒弃旧版三泳道克隆布局，采用：
 * 1. Expressive Hero + 11 扫描器形态胶囊条（Scanner Pill Ribbon）
 * 2. 四镜头切换器（全览双翼矩阵 / 扫描条件舱 / 取证结果流 / 遥测与批处理舱）
 * 3. 零边框色阶容器（Md3eTonalZone）+ 底部悬浮取证指令坞（Md3eCommandDock）
 */
export function Md3eKisakiFull(props: KisakiView) {
  const [lens, setLens] = useState<"bento" | "source" | "results" | "analysis">("bento")
  const floatingOpen = props.floatingAvailable && props.floatingAnalysisPanel.open
  const meta = getKisakiToolMeta(props.tool, props.t)
  const { setUiFace } = useWorkspaceActions()
  const stats = props.result
  const progress = props.data.progress ?? 0

  const availableTools = KISAKI_TOOL_META.filter(
    (definition) =>
      !("requiredNativeCapability" in definition) ||
      !definition.requiredNativeCapability ||
      props.nativeCapabilities.has(definition.requiredNativeCapability),
  )

  const telemetry = [
    { label: props.t("metrics.files", tt("module:kisaki.metrics.files", "文件")), value: stats?.fileCount ?? 0, tone: "primary" as const },
    { label: props.t("metrics.groups", tt("module:kisaki.metrics.groups", "分组")), value: stats?.groupCount ?? 0, tone: "secondary" as const },
    { label: props.t("metrics.totalSize", tt("module:kisaki.metrics.totalSize", "总大小")), value: formatBytes(stats?.totalBytes ?? 0), tone: "tertiary" as const },
    { label: props.t("metrics.reclaimable", tt("module:kisaki.metrics.reclaimable", "可回收")), value: formatBytes(stats?.reclaimableBytes ?? 0), tone: "primary" as const },
    { label: "已选", value: props.selectedPaths.length, tone: "secondary" as const },
  ]

  return (
    <div
      data-testid="czkawka-full-view"
      data-ui-variant="md3e"
      className="relative flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-[var(--md3e-surface-low,var(--background))] p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={meta.icon}
          title={`Kisaki · ${meta.label}`}
          domainTag="FORENSIC CORE"
          statusLabel={props.running ? "SCANNING" : (props.data.phase ?? "READY").toUpperCase()}
          statusTone={props.data.phase === "error" ? "danger" : props.running ? "primary" : "secondary"}
          subtitle={meta.description ?? "11 引擎文件查重与媒体取证中心"}
          progress={progress}
          running={props.running}
          stats={telemetry}
          toolbarTestId="kisaki-header-banner"
          actions={
            <>
              <ToolSelector props={props} />

              {props.tool === "similar-images" || props.tool === "similar-videos" ? (
                <KisakiSimilarityReferenceDialog t={props.t} />
              ) : null}

              <Button
                aria-label={
                  props.floatingAnalysisPanel.open
                    ? props.t("actions.closeFloatingAnalysis", "关闭浮动分析面板")
                    : props.t("actions.openFloatingAnalysis", "打开浮动分析面板")
                }
                disabled={!props.floatingAvailable}
                size="icon-xs"
                shapeRole="toolbar"
                className="rounded-full"
                variant={props.floatingAnalysisPanel.open ? "secondary" : "ghost"}
                onClick={() =>
                  props.setFloatingAnalysisPanel({
                    ...props.floatingAnalysisPanel,
                    open: !props.floatingAnalysisPanel.open,
                  })
                }
              >
                <PanelTopOpen />
              </Button>

              <KisakiCardManager layout={props.cardLayout} onChange={props.setCardLayout} />
              <KisakiNodeSettings props={props} />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      {/* Scanner Pill Ribbon + Stage Lens Switcher + Search Filter Strip */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[22px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-1.5">
        <Md3eStageLensBar
          ariaLabel="Kisaki 取证工作台镜头"
          items={[
            { id: "bento", label: "取证全景台", icon: Sparkles },
            { id: "source", label: props.t("sections.conditions", "扫描条件"), icon: PanelLeft },
            { id: "results", label: props.t("tabs.results", "扫描结果"), icon: TableProperties, badge: stats?.fileCount ?? 0 },
            { id: "analysis", label: props.t("sections.analysisOperations", "分析与操作"), icon: PanelRight },
          ]}
          value={lens}
          onChange={setLens}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={props.t("filters.global", "Kisaki 全局筛选")}
              className="h-7 w-40 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] pl-8 pr-6 text-xs"
              placeholder={props.t("filters.searchCurrent", "搜索当前结果")}
              value={props.filterText}
              onChange={(event) => props.setFilterText(event.currentTarget.value)}
            />
            {props.filterText ? (
              <button
                type="button"
                aria-label={props.t("filters.clearSearch", "清除结果搜索")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => props.setFilterText("")}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          <KisakiFilterPanel
            tool={props.tool}
            state={props.filterState}
            stats={props.filterResult.stats}
            pathPatternError={props.filterResult.pathPatternError}
            textPatternError={props.filterResult.textPatternError}
            presets={props.filterPresets}
            onChange={props.setFilterState}
            onPresetsChange={props.setFilterPresets}
          />
        </div>
      </div>

      {/* Expressive 11-Scanner Pill Strip */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/80 px-2 py-1">
        {availableTools.map((def) => {
          const toolMeta = getKisakiToolMeta(def.id, props.t)
          const active = props.tool === toolMeta.id
          const ToolIcon = toolMeta.icon
          return (
            <button
              key={toolMeta.id}
              type="button"
              onClick={() => props.patch({ tool: toolMeta.id as KisakiTool })}
              style={{
                transition: "border-radius 240ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 160ms ease",
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[11px] leading-none",
                active
                  ? "rounded-full bg-[var(--md3e-secondary-container,var(--secondary))] font-black text-[var(--md3e-on-secondary-container,var(--secondary-foreground))]"
                  : "rounded-[10px] font-medium text-muted-foreground hover:rounded-[16px] hover:bg-[var(--md3e-surface-high,var(--card))] hover:text-foreground",
              )}
            >
              <ToolIcon className="size-3 shrink-0" />
              <span>{toolMeta.label}</span>
            </button>
          )
        })}
      </div>

      {/* Asymmetric MD3E Bento / Lens Workspace */}
      <div
        data-testid="czkawka-lane-board"
        className={cn(
          "grid min-h-0 flex-1 gap-2.5 overflow-hidden",
          lens === "bento"
            ? "grid-cols-1 @3xl/kisaki:grid-cols-[minmax(270px,0.88fr)_minmax(0,1.52fr)_minmax(260px,0.85fr)]"
            : "grid-cols-1",
        )}
      >
        {(lens === "bento" || lens === "source") ? (
          <Md3eTonalZone
            tone="primary"
            eyebrow="SCAN CONDITIONS"
            title={props.t("sections.conditions", "扫描条件与路径")}
            testId="czkawka-lane-source"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <Md3eKisakiSourcePanel {...props} />
          </Md3eTonalZone>
        ) : null}

        {(lens === "bento" || lens === "results") ? (
          <Md3eTonalZone
            tone="default"
            eyebrow="FORENSIC MATRIX"
            title={props.t("tabs.results", "取证结果矩阵")}
            testId="czkawka-lane-results"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65">
              <ResultTable {...props} />
            </div>
          </Md3eTonalZone>
        ) : null}

        {(lens === "bento" || lens === "analysis") && !floatingOpen ? (
          <Md3eTonalZone
            tone="secondary"
            eyebrow="ANALYSIS & BATCH OPS"
            title={props.t("sections.analysisOperations", "分析与批处理操作")}
            testId="czkawka-lane-analysis"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <Md3eKisakiAnalysisPanel {...props} />
          </Md3eTonalZone>
        ) : null}
      </div>

      <Md3eCommandDock
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Md3eStatusPill tone="primary">{meta.label}</Md3eStatusPill>
            <span className="truncate text-xs text-muted-foreground">
              {props.data.progressText ||
                `${stats?.fileCount ?? 0} 个匹配文件 · 已选 ${props.selectedPaths.length} 项`}
            </span>
          </div>
        }
        trailing={
          <Button
            size="sm"
            shapeRole="command"
            variant={props.running ? "destructive" : "default"}
            onClick={props.running ? props.cancelScan : props.executeScan}
            className="gap-1.5 rounded-full font-black"
          >
            {props.running ? <X className="size-3.5" /> : <Play className="size-3.5" />}
            {props.running ? props.t("actions.stopScan", "停止") : props.t("actions.startScan", "扫描")}
          </Button>
        }
      />

      {floatingOpen ? (
        <KisakiFloatingAnalysisPanel
          state={props.floatingAnalysisPanel}
          viewport={props.floatingViewport}
          layout={props.cardLayout}
          onStateChange={props.setFloatingAnalysisPanel}
          onLayoutChange={props.setCardLayout}
          renderCard={(id) => <KisakiCardContent id={id} props={props} />}
        />
      ) : null}
    </div>
  )
}

export function Md3eKisakiCompact(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)
  const { setUiFace } = useWorkspaceActions()

  return (
    <div
      data-testid="czkawka-compact-view"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-[var(--md3e-surface-low,var(--background))] p-2"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={meta.icon}
          title="Kisaki"
          domainTag={meta.label}
          statusLabel={props.running ? "SCANNING" : "READY"}
          statusTone={props.running ? "primary" : "secondary"}
          progress={props.data.progress ?? 0}
          running={props.running}
          actions={
            <>
              <ToolSelector compact props={props} />
              <Button
                type="button"
                data-testid="kisaki-ui-face-switch"
                size="xs"
                variant="secondary"
                className="rounded-full font-bold"
                onClick={() => setUiFace("legacy")}
              >
                原版
              </Button>
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <Md3eStageLensBar
        items={[
          { id: "source", label: props.t("tabs.conditions", "条件") },
          { id: "results", label: props.t("tabs.results", "结果"), badge: props.result?.fileCount ?? 0 },
          { id: "analysis", label: props.t("tabs.operations", "操作") },
        ]}
        value={props.panel}
        onChange={(next) => props.setPanel(next as "source" | "results" | "analysis")}
      />

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {props.panel === "source" ? (
          <Md3eKisakiSourcePanel {...props} />
        ) : props.panel === "results" ? (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[var(--md3e-surface-high,var(--card))]">
            <ResultTable {...props} />
          </div>
        ) : (
          <Md3eKisakiAnalysisPanel {...props} />
        )}
      </div>

      <Md3eCommandDock
        leading={
          <span className="truncate text-xs text-muted-foreground">
            {props.t("summary.selected", "{{count}} 已选", { count: props.selectedPaths.length })}
          </span>
        }
        trailing={
          <Button
            size="xs"
            shapeRole="command"
            variant={props.running ? "destructive" : "default"}
            onClick={props.running ? props.cancelScan : props.executeScan}
            className="gap-1 rounded-full font-black"
          >
            {props.running ? <X className="size-3.5" /> : <Play className="size-3.5" />}
            {props.running ? props.t("actions.stopScan", "停止") : props.t("actions.startScan", "扫描")}
          </Button>
        }
      />
    </div>
  )
}

export function Md3eKisakiCollapsed(props: KisakiView) {
  const meta = getKisakiToolMeta(props.tool, props.t)

  return (
    <div
      data-testid="czkawka-collapsed-view"
      data-ui-variant="md3e"
      className="flex h-full w-full items-center gap-2.5 rounded-[24px_18px_24px_18px] bg-[var(--md3e-surface-high,var(--card))] px-3"
    >
      <Md3eShapeBadge icon={meta.icon} tone="primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-black text-foreground leading-none">Kisaki · {meta.label}</span>
          <Md3eStatusPill tone={props.data.phase === "error" ? "danger" : props.running ? "primary" : "neutral"}>
            {props.data.phase ?? "idle"}
          </Md3eStatusPill>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {props.data.progressText || props.t("summary.resultCount", "{{count}} 个结果", { count: props.result?.fileCount ?? 0 })}
        </div>
      </div>
      <Button
        aria-label={props.running ? props.t("actions.stopScan", "停止扫描") : props.t("actions.startScan", "开始扫描")}
        size="icon-xs"
        shapeRole="command"
        className="rounded-full"
        variant={props.running ? "destructive" : "default"}
        onClick={props.running ? props.cancelScan : props.executeScan}
      >
        {props.running ? <X /> : <Play />}
      </Button>
    </div>
  )
}

function ToolSelector({ compact = false, props }: { compact?: boolean; props: KisakiView }) {
  return (
    <Select value={props.tool} onValueChange={(tool) => props.patch({ tool: tool as KisakiTool })}>
      <SelectTrigger
        aria-label={props.t("tools.select", "选择扫描工具")}
        className={cn(
          "h-7 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] text-xs font-bold",
          compact ? "w-36" : "w-44",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {KISAKI_TOOL_META.filter(
          (definition) =>
            !("requiredNativeCapability" in definition) ||
            !definition.requiredNativeCapability ||
            props.nativeCapabilities.has(definition.requiredNativeCapability),
        ).map((definition) => {
          const tool = getKisakiToolMeta(definition.id, props.t)
          return (
            <SelectItem key={tool.id} value={tool.id}>
              <span className="flex items-center gap-2">
                <tool.icon className="size-3.5" />
                {tool.label}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

function KisakiNodeSettings({ props }: { props: KisakiView }) {
  return (
    <StandaloneApplicationSettings
      title={props.t("settings.title", "Kisaki 节点设置")}
      description={props.t("settings.description", "适用于所有扫描器的目录过滤、缓存和性能设置。")}
      trigger={
        <Button aria-label={props.t("settings.open", "节点设置")} size="icon-xs" shapeRole="toolbar" variant="ghost">
          <Settings2 />
        </Button>
      }
    >
      <section className="grid gap-3">
        <h4 className="text-sm font-semibold">{props.t("settings.general", "通用设置")}</h4>
        <KisakiTokenEditor
          kind="rules"
          label={props.t("sources.excludedItems", "排除的项目")}
          value={props.data.excludedItemsText}
          placeholder={props.t("sources.excludedItemsPlaceholder", "*/cache*, */node_modules*")}
          onChange={(excludedItemsText) => props.patch({ excludedItemsText })}
        />
      </section>
    </StandaloneApplicationSettings>
  )
}
