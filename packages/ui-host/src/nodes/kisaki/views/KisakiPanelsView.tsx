import { FolderSearch2, PanelLeftClose, PanelRightClose, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KisakiCardTabs } from "../card-layout"
import { KisakiResultTable } from "../result-table"
import { KisakiSimilarFoldersView } from "../similar-folders-view"
import type { KisakiCardState, KisakiSimilarImagesViewMode } from "../types"
import { getKisakiGuiToolOptions, type KisakiOptionDefinition } from "@hibernalglow/xaihi-kisaki/tool-options"
import { updateKisakiWorkspaceLayout } from "@hibernalglow/xaihi-kisaki/workspace-layout"
import { formatBytes, type KisakiView } from "./model"
import { KisakiCardContent, Field, Metric, SectionHeader, SwitchLine } from "./KisakiCardsView"

function SourcePanel(props: KisakiView) {
  return (
    <section className="flex min-h-0 flex-col rounded-md border bg-card">
      <SectionHeader
        icon={FolderSearch2}
        title={props.t("sections.conditions", "扫描条件")}
        action={
          props.canResizeWorkspace ? (
            <Button
              aria-label={props.t("workspace.minimizeConditions", "最小化扫描条件")}
              size="icon-xs"
              variant="ghost"
              onClick={() =>
                props.setWorkspaceLayout(
                  updateKisakiWorkspaceLayout(props.workspaceLayout, {
                    sourcePanelMinimized: true
                  })
                )
              }
            >
              <PanelLeftClose />
            </Button>
          ) : null
        }
      />
      <KisakiCardTabs activeId={props.data.sourcePanelTab} layout={props.cardLayout} panel="source" onActiveChange={(sourcePanelTab) => props.patch({ sourcePanelTab })} renderCard={(id) => <KisakiCardContent id={id} props={props} />} />
    </section>
  )
}

function AlgorithmFields(props: KisakiView) {
  return (
    <div className="grid gap-2">
      {props.tool === "similar-images" ? <SimiuSetsFields {...props} /> : null}
      {getKisakiGuiToolOptions(props.tool, props.nativeCapabilities).map((definition) => (
        <SchemaOptionField key={definition.id} definition={definition} {...props} />
      ))}
    </div>
  )
}

function SimiuSetsFields(props: KisakiView) {
  const enabled = props.data.similarImagesMode === "simiu-sets"
  return (
    <div className="grid gap-2 rounded-md border border-dashed p-2">
      <Field label="相似图片模式">
        <Select value={enabled ? "simiu-sets" : "scanner"} onValueChange={(similarImagesMode) => props.patch({ similarImagesMode: similarImagesMode as KisakiCardState["similarImagesMode"] })}>
          <SelectTrigger aria-label="similar image mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="scanner">Kisaki 相似扫描</SelectItem>
            <SelectItem value="simiu-sets">Simiu 同目录集合</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {enabled ? <>
        <Field label="集合目录前缀">
          <Input aria-label="simiu set directory prefix" value={props.data.simiuSetsNamePrefix ?? "simiu_set"} onChange={(event) => props.patch({ simiuSetsNamePrefix: event.currentTarget.value })} />
        </Field>
        <Field label="最小集合大小">
          <Input aria-label="simiu set minimum group size" type="number" min="2" value={props.data.simiuSetsMinimumGroupSize ?? "2"} onChange={(event) => props.patch({ simiuSetsMinimumGroupSize: event.currentTarget.value })} />
        </Field>
        <Field label="递归处理顺序">
          <Select value={props.data.simiuSetsScanOrder ?? "smallest-first"} onValueChange={(simiuSetsScanOrder) => props.patch({ simiuSetsScanOrder: simiuSetsScanOrder as KisakiCardState["simiuSetsScanOrder"] })}>
            <SelectTrigger aria-label="simiu set scan order"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="path">路径顺序</SelectItem><SelectItem value="smallest-first">图片最少优先</SelectItem><SelectItem value="deepest-first">最深目录优先</SelectItem></SelectContent>
          </Select>
        </Field>
      </> : null}
    </div>
  )
}

function SchemaOptionField({ data, definition, patch, language }: KisakiView & { definition: KisakiOptionDefinition }) {
  const value = data[definition.id as keyof KisakiCardState] ?? definition.defaultValue
  const label = definition.label[language]
  if (definition.kind === "boolean") return <SwitchLine label={label} checked={Boolean(value)} onChange={(checked) => patch({ [definition.id]: checked } as Partial<KisakiCardState>)} />
  if (definition.kind === "number")
    return (
      <Field label={label}>
        <Input
          type="number"
          min={definition.min}
          max={definition.max}
          step={definition.step}
          value={String(value)}
          onChange={(event) =>
            patch({
              [definition.id]: event.currentTarget.value
            } as Partial<KisakiCardState>)
          }
        />
      </Field>
    )
  if (definition.kind === "text")
    return (
      <Field label={label}>
        <Input
          aria-label={label}
          value={String(value)}
          onChange={(event) => patch({ [definition.id]: event.currentTarget.value } as Partial<KisakiCardState>)}
        />
      </Field>
    )
  return (
    <Field label={label}>
      <Select value={String(value)} onValueChange={(next) => patch({ [definition.id]: next } as Partial<KisakiCardState>)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {definition.choices?.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label ?? choice.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function ResultTable(props: KisakiView) {
  const imageComparison = props.tool === "similar-images" ? {
    groups: props.result?.groups ?? [],
    state: props.imageComparison,
    open: props.openImageComparison,
    close: props.closeImageComparison,
    setMode: props.setImageComparisonMode,
    setColorCoding: props.setImageComparisonColorCoding,
    setTarget: props.setImageComparisonTarget,
    setSwipe: props.setImageComparisonSwipe,
    setOpacity: props.setImageComparisonOpacity,
  } : undefined
  const table = <KisakiResultTable tool={props.tool} groups={props.filterResult.groups} running={props.running} phase={props.data.phase} statusMessage={props.data.progressText} filterText={props.filterText} externalFiltering selectedPaths={props.selectedPaths} musicCheckType={props.data.musicCheckType} musicMaximumDifference={props.data.musicMaximumDifference} musicMinimumFragmentDuration={props.data.musicMinimumFragmentDuration} musicCompareFingerprintsOnlyWithSimilarTitles={props.data.musicCompareFingerprintsOnlyWithSimilarTitles} previewPanelEnabled={props.previewPanelEnabled} thumbnailEnabled={props.thumbnailEnabled} reversePathDisplay={props.data.reversePathDisplay} wrapText={props.data.tableWrapText} getFileUrl={props.getFileUrl} imageComparison={imageComparison} onCopyText={props.copyText} onCopyFiles={props.copyFiles} onOpenPath={props.openPath} onRevealPath={props.revealPath} onFilterTextChange={props.setFilterText} onPreviewPanelEnabledChange={props.setPreviewPanelEnabled} onRetry={props.executeScan} onSelectionChange={props.setSelectedPaths} />
  if (props.tool !== "similar-images" || props.data.similarImagesMode === "simiu-sets") return table
  return <div className="flex min-h-0 min-w-0 flex-col gap-1"><Tabs value={props.similarImagesViewMode} onValueChange={(value) => props.setSimilarImagesViewMode(value as KisakiSimilarImagesViewMode)}><TabsList className="grid w-52 grid-cols-2"><TabsTrigger value="images">{props.t("views.images", "图片")}</TabsTrigger><TabsTrigger value="folders">{props.t("views.folders", "文件夹")} <Badge variant="outline">{props.result?.similarFolders?.length ?? 0}</Badge></TabsTrigger></TabsList></Tabs><div className="min-h-0 min-w-0 flex-1 overflow-hidden">{props.similarImagesViewMode === "folders" ? <KisakiSimilarFoldersView folders={props.result?.similarFolders ?? []} filterText={props.filterText} getFileUrl={props.getFileUrl} onCopyText={props.copyText} onOpenPath={props.openPath} onRevealPath={props.revealPath} /> : table}</div></div>
}

function AnalysisPanel(props: KisakiView) {
  const stats = props.result
  return (
    <section className="flex min-h-0 flex-col rounded-md border bg-card">
      <SectionHeader
        icon={Search}
        title={props.t("sections.analysisOperations", "分析与操作")}
        action={
          props.canResizeWorkspace ? (
            <Button
              aria-label={props.t("workspace.minimizeAnalysis", "最小化分析与操作")}
              size="icon-xs"
              variant="ghost"
              onClick={() =>
                props.setWorkspaceLayout(
                  updateKisakiWorkspaceLayout(props.workspaceLayout, {
                    analysisPanelMinimized: true
                  })
                )
              }
            >
              <PanelRightClose />
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-px border-b bg-border">
        <Metric label={props.t("metrics.files", "文件")} value={String(stats?.fileCount ?? 0)} />
        <Metric label={props.t("metrics.groups", "分组")} value={String(stats?.groupCount ?? 0)} />
        <Metric label={props.t("metrics.totalSize", "总大小")} value={formatBytes(stats?.totalBytes ?? 0)} />
        <Metric label={props.t("metrics.reclaimable", "可回收")} value={formatBytes(stats?.reclaimableBytes ?? 0)} accent />
      </div>
      <KisakiCardTabs activeId={props.data.analysisPanelTab} layout={props.cardLayout} panel="analysis" onActiveChange={(analysisPanelTab) => props.patch({ analysisPanelTab })} renderCard={(id) => <KisakiCardContent id={id} props={props} />} />
    </section>
  )
}

export { AlgorithmFields, AnalysisPanel, ResultTable, SourcePanel }
